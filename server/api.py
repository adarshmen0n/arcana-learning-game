"""HTTP API for ARCANA. Students are the only users: each has a private account, private games, and a personal
performance record that drives how the game adapts to them. No teachers, no classes."""
import base64
import collections
import json
import re
import time

import config
import db
import llm
import pipeline
import roadmap

USER = re.compile(r"^[A-Za-z0-9_.\-]{3,20}$")
_hits = collections.defaultdict(collections.deque)


class Err(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code, self.msg = code, msg


def limit(key, n, per):
    now, dq = time.time(), _hits[key]
    while dq and dq[0] < now - per:
        dq.popleft()
    if len(dq) >= n:
        raise Err(429, "Too many attempts. Please wait a little and try again.")
    dq.append(now)


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


class Req:
    def __init__(self, method, path, query, body, headers, ip):
        self.method, self.path, self.query, self.body, self.headers, self.ip = method, path, query, body if isinstance(body, dict) else {}, headers, ip
        self.cookies = {}
        for part in (headers.get("Cookie") or "").split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                self.cookies[k] = v
        self.set_cookie = None
        self._user = False

    @property
    def user(self):
        if self._user is False:
            self._user = db.user_for(self.cookies.get("arcana_session"))
        return self._user

    def need(self):
        if not self.user:
            raise Err(401, "Please log in.")
        return self.user

    def cookie(self, token, clear=False):
        flags = "HttpOnly; SameSite=Lax; Path=/" + ("; Secure" if config.SECURE_COOKIE else "")
        self.set_cookie = f"arcana_session={'' if clear else token}; {flags}; Max-Age={0 if clear else db.SESSION_DAYS * 86400}"

    def q1(self, name):
        return clean(self.query.get(name, [""])[0], 60)


def public_user(u):
    return {"username": u["username"], "gender": u["gender"], "email": u["email"] if "email" in u.keys() else None} if u else None


# ----------------------------------------------------------------------------- account
def register(r):
    limit(("reg", r.ip), 12, 3600)
    name, pw = clean(r.body.get("username"), 20), str(r.body.get("password") or "")
    if not USER.match(name):
        raise Err(400, "Username: 3 to 20 letters, numbers, dots, dashes or underscores.")
    if not (8 <= len(pw) <= 200):
        raise Err(400, "Use a password of at least 8 characters.")
    uid = db.create_user(name, pw, r.body.get("gender"))
    if not uid:
        raise Err(409, "That username is taken. Pick another one.")
    r.cookie(db.new_session(uid))
    return {"user": public_user(db.q("SELECT * FROM users WHERE id=?", (uid,), one=True))}


def google_login(r):
    """Sign in with a Google ID token (Google Identity Services). The token is verified with Google and must be issued for our client id."""
    if not config.GOOGLE_CLIENT_ID:
        raise Err(404, "Google sign-in is not set up on this server.")
    limit(("google", r.ip), 20, 600)
    tok = str(r.body.get("credential") or "")[:4096]
    if len(tok) < 100:
        raise Err(400, "Missing Google credential.")
    import urllib.parse
    import urllib.request
    try:
        with urllib.request.urlopen("https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(tok), timeout=10) as resp:
            info = json.loads(resp.read())
    except Exception:
        raise Err(401, "Google did not accept that sign-in.")
    if info.get("aud") != config.GOOGLE_CLIENT_ID or info.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or str(info.get("email_verified")).lower() != "true":
        raise Err(401, "Google did not accept that sign-in.")
    email = str(info.get("email") or "").lower()
    u = db.google_user(str(info["sub"]), email, email.split("@")[0])
    if not u:
        raise Err(500, "Could not create your account.")
    r.cookie(db.new_session(u["id"]))
    return {"user": public_user(u)}


def coach_get(r):
    import coach
    return coach.advice(r.need())


def login(r):
    name = clean(r.body.get("username"), 20).lower()
    limit(("login", r.ip, name), 10, 600)
    u = db.login(name, str(r.body.get("password") or ""))
    if not u:
        raise Err(401, "Wrong username or password.")
    r.cookie(db.new_session(u["id"]))
    return {"user": public_user(u)}


def logout(r):
    if r.cookies.get("arcana_session"):
        db.drop_session(r.cookies["arcana_session"])
    r.cookie("", clear=True)
    return {"ok": True}


def me(r):
    return {"user": public_user(r.user)}


def profile_set(r):
    u = r.need()
    g = r.body.get("gender")
    if g in ("m", "f"):
        db.run("UPDATE users SET gender=? WHERE id=?", (g, u["id"]))
    return {"ok": True}


def _drop_script(gid):
    sid = re.sub(r"[^a-z0-9]", "", gid.lower())
    db.delete_script(sid)
    f = pipeline.SCRIPTS / (sid + ".json")
    if f.exists():
        f.unlink()


def account_delete(r):
    u = r.need()
    for g in db.q("SELECT id FROM games WHERE owner_id=?", (u["id"],)):
        _drop_script(g["id"])
    db.run("DELETE FROM users WHERE id=?", (u["id"],))
    r.cookie("", clear=True)
    return {"ok": True}


# ----------------------------------------------------------------------------- games
def games_list(r):
    u = r.need()
    out = []
    for g in db.q("SELECT * FROM games WHERE owner_id IS NULL OR owner_id=? ORDER BY (owner_id IS NULL) DESC, created DESC", (u["id"],)):
        p = db.q("SELECT * FROM progress WHERE user_id=? AND game_id=?", (u["id"], g["id"]), one=True)
        out.append({"id": g["id"], "title": g["title"], "starter": g["owner_id"] is None, "created": g["created"],
                    "progress": {"chapter": p["chapter_idx"], "score": p["score"], "finished": bool(p["finished"])} if p else None})
    return out


def game_delete(r, gid):
    u = r.need()
    if not db.q("SELECT 1 FROM games WHERE id=? AND owner_id=?", (gid, u["id"]), one=True):
        raise Err(404, "Game not found.")
    db.run("DELETE FROM games WHERE id=?", (gid,))
    db.run("DELETE FROM progress WHERE user_id=? AND game_id=?", (u["id"], gid))
    db.run("DELETE FROM mastery WHERE user_id=? AND game_id=?", (u["id"], gid))
    db.run("DELETE FROM events WHERE user_id=? AND game_id=?", (u["id"], gid))
    _drop_script(gid)
    return {"ok": True}


def usable(u, gid):
    """A game may be used if it is the shared starter, the student's own, or the student's game still being built."""
    if db.can_use_game(u["id"], gid):
        return True
    job = pipeline.JOBS.get(gid)
    return bool(job and job.opts.get("owner") == u["id"])


def script_get(r, sid):
    u = r.need()
    if not usable(u, sid):
        raise Err(404, "Game not found.")
    s = pipeline.load_script(sid)
    if not s:
        raise Err(404, "Game not found.")
    return s


def job_create(r):
    u = r.need()
    limit(("job", u["id"]), 12, 3600)
    busy = sum(1 for j in pipeline.JOBS.values() if j.opts.get("owner") == u["id"] and j.status in ("queued", "running"))
    if busy >= 2:
        raise Err(429, "Two games are already being built for you. Wait for one to finish.")
    if db.games_today(u["id"]) + busy >= config.MAX_GAMES_PER_DAY:
        raise Err(429, f"Daily limit reached ({config.MAX_GAMES_PER_DAY} new games per day). Try again tomorrow.")
    filename = clean(r.body.get("filename") or "notes.txt", 120)
    opts = {"offline": bool(r.body.get("offline")), "owner": u["id"]}
    if r.body.get("text"):
        import ingest
        job = pipeline.start(filename, text=str(r.body["text"])[:ingest.MAX_CHARS], opts=opts)
    elif r.body.get("data"):
        try:
            data = base64.b64decode(r.body["data"], validate=False)
        except Exception:
            raise Err(400, "Could not read the upload.")
        job = pipeline.start(filename, data=data, opts=opts)
    else:
        raise Err(400, "Send a file or some text.")
    return {"id": job.id, "mode": job.mode}


def job_get(r, jid):
    u = r.need()
    job = pipeline.JOBS.get(jid)
    if not job or job.opts.get("owner") != u["id"]:
        raise Err(404, "Unknown job.")
    return job.public()


# ----------------------------------------------------------------------------- learning loop
def events(r):
    u = r.need()
    limit(("ev", u["id"]), 120, 60)
    gid = clean(r.body.get("gameId"), 40)
    if not usable(u, gid):
        raise Err(403, "That game is not yours.")
    rows = []
    for e in (r.body.get("events") or [])[:200]:
        qid = clean(e.get("qid"), 40)
        if qid:
            rows.append({"qid": qid, "concept": clean(e.get("concept"), 40), "correct": bool(e.get("correct")), "kind": clean(e.get("kind"), 20), "chapter": clean(e.get("chapter"), 40),
                         "difficulty": max(1, min(3, int(e.get("difficulty") or 2))), "ms": max(0, min(600000, int(e.get("ms") or 0))), "hints": max(0, min(5, int(e.get("hints") or 0)))})
    return {"saved": db.apply_events(u["id"], gid, rows) if rows else 0}


def progress_get(r):
    u = r.need()
    p = db.q("SELECT * FROM progress WHERE user_id=? AND game_id=?", (u["id"], r.q1("game")), one=True)
    return {"progress": {"chapter": p["chapter_idx"], "score": p["score"], "finished": bool(p["finished"])} if p else None}


def progress_set(r):
    u = r.need()
    gid = clean(r.body.get("gameId"), 40)
    if not usable(u, gid):
        raise Err(403, "That game is not yours.")
    ch, score = max(0, min(50, int(r.body.get("chapterIdx") or 0))), max(0, min(10 ** 7, int(r.body.get("score") or 0)))
    db.run("INSERT INTO progress(user_id,game_id,chapter_idx,score,finished,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,game_id) DO UPDATE SET "
           "chapter_idx=CASE WHEN excluded.chapter_idx>progress.chapter_idx THEN excluded.chapter_idx ELSE progress.chapter_idx END, "
           "score=CASE WHEN excluded.score>progress.score THEN excluded.score ELSE progress.score END, "
           "finished=CASE WHEN excluded.finished>progress.finished THEN excluded.finished ELSE progress.finished END, updated=excluded.updated",
           (u["id"], gid, ch, score, 1 if r.body.get("finished") else 0, int(time.time())))
    return {"ok": True}


def adapt(r):
    u = r.need()
    gid = r.q1("game")
    return roadmap.adaptation(u, gid or None)


def stats(r):
    return roadmap.stats(r.need())


def roadmap_get(r):
    u = r.need()
    out = roadmap.build(u)
    out["stats"] = roadmap.stats(u)
    a = roadmap.adaptation(u)
    out["adaptation"] = {k: a[k] for k in ("difficulty", "style", "maxHearts", "why")}
    return out


def status(r):
    return {"llm": llm.available(), "model": llm.label(), "providers": llm.status(), "web": llm.has_web(), "mode": "ai" if llm.available() else "offline", "googleClientId": config.GOOGLE_CLIENT_ID or None}


# ----------------------------------------------------------------------------- routing
ROUTES = [
    ("GET", r"/api/status", status), ("GET", r"/api/me", me),
    ("POST", r"/api/register", register), ("POST", r"/api/login", login), ("POST", r"/api/google", google_login), ("GET", r"/api/coach", coach_get), ("POST", r"/api/logout", logout),
    ("POST", r"/api/profile", profile_set), ("DELETE", r"/api/account", account_delete),
    ("GET", r"/api/games", games_list), ("DELETE", r"/api/games/([a-z0-9]{4,40})", game_delete),
    ("GET", r"/api/scripts/([a-z0-9]+)", script_get),
    ("POST", r"/api/jobs", job_create), ("GET", r"/api/jobs/([a-z0-9]+)", job_get),
    ("POST", r"/api/events", events), ("GET", r"/api/progress", progress_get), ("POST", r"/api/progress", progress_set),
    ("GET", r"/api/adapt", adapt), ("GET", r"/api/stats", stats), ("GET", r"/api/roadmap", roadmap_get),
]


def dispatch(req: Req):
    """Returns (status, json-able). Errors become {error}; details never reach the browser."""
    try:
        for method, pat, fn in ROUTES:
            if method == req.method:
                m = re.fullmatch(pat, req.path)
                if m:
                    return 200, fn(req, *m.groups())
        return 404, {"error": "Not found."}
    except Err as e:
        return e.code, {"error": e.msg}
    except (ValueError, TypeError, KeyError, AttributeError):
        return 400, {"error": "Bad request."}
    except Exception:
        import traceback
        traceback.print_exc()
        return 500, {"error": "Server error."}
