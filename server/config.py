"""Settings shared by every module. Everything can be overridden with environment variables or the .env file."""
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(os.environ.get("ARCANA_DATA", ROOT / "data"))
DATA.mkdir(parents=True, exist_ok=True)
HOSTED = os.environ.get("ARCANA_HOSTED", "").lower() in ("1", "true", "yes")      # public deployment: login required to create games
MAX_GAMES_PER_DAY = int(os.environ.get("ARCANA_MAX_GAMES_PER_DAY", "0"))             # optional cap per student per day; 0 = unlimited (the AI router queues and fails over instead)
SECURE_COOKIE = HOSTED                                                              # cookies need https when hosted

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()                    # enables "Continue with Google" (Google Cloud OAuth web client)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()                          # postgres://... (Neon, Supabase). Empty = local SQLite file
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}       # these accounts see the support inbox
PUBLIC_URL = (os.environ.get("PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").rstrip("/")     # used in emailed links
SMTP_HOST, SMTP_PORT = os.environ.get("SMTP_HOST", "").strip(), int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER, SMTP_PASS = os.environ.get("SMTP_USER", "").strip(), os.environ.get("SMTP_PASS", "")
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip() or SMTP_USER
