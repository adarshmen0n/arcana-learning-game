"""SQLite storage: one private account per student, their games, answers, progress and per-concept mastery.
Standard library only. Every query that touches student data is scoped by user_id."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time

import mastery
from config import DATA

_lock = threading.RLock()
_conn = None
SESSION_DAYS = 30
STARTER = "starter"


def conn():
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(str(DATA / "arcana.db"), check_same_thread=False, isolation_level=None)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.executescript("""
            CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pw_hash TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'm', settings TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, difficulty INTEGER, ms INTEGER, hints INTEGER, ts INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, id);
            CREATE TABLE IF NOT EXISTS progress(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(user_id, game_id));
            CREATE TABLE IF NOT EXISTS mastery(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, concept TEXT NOT NULL, m REAL NOT NULL, attempts INTEGER NOT NULL, correct INTEGER NOT NULL, streak INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(user_id, game_id, concept));
            """)
            _conn.execute("INSERT OR IGNORE INTO games(id, owner_id, title, created) VALUES(?, NULL, 'Photosynthesis (starter game)', ?)", (STARTER, int(time.time())))
        return _conn


def q(sql, args=(), one=False):
    with _lock:
        rows = conn().execute(sql, args).fetchall()
    return (rows[0] if rows else None) if one else rows


def run(sql, args=()):
    with _lock:
        return conn().execute(sql, args).lastrowid


# ---------------------------------------------------------------- passwords (scrypt, constant-time compare)
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    return f"scrypt${salt.hex()}${hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32).hex()}"


def check_password(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        return hmac.compare_digest(hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32).hex(), h)
    except Exception:
        return False


# ---------------------------------------------------------------- accounts + sessions
def create_user(username, pw, gender="m"):
    try:
        return run("INSERT INTO users(username,pw_hash,gender,created) VALUES(?,?,?,?)", (username, hash_password(pw), "f" if gender == "f" else "m", int(time.time())))
    except sqlite3.IntegrityError:
        return None


def login(username, pw):
    row = q("SELECT * FROM users WHERE username=?", (username,), one=True)
    ok = check_password(pw, row["pw_hash"]) if row else check_password(pw, "scrypt$00$00")      # same work either way
    return row if (row and ok) else None


def new_session(user_id):
    tok = secrets.token_urlsafe(32)
    run("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)", (tok, user_id, int(time.time()) + SESSION_DAYS * 86400))
    return tok


def user_for(token):
    if not token:
        return None
    return q("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?", (token, int(time.time())), one=True)


def drop_session(token):
    run("DELETE FROM sessions WHERE token=?", (token,))


def settings(user):
    try:
        return json.loads(user["settings"] or "{}")
    except ValueError:
        return {}


def save_settings(user_id, d):
    run("UPDATE users SET settings=? WHERE id=?", (json.dumps(d), user_id))


# ---------------------------------------------------------------- games (private to the owner; the starter game is shared)
def add_game(game_id, owner_id, title):
    run("INSERT OR REPLACE INTO games(id,owner_id,title,created) VALUES(?,?,?,?)", (game_id, owner_id, title, int(time.time())))


def can_use_game(user_id, game_id):
    return q("SELECT 1 FROM games WHERE id=? AND (owner_id IS NULL OR owner_id=?)", (game_id, user_id), one=True) is not None


def games_today(user_id):
    return q("SELECT COUNT(*) c FROM games WHERE owner_id=? AND created>?", (user_id, int(time.time()) - 86400), one=True)["c"]


# ---------------------------------------------------------------- answers -> mastery
def apply_events(user_id, game_id, rows):
    """rows: dicts with qid, concept, correct, difficulty, ms, hints, kind, chapter. Stores them and updates mastery in one transaction."""
    now = int(time.time())
    with _lock:
        c = conn()
        c.execute("BEGIN")
        try:
            for r in rows:
                c.execute("INSERT INTO events(user_id,game_id,chapter,kind,qid,concept,correct,difficulty,ms,hints,ts) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                          (user_id, game_id, r["chapter"], r["kind"], r["qid"], r["concept"], 1 if r["correct"] else 0, r["difficulty"], r["ms"], r["hints"], now))
                if not r["concept"]:
                    continue
                m = c.execute("SELECT * FROM mastery WHERE user_id=? AND game_id=? AND concept=?", (user_id, game_id, r["concept"])).fetchone()
                cur, streak, att, cor = (m["m"], m["streak"], m["attempts"], m["correct"]) if m else (mastery.PRIOR, 0, 0, 0)
                new = mastery.update(cur, r["correct"], r["difficulty"] or 2, r["hints"] or 0, streak)
                c.execute("INSERT INTO mastery(user_id,game_id,concept,m,attempts,correct,streak,last_ts) VALUES(?,?,?,?,?,?,?,?) "
                          "ON CONFLICT(user_id,game_id,concept) DO UPDATE SET m=excluded.m, attempts=excluded.attempts, correct=excluded.correct, streak=excluded.streak, last_ts=excluded.last_ts",
                          (user_id, game_id, r["concept"], new, att + 1, cor + (1 if r["correct"] else 0), streak + 1 if r["correct"] else 0, now))
            c.execute("COMMIT")
        except Exception:
            c.execute("ROLLBACK")
            raise
    return len(rows)


def recent_events(user_id, game_id=None, limit=400):
    if game_id:
        return [dict(r) for r in q("SELECT * FROM events WHERE user_id=? AND game_id=? ORDER BY id DESC LIMIT ?", (user_id, game_id, limit))]
    return [dict(r) for r in q("SELECT * FROM events WHERE user_id=? ORDER BY id DESC LIMIT ?", (user_id, limit))]


def mastery_rows(user_id, game_id=None):
    if game_id:
        return [dict(r) for r in q("SELECT * FROM mastery WHERE user_id=? AND game_id=?", (user_id, game_id))]
    return [dict(r) for r in q("SELECT * FROM mastery WHERE user_id=?", (user_id,))]
