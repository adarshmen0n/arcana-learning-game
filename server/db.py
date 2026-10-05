"""SQLite storage for teachers, classes, students, assignments, answers and progress (standard library only)."""
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
import time

from config import DATA

_lock = threading.RLock()
_conn = None
SESSION_DAYS = 14


def conn():
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(str(DATA / "arcana.db"), check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.executescript("""
            CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw_hash TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS classes(id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL, title TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS assignments(class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, created INTEGER NOT NULL, PRIMARY KEY(class_id, game_id));
            CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE, nickname TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, UNIQUE(class_id, nickname));
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, ts INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS ev_game ON events(game_id, student_id);
            CREATE TABLE IF NOT EXISTS progress(student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(student_id, game_id));
            """)
        return _conn


def q(sql, args=(), one=False):
    with _lock:
        cur = conn().execute(sql, args)
        rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def run(sql, args=()):
    with _lock:
        return conn().execute(sql, args).lastrowid


# ---------------------------------------------------------------- passwords (scrypt, constant-time compare)
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def check_password(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        got = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(got.hex(), h)
    except Exception:
        return False


# ---------------------------------------------------------------- teachers + sessions
def create_teacher(email, name, pw):
    try:
        return run("INSERT INTO teachers(email,name,pw_hash,created) VALUES(?,?,?,?)", (email.lower(), name, hash_password(pw), int(time.time())))
    except sqlite3.IntegrityError:
        return None


def login(email, pw):
    row = q("SELECT * FROM teachers WHERE email=?", (email.lower(),), one=True)
    ok = check_password(pw, row["pw_hash"]) if row else check_password(pw, "scrypt$00$00")   # same work either way
    return row if (row and ok) else None


def new_session(teacher_id):
    tok = secrets.token_urlsafe(32)
    run("INSERT INTO sessions(token,teacher_id,expires) VALUES(?,?,?)", (tok, teacher_id, int(time.time()) + SESSION_DAYS * 86400))
    return tok


def teacher_for(token):
    if not token:
        return None
    row = q("SELECT t.* FROM sessions s JOIN teachers t ON t.id=s.teacher_id WHERE s.token=? AND s.expires>?", (token, int(time.time())), one=True)
    return row


def drop_session(token):
    run("DELETE FROM sessions WHERE token=?", (token,))


# ---------------------------------------------------------------- classes, games, students
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_class(teacher_id, name):
    for _ in range(20):
        code = "".join(secrets.choice(CODE_CHARS) for _ in range(6))
        try:
            return run("INSERT INTO classes(teacher_id,name,code,created) VALUES(?,?,?,?)", (teacher_id, name, code, int(time.time())))
        except sqlite3.IntegrityError:
            continue
    raise RuntimeError("could not allocate a class code")


def class_owned(teacher_id, class_id):
    return q("SELECT * FROM classes WHERE id=? AND teacher_id=?", (class_id, teacher_id), one=True)


def add_game(game_id, teacher_id, title):
    run("INSERT OR REPLACE INTO games(id,teacher_id,title,created) VALUES(?,?,?,?)", (game_id, teacher_id, title, int(time.time())))


def games_today(teacher_id):
    return q("SELECT COUNT(*) c FROM games WHERE teacher_id=? AND created>?", (teacher_id, int(time.time()) - 86400), one=True)["c"]


def join_class(code, nickname, token=None):
    cls = q("SELECT * FROM classes WHERE code=?", (code.upper().strip(),), one=True)
    if not cls:
        return None, "That class code does not exist."
    now = int(time.time())
    if token:
        s = q("SELECT * FROM students WHERE token=? AND class_id=?", (token, cls["id"]), one=True)
        if s:
            run("UPDATE students SET last_seen=? WHERE id=?", (now, s["id"]))
            return (s, cls), None
    if q("SELECT 1 FROM students WHERE class_id=? AND nickname=? COLLATE NOCASE", (cls["id"], nickname), one=True):
        return None, "That nickname is already taken in this class. Pick another one."
    if q("SELECT COUNT(*) c FROM students WHERE class_id=?", (cls["id"],), one=True)["c"] >= 300:
        return None, "This class is full."
    tok = secrets.token_urlsafe(24)
    sid = run("INSERT INTO students(class_id,nickname,token,created,last_seen) VALUES(?,?,?,?,?)", (cls["id"], nickname, tok, now, now))
    return (q("SELECT * FROM students WHERE id=?", (sid,), one=True), cls), None


def student_for(token):
    if not token:
        return None
    s = q("SELECT * FROM students WHERE token=?", (token,), one=True)
    if s:
        run("UPDATE students SET last_seen=? WHERE id=?", (int(time.time()), s["id"]))
    return s
