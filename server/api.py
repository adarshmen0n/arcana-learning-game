"""HTTP API: teachers, classes, students, assignments, progress, reports, and the upload jobs.
Students never give an email or password: they join with a class code and a nickname, and get a random token."""
import base64
import collections
import json
import re
import time

import config
import db
import llm
import pipeline

EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")
NICK = re.compile(r"^[\w \-]{2,20}$", re.U)
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


class Req:
    def __init__(self, method, path, query, body, headers, ip):
        self.method, self.path, self.query, self.body, self.headers, self.ip = method, path, query, body or {}, headers, ip
        self.cookies = {}
        for part in (headers.get("Cookie") or "").split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                self.cookies[k] = v
        self.set_cookie = None
        self._teacher = False

    @property
    def teacher(self):
        if self._teacher is False:
            self._teacher = db.teacher_for(self.cookies.get("arcana_session"))
        return self._teacher

    def need_teacher(self):
        if not self.teacher:
            raise Err(401, "Please log in as a teacher.")
        return self.teacher

    def student(self):
        s = db.student_for(self.headers.get("X-Student-Token") or (self.body.get("token") if isinstance(self.body, dict) else None))
        if not s:
            raise Err(401, "Join a class first.")
        return s

    def cookie(self, token, clear=False):
        flags = "HttpOnly; SameSite=Lax; Path=/" + ("; Secure" if config.SECURE_COOKIE else "")
        self.set_cookie = f"arcana_session={'' if clear else token}; {flags}; Max-Age={0 if clear else db.SESSION_DAYS * 86400}"


def clean(s, n):
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


# ----------------------------------------------------------------------------- teachers
def register(r):
    limit(("reg", r.ip), 10, 3600)
    email, name, pw = clean(r.body.get("email"), 254), clean(r.body.get("name"), 60), str(r.body.get("password") or "")
    if not EMAIL.match(email):
        raise Err(400, "Enter a valid email address.")
    if not name:
        raise Err(400, "Enter your name.")
    if not (8 <= len(pw) <= 200):
        raise Err(400, "Use a password of at least 8 characters.")
    tid = db.create_teacher(email, name, pw)
    if not tid:
        raise Err(409, "An account with this email already exists. Log in instead.")
    r.cookie(db.new_session(tid))
    return {"teacher": {"name": name, "email": email.lower()}}


def login(r):
    email = clean(r.body.get("email"), 254).lower()
    limit(("login", r.ip, email), 10, 600)
    t = db.login(email, str(r.body.get("password") or ""))
    if not t:
        raise Err(401, "Wrong email or password.")
    r.cookie(db.new_session(t["id"]))
    return {"teacher": {"name": t["name"], "email": t["email"]}}


def logout(r):
    if r.cookies.get("arcana_session"):
        db.drop_session(r.cookies["arcana_session"])
    r.cookie("", clear=True)
    return {"ok": True}


def me(r):
    t = r.teacher
    return {"teacher": {"name": t["name"], "email": t["email"]} if t else None, "hosted": config.HOSTED}


# ----------------------------------------------------------------------------- classes + games (teacher)
def classes_list(r):
    t = r.need_teacher()
    out = []
    for c in db.q("SELECT * FROM classes WHERE teacher_id=? ORDER BY created DESC", (t["id"],)):
        n = db.q("SELECT COUNT(*) n FROM students WHERE class_id=?", (c["id"],), one=True)["n"]
        games = [{"id": g["id"], "title": g["title"]} for g in db.q("SELECT g.id,g.title FROM assignments a JOIN games g ON g.id=a.game_id WHERE a.class_id=? ORDER BY a.created", (c["id"],))]
        out.append({"id": c["id"], "name": c["name"], "code": c["code"], "students": n, "games": games})
    return out


def class_create(r):
    t = r.need_teacher()
    name = clean(r.body.get("name"), 60)
    if not name:
        raise Err(400, "Give the class a name.")
    if db.q("SELECT COUNT(*) n FROM classes WHERE teacher_id=?", (t["id"],), one=True)["n"] >= 50:
        raise Err(400, "You have reached the limit of 50 classes.")
    cid = db.new_class(t["id"], name)
    return {"id": cid}


def own_class(r, cid):
    c = db.class_owned(r.need_teacher()["id"], int(cid))
    if not c:
        raise Err(404, "Class not found.")
    return c


def class_delete(r, cid):
    own_class(r, cid)
    db.run("DELETE FROM classes WHERE id=?", (int(cid),))
    return {"ok": True}


def teacher_games(r):
    t = r.need_teacher()
    return [{"id": g["id"], "title": g["title"], "created": g["created"]} for g in db.q("SELECT * FROM games WHERE teacher_id=? ORDER BY created DESC", (t["id"],))]


def game_delete(r, gid):
    t = r.need_teacher()
    g = db.q("SELECT * FROM games WHERE id=? AND teacher_id=?", (gid, t["id"]), one=True)
    if not g:
        raise Err(404, "Game not found.")
    db.run("DELETE FROM games WHERE id=?", (gid,))
    f = pipeline.SCRIPTS / (re.sub(r"[^a-z0-9]", "", gid.lower()) + ".json")
    if f.exists():
        f.unlink()
    return {"ok": True}


def assign(r, cid):
    c = own_class(r, cid)
    gid = clean(r.body.get("gameId"), 40)
    g = db.q("SELECT * FROM games WHERE id=? AND teacher_id=?", (gid, r.teacher["id"]), one=True)
    if not g:
        raise Err(404, "Game not found.")
    if r.body.get("on", True):
        db.run("INSERT OR IGNORE INTO assignments(class_id,game_id,created) VALUES(?,?,?)", (c["id"], gid, int(time.time())))
    else:
        db.run("DELETE FROM assignments WHERE class_id=? AND game_id=?", (c["id"], gid))
    return {"ok": True}


def student_delete(r, cid, sid):
    c = own_class(r, cid)
    db.run("DELETE FROM students WHERE id=? AND class_id=?", (int(sid), c["id"]))
    return {"ok": True}


def report(r, cid):
    c = own_class(r, cid)
    gid = clean(r.query.get("game", [""])[0], 40)
    if not db.q("SELECT 1 FROM assignments WHERE class_id=? AND game_id=?", (c["id"], gid), one=True):
        raise Err(404, "That game is not assigned to this class.")
    script = pipeline.load_script(gid) or {"chapters": [], "title": gid}
    qinfo, cname = {}, {}
    for ch in script["chapters"]:
        for k in ch.get("concepts", []):
            cname[k["id"]] = k["name"]
        for s in ch["scenes"]:
            for qq in ([s["question"]] if "question" in s else s.get("questions", [])):
                qinfo[qq["id"]] = qq
    total_ch = len(script["chapters"]) + 1
    students = []
    stats = {x["student_id"]: x for x in db.q("SELECT student_id, COUNT(*) n, SUM(correct) c FROM events WHERE game_id=? GROUP BY student_id", (gid,))}
    for s in db.q("SELECT s.id,s.nickname,s.last_seen,p.chapter_idx,p.score,p.finished FROM students s LEFT JOIN progress p ON p.student_id=s.id AND p.game_id=? WHERE s.class_id=? ORDER BY s.nickname COLLATE NOCASE", (gid, c["id"])):
        st = stats.get(s["id"])
        students.append({"id": s["id"], "nickname": s["nickname"], "answered": st["n"] if st else 0, "accuracy": round(100 * st["c"] / st["n"]) if st and st["n"] else None,
                         "score": s["score"] or 0, "chapter": min(total_ch, (s["chapter_idx"] or 0)), "finished": bool(s["finished"]), "last_seen": s["last_seen"]})
    ids = [s["id"] for s in students] or [-1]
    mark = ",".join("?" * len(ids))
    concepts = [{"id": x["concept"], "name": cname.get(x["concept"], x["concept"] or "Other"), "attempts": x["n"], "accuracy": round(100 * x["c"] / x["n"])}
                for x in db.q(f"SELECT concept, COUNT(*) n, SUM(correct) c FROM events WHERE game_id=? AND student_id IN ({mark}) GROUP BY concept ORDER BY (1.0*SUM(correct)/COUNT(*)) ASC", (gid, *ids))]
    hard = []
    for x in db.q(f"SELECT qid, COUNT(*) n, SUM(correct) c FROM events WHERE game_id=? AND student_id IN ({mark}) GROUP BY qid HAVING COUNT(*)>=2 ORDER BY (1.0*SUM(correct)/COUNT(*)) ASC LIMIT 8", (gid, *ids)):
        qq = qinfo.get(x["qid"])
        if qq:
            hard.append({"prompt": qq["prompt"], "answer": qq["options"][qq["correctIndex"]], "attempts": x["n"], "accuracy": round(100 * x["c"] / x["n"])})
    tot = sum(s["answered"] for s in students)
    right = sum(round(s["answered"] * (s["accuracy"] or 0) / 100) for s in students)
    return {"game": {"id": gid, "title": script.get("title")}, "class": {"id": c["id"], "name": c["name"], "code": c["code"]}, "totalChapters": total_ch,
            "summary": {"students": len(students), "started": sum(1 for s in students if s["answered"]), "finished": sum(1 for s in students if s["finished"]), "accuracy": round(100 * right / tot) if tot else None},
            "students": students, "concepts": concepts, "hardest": hard}


# ----------------------------------------------------------------------------- students
def student_games(cls_id):
    return [{"id": g["id"], "title": g["title"]} for g in db.q("SELECT g.id,g.title FROM assignments a JOIN games g ON g.id=a.game_id WHERE a.class_id=? ORDER BY a.created", (cls_id,))]


def join(r):
    limit(("join", r.ip), 40, 600)
    code, nick = clean(r.body.get("code"), 12), clean(r.body.get("nickname"), 20)
    if not NICK.match(nick):
        raise Err(400, "Use a nickname of 2 to 20 letters or numbers.")
    res, err = db.join_class(code, nick, clean(r.body.get("token"), 80) or None)
    if err:
        raise Err(404 if "code" in err else 409, err)
    s, cls = res
    return {"token": s["token"], "nickname": s["nickname"], "className": cls["name"], "games": student_games(cls["id"])}


def student_my_games(r):
    s = r.student()
    cls = db.q("SELECT * FROM classes WHERE id=?", (s["class_id"],), one=True)
    prog = {p["game_id"]: p for p in db.q("SELECT * FROM progress WHERE student_id=?", (s["id"],))}
    games = student_games(s["class_id"])
    for g in games:
        p = prog.get(g["id"])
        g["progress"] = {"chapter": p["chapter_idx"], "score": p["score"], "finished": bool(p["finished"])} if p else None
    return {"nickname": s["nickname"], "className": cls["name"], "games": games}


def assigned(s, gid):
    return db.q("SELECT 1 FROM assignments WHERE class_id=? AND game_id=?", (s["class_id"], gid), one=True) is not None


def events(r):
    s = r.student()
    limit(("ev", s["id"]), 120, 60)
    gid = clean(r.body.get("gameId"), 40)
    if not assigned(s, gid):
        raise Err(403, "That game is not assigned to your class.")
    now, rows = int(time.time()), []
    for e in (r.body.get("events") or [])[:200]:
        qid = clean(e.get("qid"), 40)
        if qid:
            rows.append((s["id"], gid, clean(e.get("chapter"), 40), clean(e.get("kind"), 20), qid, clean(e.get("concept"), 40), 1 if e.get("correct") else 0, now))
    with db._lock:
        db.conn().executemany("INSERT INTO events(student_id,game_id,chapter,kind,qid,concept,correct,ts) VALUES(?,?,?,?,?,?,?,?)", rows)
    return {"saved": len(rows)}


def progress_get(r):
    s = r.student()
    gid = clean(r.query.get("game", [""])[0], 40)
    p = db.q("SELECT * FROM progress WHERE student_id=? AND game_id=?", (s["id"], gid), one=True)
    return {"progress": {"chapter": p["chapter_idx"], "score": p["score"], "finished": bool(p["finished"])} if p else None}


def progress_set(r):
    s = r.student()
    gid = clean(r.body.get("gameId"), 40)
    if not assigned(s, gid):
        raise Err(403, "That game is not assigned to your class.")
    ch, score = max(0, min(50, int(r.body.get("chapterIdx") or 0))), max(0, min(10 ** 7, int(r.body.get("score") or 0)))
    db.run("INSERT INTO progress(student_id,game_id,chapter_idx,score,finished,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,game_id) DO UPDATE SET chapter_idx=MAX(chapter_idx,excluded.chapter_idx), score=MAX(score,excluded.score), finished=MAX(finished,excluded.finished), updated=excluded.updated",
           (s["id"], gid, ch, score, 1 if r.body.get("finished") else 0, int(time.time())))
    return {"ok": True}


# ----------------------------------------------------------------------------- upload jobs + scripts
def job_create(r):
    limit(("job", r.ip), 12, 3600)
    t = r.teacher
    if config.HOSTED and not t:
        raise Err(401, "Log in as a teacher to create games.")
    if t and db.games_today(t["id"]) + sum(1 for j in pipeline.JOBS.values() if j.opts.get("owner") == t["id"] and j.status in ("queued", "running")) >= config.MAX_GAMES_PER_DAY:
        raise Err(429, f"Daily limit reached ({config.MAX_GAMES_PER_DAY} games per day). Try again tomorrow.")
    filename = clean(r.body.get("filename") or "notes.txt", 120)
    opts = {"offline": bool(r.body.get("offline")), "owner": t["id"] if t else None}
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
    job = pipeline.JOBS.get(jid)
    if not job:
        raise Err(404, "Unknown job.")
    return job.public()


def scripts_list(r):
    if config.HOSTED:
        t = r.need_teacher()
        return [{"id": g["id"], "title": g["title"], "chapters": 0, "mode": "ai", "modified": g["created"]} for g in db.q("SELECT * FROM games WHERE teacher_id=? ORDER BY created DESC", (t["id"],))]
    return pipeline.list_scripts()


def script_get(r, sid):
    s = pipeline.load_script(sid)
    if not s:
        raise Err(404, "Game not found.")
    return s


def status(r):
    return {"llm": llm.available(), "model": llm.label(), "providers": llm.status(), "web": llm.has_web(), "mode": "ai" if llm.available() else "offline", "hosted": config.HOSTED}


# ----------------------------------------------------------------------------- routing
ROUTES = [
    ("GET", r"/api/status", status), ("GET", r"/api/me", me),
    ("POST", r"/api/teacher/register", register), ("POST", r"/api/teacher/login", login), ("POST", r"/api/teacher/logout", logout),
    ("GET", r"/api/classes", classes_list), ("POST", r"/api/classes", class_create),
    ("DELETE", r"/api/classes/(\d+)", class_delete), ("POST", r"/api/classes/(\d+)/assign", assign),
    ("GET", r"/api/classes/(\d+)/report", report), ("DELETE", r"/api/classes/(\d+)/students/(\d+)", student_delete),
    ("GET", r"/api/teacher/games", teacher_games), ("DELETE", r"/api/games/([a-z0-9]{4,40})", game_delete),
    ("POST", r"/api/join", join), ("GET", r"/api/student/games", student_my_games),
    ("POST", r"/api/events", events), ("GET", r"/api/progress", progress_get), ("POST", r"/api/progress", progress_set),
    ("POST", r"/api/jobs", job_create), ("GET", r"/api/jobs/([a-z0-9]+)", job_get),
    ("GET", r"/api/scripts", scripts_list), ("GET", r"/api/scripts/([a-z0-9]+)", script_get),
]


def dispatch(req: Req):
    """Returns (status, json-able). Raises nothing: errors become {error}."""
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
