"""Storage: one private account per student, their games, answers, progress and per-concept mastery.
SQLite by default (zero setup). Set DATABASE_URL to a Postgres address (Neon, Supabase, ...) and the same code stores everything there,
so accounts and games survive restarts on hosts with a temporary disk. Every query that touches student data is scoped by user_id."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time

import mastery
from config import DATA, DATABASE_URL

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:        # only needed when DATABASE_URL is set
    psycopg = None

PG = bool(DATABASE_URL)
if PG and psycopg is None:
    raise RuntimeError("DATABASE_URL is set but the 'psycopg' package is not installed (pip install -r requirements.txt).")
INTEGRITY = (sqlite3.IntegrityError,) + ((psycopg.IntegrityError,) if psycopg else ())
LOST = (psycopg.OperationalError, psycopg.InterfaceError) if psycopg else ()

_lock = threading.RLock()
_conn = None
SESSION_DAYS = 30
STARTER = "starter"

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pw_hash TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'm', settings TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scripts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, difficulty INTEGER, ms INTEGER, hints INTEGER, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, id);
CREATE TABLE IF NOT EXISTS progress(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(user_id, game_id));
CREATE TABLE IF NOT EXISTS mastery(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, concept TEXT NOT NULL, m REAL NOT NULL, attempts INTEGER NOT NULL, correct INTEGER NOT NULL, streak INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(user_id, game_id, concept));
"""
PG_SCHEMA = [
    "CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, pw_hash TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'm', settings TEXT NOT NULL DEFAULT '{}', created BIGINT NOT NULL, email TEXT, google_sub TEXT)",
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS scripts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS events(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, difficulty INTEGER, ms INTEGER, hints INTEGER, ts BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, id)",
    "CREATE TABLE IF NOT EXISTS progress(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated BIGINT NOT NULL, PRIMARY KEY(user_id, game_id))",
    "CREATE TABLE IF NOT EXISTS mastery(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, concept TEXT NOT NULL, m DOUBLE PRECISION NOT NULL, attempts INTEGER NOT NULL, correct INTEGER NOT NULL, streak INTEGER NOT NULL, last_ts BIGINT NOT NULL, PRIMARY KEY(user_id, game_id, concept))",
]
STARTER_SQL = "INSERT INTO games(id, owner_id, title, created) VALUES(?, NULL, 'Photosynthesis (demo game)', ?) ON CONFLICT(id) DO NOTHING"


def _sql(sql):
    return sql.replace("?", "%s") if PG else sql


def _connect():
    if PG:
        c = psycopg.connect(DATABASE_URL, autocommit=True, row_factory=dict_row, connect_timeout=15)
        for st in PG_SCHEMA:
            c.execute(st)
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_name_ci ON users(lower(username))")
    else:
        c = sqlite3.connect(str(DATA / "arcana.db"), check_same_thread=False, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        c.executescript(SQLITE_SCHEMA)
        for col in ("email TEXT", "google_sub TEXT"):
            try:
                c.execute("ALTER TABLE users ADD COLUMN " + col)
            except sqlite3.OperationalError:
                pass
    c.execute(_sql(STARTER_SQL), (STARTER, int(time.time())))
    return c


def conn():
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()
        return _conn


def _reset():
    global _conn
    with _lock:
        try:
            if _conn is not None:
                _conn.close()
        except Exception:
            pass
        _conn = None


def _exec(sql, args=()):
    """Run one statement; a hosted Postgres may have dropped an idle connection, so reconnect once."""
    for attempt in (1, 2):
        try:
            return conn().execute(_sql(sql), args)
        except LOST:
            _reset()
            if attempt == 2:
                raise


def q(sql, args=(), one=False):
    with _lock:
        rows = _exec(sql, args).fetchall()
    return (rows[0] if rows else None) if one else rows


def run(sql, args=()):
    """Run a write. For an INSERT into users the new id is returned (both databases)."""
    with _lock:
        if PG and sql.lstrip().upper().startswith("INSERT INTO USERS"):
            return _exec(sql + " RETURNING id", args).fetchone()["id"]
        return _exec(sql, args).lastrowid if not PG else (_exec(sql, args) and None)


# ---------------------------------------------------------------- generated game scripts (kept in the database so they survive restarts)
def save_script(sid, obj):
    run("INSERT INTO scripts(id,body,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body", (sid, json.dumps(obj, ensure_ascii=False), int(time.time())))


def get_script(sid):
    row = q("SELECT body FROM scripts WHERE id=?", (sid,), one=True)
    return json.loads(row["body"]) if row else None


def delete_script(sid):
    run("DELETE FROM scripts WHERE id=?", (sid,))


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
    except INTEGRITY:
        return None


def google_user(sub, email, name_hint):
    """Find the account linked to this Google identity or create one (no password; sign-in only through Google)."""
    row = q("SELECT * FROM users WHERE google_sub=?", (sub,), one=True) or q("SELECT * FROM users WHERE email=? AND email IS NOT NULL", (email,), one=True)
    if row:
        if not row["google_sub"]:
            run("UPDATE users SET google_sub=? WHERE id=?", (sub, row["id"]))
        return row
    base = (re.sub(r"[^A-Za-z0-9_.\-]", "", name_hint)[:14] or "ranger").ljust(3, "x")
    for i in range(50):
        name = base if i == 0 else f"{base}{secrets.randbelow(9000) + 1000}"
        try:
            uid = run("INSERT INTO users(username,pw_hash,gender,created,email,google_sub) VALUES(?,?,?,?,?,?)", (name, "google", "m", int(time.time()), email, sub))
            return q("SELECT * FROM users WHERE id=?", (uid,), one=True)
        except INTEGRITY:
            continue
    return None


def login(username, pw):
    row = q("SELECT * FROM users WHERE lower(username)=lower(?)", (username,), one=True)
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
    run("INSERT INTO games(id,owner_id,title,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, title=excluded.title, created=excluded.created", (game_id, owner_id, title, int(time.time())))


def can_use_game(user_id, game_id):
    return q("SELECT 1 FROM games WHERE id=? AND (owner_id IS NULL OR owner_id=?)", (game_id, user_id), one=True) is not None


def games_today(user_id):
    return q("SELECT COUNT(*) c FROM games WHERE owner_id=? AND created>?", (user_id, int(time.time()) - 86400), one=True)["c"]


# ---------------------------------------------------------------- answers -> mastery
def apply_events(user_id, game_id, rows):
    """rows: dicts with qid, concept, correct, difficulty, ms, hints, kind, chapter. Stores them and updates mastery in one transaction."""
    for attempt in (1, 2):
        try:
            return _apply_events(user_id, game_id, rows)
        except LOST:
            _reset()
            if attempt == 2:
                raise


def _apply_events(user_id, game_id, rows):
    now = int(time.time())
    with _lock:
        conn()
        _exec("BEGIN")
        try:
            for r in rows:
                _exec("INSERT INTO events(user_id,game_id,chapter,kind,qid,concept,correct,difficulty,ms,hints,ts) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      (user_id, game_id, r["chapter"], r["kind"], r["qid"], r["concept"], 1 if r["correct"] else 0, r["difficulty"], r["ms"], r["hints"], now))
                if not r["concept"]:
                    continue
                m = _exec("SELECT * FROM mastery WHERE user_id=? AND game_id=? AND concept=?", (user_id, game_id, r["concept"])).fetchone()
                cur, streak, att, cor = (m["m"], m["streak"], m["attempts"], m["correct"]) if m else (mastery.PRIOR, 0, 0, 0)
                new = mastery.update(cur, r["correct"], r["difficulty"] or 2, r["hints"] or 0, streak)
                _exec("INSERT INTO mastery(user_id,game_id,concept,m,attempts,correct,streak,last_ts) VALUES(?,?,?,?,?,?,?,?) "
                      "ON CONFLICT(user_id,game_id,concept) DO UPDATE SET m=excluded.m, attempts=excluded.attempts, correct=excluded.correct, streak=excluded.streak, last_ts=excluded.last_ts",
                      (user_id, game_id, r["concept"], new, att + 1, cor + (1 if r["correct"] else 0), streak + 1 if r["correct"] else 0, now))
            _exec("COMMIT")
        except Exception:
            try:
                _exec("ROLLBACK")
            except Exception:
                pass
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
