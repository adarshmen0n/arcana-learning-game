"""Storage: one private account per student, their games, answers, progress and per-concept mastery.
SQLite by default (zero setup). Set DATABASE_URL to a Postgres address (Neon, Supabase, ...) and the same code stores everything there,
so accounts and games survive restarts on hosts with a temporary disk. Every query that touches student data is scoped by user_id."""
import hashlib
import hmac
import json
import os
import queue
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
# Postgres: a small pool so many players' requests run side by side (SQLite keeps one connection behind the lock)
POOL = int(os.environ.get("ARCANA_DB_POOL", "8"))
_pool, _made, _tl, _schema_done = queue.LifoQueue(), 0, threading.local(), False
SESSION_DAYS = 30

SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pw_hash TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'm', settings TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scripts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sources(game_id TEXT PRIMARY KEY, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS script_cache(hash TEXT PRIMARY KEY, game_id TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS arc_messages(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, content TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS arc_user ON arc_messages(user_id, game_id, id);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, qid TEXT NOT NULL, reason TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, difficulty INTEGER, ms INTEGER, hints INTEGER, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, id);
CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, email TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(user_id, game_id));
CREATE TABLE IF NOT EXISTS mastery(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, concept TEXT NOT NULL, m REAL NOT NULL, attempts INTEGER NOT NULL, correct INTEGER NOT NULL, streak INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY(user_id, game_id, concept));
"""
PG_SCHEMA = [
    "CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL, pw_hash TEXT NOT NULL, gender TEXT NOT NULL DEFAULT 'm', settings TEXT NOT NULL DEFAULT '{}', created BIGINT NOT NULL, email TEXT, google_sub TEXT, last_login BIGINT, on_board INTEGER NOT NULL DEFAULT 1)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS on_board INTEGER NOT NULL DEFAULT 1",
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS scripts(id TEXT PRIMARY KEY, body TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS sources(game_id TEXT PRIMARY KEY, body TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS script_cache(hash TEXT PRIMARY KEY, game_id TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS arc_messages(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, content TEXT NOT NULL, created BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS arc_user ON arc_messages(user_id, game_id, id)",
    "CREATE TABLE IF NOT EXISTS reports(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, qid TEXT NOT NULL, reason TEXT, created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS events(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter TEXT, kind TEXT, qid TEXT, concept TEXT, correct INTEGER NOT NULL, difficulty INTEGER, ms INTEGER, hints INTEGER, ts BIGINT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, id)",
    "CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS tickets(id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, email TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created BIGINT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS progress(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0, updated BIGINT NOT NULL, PRIMARY KEY(user_id, game_id))",
    "CREATE TABLE IF NOT EXISTS mastery(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, concept TEXT NOT NULL, m DOUBLE PRECISION NOT NULL, attempts INTEGER NOT NULL, correct INTEGER NOT NULL, streak INTEGER NOT NULL, last_ts BIGINT NOT NULL, PRIMARY KEY(user_id, game_id, concept))",
]


def _sql(sql):
    return sql.replace("?", "%s") if PG else sql


def _connect():
    global _schema_done
    if PG:
        c = psycopg.connect(DATABASE_URL, autocommit=True, row_factory=dict_row, connect_timeout=15)
        if _schema_done:
            return c
        _schema_done = True
        for st in PG_SCHEMA:
            c.execute(st)
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_name_ci ON users(lower(username))")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users(lower(email)) WHERE email IS NOT NULL")
    else:
        c = sqlite3.connect(str(DATA / "arcana.db"), check_same_thread=False, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        c.executescript(SQLITE_SCHEMA)
        for col in ("email TEXT", "google_sub TEXT", "last_login INTEGER", "on_board INTEGER NOT NULL DEFAULT 1"):
            try:
                c.execute("ALTER TABLE users ADD COLUMN " + col)
            except sqlite3.OperationalError:
                pass
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users(lower(email)) WHERE email IS NOT NULL")
    for t in ("games", "events", "mastery", "progress"):        # the old shared demo game no longer exists
        c.execute(_sql(f"DELETE FROM {t} WHERE " + ("id" if t == "games" else "game_id") + "=?"), ("starter",))
    return c


def _take():
    global _made
    try:
        return _pool.get_nowait()
    except queue.Empty:
        pass
    with _lock:
        if _made < POOL:
            _made += 1
            try:
                return _connect()
            except Exception:
                _made -= 1
                raise
    return _pool.get(timeout=30)


class _hold:
    """Borrow this thread's database connection for a block (re-entrant). Postgres: from the pool; SQLite: the shared one under the lock."""
    def __enter__(self):
        if not PG:
            _lock.acquire()
            return conn()
        if getattr(_tl, "c", None) is not None:
            _tl.depth += 1
            return _tl.c
        _tl.c, _tl.depth = _take(), 1
        return _tl.c

    def __exit__(self, *exc):
        if not PG:
            _lock.release()
            return False
        _tl.depth -= 1
        if _tl.depth == 0:
            c, _tl.c = _tl.c, None
            if c is not None and not c.closed:
                _pool.put(c)
        return False


def conn():
    global _conn
    if PG:
        if getattr(_tl, "c", None) is not None:
            return _tl.c
        with _hold() as c:
            return c
    with _lock:
        if _conn is None:
            _conn = _connect()
        return _conn


def _reset():
    global _conn
    if PG and getattr(_tl, "c", None) is not None:          # this thread's pooled connection was dropped: replace it
        try:
            _tl.c.close()
        except Exception:
            pass
        _tl.c = _connect()
        return
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
    with _hold():
        rows = _exec(sql, args).fetchall()
    return (rows[0] if rows else None) if one else rows


def run(sql, args=()):
    """Run a write. For an INSERT into users or tickets the new id is returned (both databases)."""
    with _hold():
        if PG and sql.lstrip().upper().startswith(("INSERT INTO USERS", "INSERT INTO TICKETS")):
            return _exec(sql + " RETURNING id", args).fetchone()["id"]
        return _exec(sql, args).lastrowid if not PG else (_exec(sql, args) and None)


# ---------------------------------------------------------------- generated game scripts (kept in the database so they survive restarts)
def save_script(sid, obj):
    run("INSERT INTO scripts(id,body,created) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body", (sid, json.dumps(obj, ensure_ascii=False), int(time.time())))


def cache_put(h, game_id):
    run("INSERT INTO script_cache(hash,game_id,created) VALUES(?,?,?) ON CONFLICT(hash) DO UPDATE SET game_id=excluded.game_id, created=excluded.created", (h, game_id, int(time.time())))


def cache_get(h):
    """A finished game built from exactly the same material, if one exists."""
    row = q("SELECT game_id FROM script_cache WHERE hash=?", (h,), one=True)
    return get_script(row["game_id"]) if row else None


def get_script(sid):
    row = q("SELECT body FROM scripts WHERE id=?", (sid,), one=True)
    return json.loads(row["body"]) if row else None


def delete_script(sid):
    run("DELETE FROM scripts WHERE id=?", (sid,))
    run("DELETE FROM sources WHERE game_id=?", (sid,))


def save_source(game_id, text):
    run("INSERT INTO sources(game_id,body,created) VALUES(?,?,?) ON CONFLICT(game_id) DO UPDATE SET body=excluded.body", (game_id, text[:400000], int(time.time())))


def has_source(game_id):
    return q("SELECT 1 FROM sources WHERE game_id=?", (game_id,), one=True) is not None


def get_source(game_id):
    row = q("SELECT body FROM sources WHERE game_id=?", (game_id,), one=True)
    return row["body"] if row else None


def add_report(user_id, game_id, qid, reason):
    run("INSERT INTO reports(user_id,game_id,qid,reason,created) VALUES(?,?,?,?,?)", (user_id, game_id, qid, reason, int(time.time())))


def reported(user_id, game_id):
    return {r["qid"] for r in q("SELECT qid FROM reports WHERE user_id=? AND game_id=?", (user_id, game_id))}


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
def create_user(username, pw, gender="m", email=None):
    try:
        return run("INSERT INTO users(username,pw_hash,gender,created,email,last_login) VALUES(?,?,?,?,?,?)",
                   (username, hash_password(pw), "f" if gender == "f" else "m", int(time.time()), (email or "").lower() or None, int(time.time())))
    except INTEGRITY:
        return None


def email_taken(email):
    return q("SELECT 1 FROM users WHERE lower(email)=lower(?)", (email,), one=True) is not None


def username_taken(name):
    return q("SELECT 1 FROM users WHERE lower(username)=lower(?)", (name,), one=True) is not None


def set_password(user_id, pw):
    run("UPDATE users SET pw_hash=? WHERE id=?", (hash_password(pw), user_id))


def drop_sessions(user_id, keep=None):
    if keep:
        run("DELETE FROM sessions WHERE user_id=? AND token<>?", (user_id, keep))
    else:
        run("DELETE FROM sessions WHERE user_id=?", (user_id,))


def make_reset(user_id, minutes=60):
    tok = secrets.token_urlsafe(32)
    run("DELETE FROM resets WHERE user_id=?", (user_id,))
    run("INSERT INTO resets(token_hash,user_id,expires) VALUES(?,?,?)", (hashlib.sha256(tok.encode()).hexdigest(), user_id, int(time.time()) + minutes * 60))
    return tok


def use_reset(tok):
    """Returns the user id for a valid, unexpired reset token and burns it."""
    h = hashlib.sha256(str(tok).encode()).hexdigest()
    row = q("SELECT * FROM resets WHERE token_hash=? AND expires>?", (h, int(time.time())), one=True)
    run("DELETE FROM resets WHERE token_hash=?", (h,))
    return row["user_id"] if row else None


def add_ticket(user_id, email, category, subject, message):
    return run("INSERT INTO tickets(user_id,email,category,subject,message,created) VALUES(?,?,?,?,?,?)", (user_id, email, category, subject, message, int(time.time())))


XP_SQL = ("SELECT u.id, u.username, COALESCE(p.s, 0) + 2 * COALESCE(e.c, 0) AS xp FROM users u "
          "LEFT JOIN (SELECT user_id, SUM(score) AS s FROM progress GROUP BY user_id) p ON p.user_id = u.id "
          "LEFT JOIN (SELECT user_id, COUNT(*) AS c FROM events WHERE correct = 1 GROUP BY user_id) e ON e.user_id = u.id")


def leaderboard(user_id, top=10):
    """Global ranks by XP (the same XP as the student's level). Students who opted out are not listed."""
    rows = [dict(r) for r in q("SELECT * FROM (" + XP_SQL + " WHERE u.on_board = 1) t WHERE t.xp > 0 ORDER BY t.xp DESC, t.id LIMIT ?", (top,))]
    me = q("SELECT * FROM (" + XP_SQL + ") t WHERE t.id = ?", (user_id,), one=True)
    my_xp = int(me["xp"]) if me else 0
    rank = q("SELECT COUNT(*) AS c FROM (" + XP_SQL + " WHERE u.on_board = 1) t WHERE t.xp > ?", (my_xp,), one=True)["c"] + 1
    total = q("SELECT COUNT(*) AS c FROM (" + XP_SQL + " WHERE u.on_board = 1) t WHERE t.xp > 0", (), one=True)["c"]
    return {"top": [{"rank": i + 1, "name": r["username"], "xp": int(r["xp"]), "level": 1 + int(r["xp"]) // 500, "me": r["id"] == user_id} for i, r in enumerate(rows)],
            "me": {"rank": rank if my_xp > 0 else None, "xp": my_xp, "level": 1 + my_xp // 500}, "players": total}


def export_user(user_id):
    """Everything stored about one student (for the 'download my data' button)."""
    u = q("SELECT id,username,email,gender,created,last_login FROM users WHERE id=?", (user_id,), one=True)
    return {"account": dict(u), "games": [dict(r) for r in q("SELECT id,title,created FROM games WHERE owner_id=?", (user_id,))],
            "progress": [dict(r) for r in q("SELECT * FROM progress WHERE user_id=?", (user_id,))],
            "mastery": [dict(r) for r in q("SELECT * FROM mastery WHERE user_id=?", (user_id,))],
            "answers": [dict(r) for r in q("SELECT game_id,chapter,kind,qid,concept,correct,difficulty,ms,hints,ts FROM events WHERE user_id=? ORDER BY id", (user_id,))],
            "supportTickets": [dict(r) for r in q("SELECT id,category,subject,message,status,created FROM tickets WHERE user_id=?", (user_id,))]}


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


def login(ident, pw):
    """ident is an email address or a username."""
    row = q("SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)", (ident, ident), one=True)
    ok = check_password(pw, row["pw_hash"]) if row else check_password(pw, "scrypt$00$00")      # same work either way
    if row and ok:
        run("UPDATE users SET last_login=? WHERE id=?", (int(time.time()), row["id"]))
        return row
    return None


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


# ---------------------------------------------------------------- games (each one is private to the student who uploaded it)
def add_game(game_id, owner_id, title):
    run("INSERT INTO games(id,owner_id,title,created) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, title=excluded.title, created=excluded.created", (game_id, owner_id, title, int(time.time())))


def can_use_game(user_id, game_id):
    return q("SELECT 1 FROM games WHERE id=? AND owner_id=?", (game_id, user_id), one=True) is not None


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
    with _hold():
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
