"""Rewards tests on a throwaway database: daily streak, challenges, season tiers and cosmetics."""
import os
import sys
import tempfile

os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
os.environ.pop("DATABASE_URL", None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402
import hero  # noqa: E402
import rewards  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)
    print("ok -", msg)


db.conn()
db.create_user("rw_student", "pass-12345")
u = dict(db.q("SELECT * FROM users WHERE username=?", ("rw_student",), one=True))
tz = -330

s = rewards.status(u, tz)
ok(s["streak"] == 0 and not s["claimedToday"] and len(s["challenges"]) == 3, "a new student has no streak and three daily challenges")
out, err = rewards.claim(u, "daily", "", tz)
ok(not err and out["paid"] == rewards.daily_pay(1) and out["streak"] == 1 and out["shards"] == rewards.daily_pay(1), "the daily login reward pays shards and starts a streak")
ok(rewards.claim(u, "daily", "", tz)[1], "the daily reward can only be claimed once a day")

r = rewards._load(u)
r["last"] = rewards._day(tz, -1)
r["streak"] = 6
rewards._save(u, r)
out, _ = rewards.claim(u, "daily", "", tz)
ok(out["streak"] == 7 and out["paid"] == 80, "day 7 of a streak pays the jackpot")
r = rewards._load(u)
r["last"] = rewards._day(tz, -3)
rewards._save(u, r)
ok(rewards.status(u, tz)["streak"] == 0, "missing a day resets the streak")

c = rewards.status(u, tz)["challenges"][0]
ok(rewards.claim(u, "challenge", c["id"], tz)[1] == "Not finished yet.", "unfinished challenges cannot be claimed")
ok(rewards.claim(u, "tier", "1", tz)[1], "season tiers need XP first")

h = hero._data(u)
h["shards"] = 30
hero._save(u, h)
ok(rewards.cosmetic(u, "buy", "trim", "ice", tz)[1], "cosmetics cost shards")
h["shards"] = 500
hero._save(u, h)
out, err = rewards.cosmetic(u, "buy", "trim", "ice", tz)
ok(not err and out["look"]["trim"] == "ice" and out["shards"] == 440, "buying a trim spends shards and equips it")
ok(rewards.cosmetic(u, "buy", "suit", "gold", tz)[1] == "Unlock it on the season pass.", "season-pass suits cannot be bought")
ok(rewards.cosmetic(u, "equip", "suit", "gold", tz)[1], "locked suits cannot be equipped")
ok(rewards.look(u) == {"suit": "neon", "trim": "ice"}, "the look is saved for the game and the lobby")
print("\nREWARDS OK")
