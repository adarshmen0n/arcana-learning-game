"""HTTP API for ARCANA. Students are the only users: each has a private account, private games, and a personal
performance record that drives how the game adapts to them. No teachers, no classes."""
import base64
import collections
import json
import re
import time

import config
import db
import arc
import hero
import mail
import student
import remedial
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


EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[A-Za-z]{2,}$")
COMMON = {"password", "password1", "12345678", "123456789", "qwertyuiop", "iloveyou1", "11111111", "abcd1234", "welcome1", "letmein123"}


def public_user(u):
    if not u:
        return None
    email = u["email"] if "email" in u.keys() else None
    return {"username": u["username"], "gender": u["gender"], "email": email, "admin": bool(email and email.lower() in config.ADMIN_EMAILS),
            "hasPassword": u["pw_hash"].startswith("scrypt$")}


def check_password_rules(pw, username="", email=""):
    if not (8 <= len(pw) <= 200):
        raise Err(400, "Use a password of at least 8 characters.")
    low = pw.lower()
    if low in COMMON or low == username.lower() or (email and low == email.split("@")[0].lower()):
        raise Err(400, "That password is too easy to guess. Choose a different one.")
    if len(set(pw)) < 4:
        raise Err(400, "That password is too easy to guess. Choose a different one.")


# ----------------------------------------------------------------------------- account
def register(r):
    limit(("reg", r.ip), 12, 3600)
    name, pw = clean(r.body.get("username"), 20), str(r.body.get("password") or "")
    email = clean(r.body.get("email"), 254).lower()
    if not USER.match(name):
        raise Err(400, "Display name: 3 to 20 letters, numbers, dots, dashes or underscores.")
    if not EMAIL.match(email):
        raise Err(400, "Enter a valid email address.")
    if not r.body.get("acceptTerms"):
        raise Err(400, "Please accept the Terms of Service and Privacy Policy to create an account.")
    check_password_rules(pw, name, email)
    if db.email_taken(email):
        raise Err(409, "An account with that email already exists. Try logging in.")
    if db.username_taken(name):
        raise Err(409, "That display name is taken. Pick another one.")
    uid = db.create_user(name, pw, r.body.get("gender"), email)
    if not uid:
        raise Err(409, "That email or display name is already in use.")
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


def hero_get(r):
    return hero.view(r.need())


def hero_upgrade(r):
    u = r.need()
    limit(("hero", u["id"]), 60, 600)
    out, err = hero.upgrade(u, clean(r.body.get("id"), 20))
    if err:
        raise Err(400, err)
    return out


def hero_equip(r):
    u = r.need()
    ids = [clean(x, 20) for x in (r.body.get("enchants") or [])][:5] if isinstance(r.body.get("enchants"), list) else []
    return hero.equip(u, ids)


def hero_earn(r):
    u = r.need()
    limit(("earn", u["id"]), 40, 600)
    try:
        sh, ki = int(r.body.get("shards") or 0), int(r.body.get("kills") or 0)
    except (TypeError, ValueError):
        raise Err(400, "Bad numbers.")
    return hero.earn(u, sh, ki)


def remedial_start(r):
    u = r.need()
    limit(("remedial", u["id"]), 12, 3600)
    gid, cid = clean(r.body.get("gameId"), 40), clean(r.body.get("concept"), 40)
    if not db.can_use_game(u["id"], gid):
        raise Err(403, "That game is not yours.")
    return remedial.start(u, gid, cid)


def remedial_status(r):
    u = r.need()
    gid, cid = r.q1("game"), r.q1("concept")
    if not db.can_use_game(u["id"], gid):
        raise Err(403, "That game is not yours.")
    return remedial.status(u, gid, cid)


def report_question(r):
    u = r.need()
    limit(("report", u["id"]), 20, 3600)
    gid, qid, why = clean(r.body.get("gameId"), 40), clean(r.body.get("qid"), 40), clean(r.body.get("reason"), 200)
    if not db.can_use_game(u["id"], gid) or not qid:
        raise Err(403, "That question is not yours.")
    db.add_report(u["id"], gid, qid, why)
    db.add_ticket(u["id"], u["email"] or "unknown", "bug", "Question report " + qid, f"Game {gid}, question {qid}. {why}\n{clean(r.body.get('prompt'), 300)}")
    return {"ok": True}


# ----------------------------------------------------------------------------- Arc Search (AI assistant)
def arc_get(r):
    u = r.need()
    gid = r.q1("game")
    if gid and not db.can_use_game(u["id"], gid):
        raise Err(403, "That game is not yours.")
    return {"messages": arc.history(u["id"], gid), "usedToday": arc.used_today(u["id"]), "dailyLimit": arc.DAILY_LIMIT, "ai": llm.available()}


def arc_post(r):
    u = r.need()
    limit(("arc", u["id"]), 30, 600)
    msg = str(r.body.get("message") or "").strip()[:2000]
    gid = clean(r.body.get("gameId"), 40)
    if len(msg) < 2:
        raise Err(400, "Type a question first.")
    if gid and not db.can_use_game(u["id"], gid):
        raise Err(403, "That game is not yours.")
    if arc.used_today(u["id"]) >= arc.DAILY_LIMIT:
        raise Err(429, f"You have used today's {arc.DAILY_LIMIT} Arc Search questions. They refresh tomorrow.")
    if not llm.available():
        raise Err(503, "Arc Search needs an AI key on the server.")
    ctx = r.body.get("context") if isinstance(r.body.get("context"), dict) else None
    try:
        return arc.ask(u, msg, gid or None, ctx)
    except llm.LLMError as e:
        raise Err(503, "Arc Search is busy right now (" + str(e)[:120] + "). Try again in a minute.")


def arc_delete(r):
    u = r.need()
    arc.clear(u["id"], r.q1("game"))
    return {"ok": True}


def game_rebuild(r, gid):
    """Build a fresh version of an existing game from its stored source, using the current (teaching-rich) generator."""
    u = r.need()
    if not db.q("SELECT 1 FROM games WHERE id=? AND owner_id=?", (gid, u["id"]), one=True):
        raise Err(404, "Game not found.")
    src = db.get_source(gid)
    if not src:
        raise Err(400, "This game was made before ARCANA kept the original text. Upload the file again to rebuild it.")
    title = (db.q("SELECT title FROM games WHERE id=?", (gid,), one=True) or {"title": "notes"})["title"]
    r.body = {"text": src, "filename": title[:100] + ".txt"}
    return job_create(r)


def coach_get(r):
    import coach
    return coach.advice(r.need())


def login(r):
    name = clean(r.body.get("login") or r.body.get("username") or r.body.get("email"), 254).lower()
    limit(("login", r.ip, name), 10, 600)
    limit(("login-name", name), 20, 3600)
    u = db.login(name, str(r.body.get("password") or ""))
    if not u:
        raise Err(401, "Wrong email, username or password.")
    r.cookie(db.new_session(u["id"]))
    return {"user": public_user(u)}


def password_change(r):
    u = r.need()
    limit(("pw", u["id"]), 8, 3600)
    new = str(r.body.get("new") or "")
    if u["pw_hash"].startswith("scrypt$") and not db.check_password(str(r.body.get("current") or ""), u["pw_hash"]):
        raise Err(403, "Your current password is not right.")
    check_password_rules(new, u["username"], u["email"] or "")
    db.set_password(u["id"], new)
    db.drop_sessions(u["id"], keep=r.cookies.get("arcana_session"))
    return {"ok": True}


def forgot(r):
    """Always answers the same way so nobody can test which emails have accounts."""
    limit(("forgot", r.ip), 6, 3600)
    email = clean(r.body.get("email"), 254).lower()
    if not mail.configured():
        raise Err(503, "Password reset by email is not switched on yet. Use Help and support and we will help you.")
    if EMAIL.match(email):
        u = db.q("SELECT * FROM users WHERE lower(email)=lower(?)", (email,), one=True)
        if u and u["pw_hash"].startswith("scrypt$"):
            tok = db.make_reset(u["id"])
            base = config.PUBLIC_URL or "http://127.0.0.1:5181"
            mail.send(email, "Reset your ARCANA AI password", f"Hi {u['username']},\n\nUse this link within 60 minutes to choose a new password:\n{base}/?reset={tok}\n\nIf you did not ask for this, ignore this email; your password stays the same.\n\nARCANA AI")
    return {"ok": True}


def reset(r):
    limit(("reset", r.ip), 10, 3600)
    pw = str(r.body.get("password") or "")
    uid = db.use_reset(str(r.body.get("token") or "")[:100])
    if not uid:
        raise Err(400, "This reset link is invalid or has expired. Ask for a new one.")
    u = db.q("SELECT * FROM users WHERE id=?", (uid,), one=True)
    check_password_rules(pw, u["username"], u["email"] or "")
    db.set_password(uid, pw)
    db.drop_sessions(uid)
    r.cookie(db.new_session(uid))
    return {"user": public_user(u)}


def logout_all(r):
    u = r.need()
    db.drop_sessions(u["id"])
    r.cookie("", clear=True)
    return {"ok": True}


def export(r):
    u = r.need()
    limit(("export", u["id"]), 5, 3600)
    return db.export_user(u["id"])


# ----------------------------------------------------------------------------- support
CATEGORIES = ("question", "bug", "account", "billing", "feedback", "other")


def support_create(r):
    limit(("ticket", r.ip), 6, 3600)
    u = r.user
    email = (u["email"] if u and u["email"] else clean(r.body.get("email"), 254)).lower()
    subject, message = clean(r.body.get("subject"), 120), str(r.body.get("message") or "").strip()[:4000]
    cat = r.body.get("category") if r.body.get("category") in CATEGORIES else "question"
    if not EMAIL.match(email):
        raise Err(400, "Enter an email address so we can reply.")
    if len(subject) < 3 or len(message) < 10:
        raise Err(400, "Add a subject and a message of at least a sentence.")
    tid = db.add_ticket(u["id"] if u else None, email, cat, subject, message)
    for admin in config.ADMIN_EMAILS:
        mail.send(admin, f"[ARCANA support #{tid}] {subject}", f"From: {email}\nCategory: {cat}\n\n{message}")
    return {"ok": True, "id": tid}


def support_mine(r):
    u = r.need()
    return [dict(t) for t in db.q("SELECT id,category,subject,status,created FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 50", (u["id"],))]


def admin_need(r):
    u = r.need()
    if not (u["email"] and u["email"].lower() in config.ADMIN_EMAILS):
        raise Err(403, "Not allowed.")
    return u


def admin_tickets(r):
    admin_need(r)
    return [dict(t) for t in db.q("SELECT t.*, u.username FROM tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY (t.status='open') DESC, t.id DESC LIMIT 200")]


def admin_ticket_set(r, tid):
    admin_need(r)
    st = r.body.get("status")
    if st not in ("open", "answered", "closed"):
        raise Err(400, "Bad status.")
    db.run("UPDATE tickets SET status=? WHERE id=?", (st, int(tid)))
    return {"ok": True}


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
    for g in db.q("SELECT * FROM games WHERE owner_id=? ORDER BY created DESC", (u["id"],)):
        p = db.q("SELECT * FROM progress WHERE user_id=? AND game_id=?", (u["id"], g["id"]), one=True)
        out.append({"id": g["id"], "title": g["title"], "created": g["created"], "hasSource": db.has_source(g["id"]),
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
    """A game may be used if it is the student's own or the student's game still being built."""
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
    try:
        opts["profile"] = student.build(u)           # the generator personalises to this student
    except Exception:
        pass
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
    if gid and not db.can_use_game(u["id"], gid):
        raise Err(403, "That game is not yours.")
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
    return {"llm": llm.available(), "model": llm.label(), "providers": llm.status(), "web": llm.has_web(), "mode": "ai" if llm.available() else "offline", "googleClientId": config.GOOGLE_CLIENT_ID or None, "mail": mail.configured()}


# ----------------------------------------------------------------------------- routing
ROUTES = [
    ("GET", r"/api/status", status), ("GET", r"/api/me", me),
    ("POST", r"/api/register", register), ("POST", r"/api/login", login), ("POST", r"/api/google", google_login), ("POST", r"/api/password", password_change), ("POST", r"/api/forgot", forgot), ("POST", r"/api/reset", reset), ("POST", r"/api/logout-all", logout_all), ("GET", r"/api/export", export),
    ("POST", r"/api/support", support_create), ("GET", r"/api/support", support_mine), ("GET", r"/api/admin/tickets", admin_tickets), ("POST", r"/api/admin/tickets/([0-9]+)", admin_ticket_set), ("GET", r"/api/coach", coach_get), ("GET", r"/api/arc", arc_get), ("POST", r"/api/arc", arc_post), ("DELETE", r"/api/arc", arc_delete), ("POST", r"/api/games/([a-z0-9]{4,40})/rebuild", game_rebuild), ("POST", r"/api/remedial", remedial_start), ("GET", r"/api/remedial", remedial_status), ("POST", r"/api/report", report_question), ("GET", r"/api/hero", hero_get), ("POST", r"/api/hero/upgrade", hero_upgrade), ("POST", r"/api/hero/equip", hero_equip), ("POST", r"/api/hero/earn", hero_earn), ("POST", r"/api/logout", logout),
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
