"""Settings shared by every module. Everything can be overridden with environment variables or the .env file."""
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(os.environ.get("ARCANA_DATA", ROOT / "data"))
DATA.mkdir(parents=True, exist_ok=True)
HOSTED = os.environ.get("ARCANA_HOSTED", "").lower() in ("1", "true", "yes")      # public deployment: login required to create games
MAX_GAMES_PER_DAY = int(os.environ.get("ARCANA_MAX_GAMES_PER_DAY", "5"))             # per teacher, protects free AI quotas
SECURE_COOKIE = HOSTED                                                              # cookies need https when hosted

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()                    # enables "Continue with Google" (Google Cloud OAuth web client)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()                          # postgres://... (Neon, Supabase). Empty = local SQLite file
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]
