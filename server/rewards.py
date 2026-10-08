"""Daily rewards, streaks, daily challenges, the season pass and ranger cosmetics. Saved per account in settings["rewards"].

Everything here pays out in knowledge shards (the hero's currency) or cosmetics, and all of it is earned by studying:
challenges count real answers from the events table, and the season track follows lifetime XP.
"""
import datetime
import hashlib

import db
import hero
import roadmap

SUITS = {   # id: (name, unlock) ; unlock = "free", "tier:N" (season pass) or a shard price
    "neon": ("Neon Ranger", "free"), "crimson": ("Crimson Vanguard", "tier:3"), "cobalt": ("Cobalt Specter", "tier:6"),
    "violet": ("Violet Arcanist", 180), "gold": ("Gilded Champion", "tier:12"), "arctic": ("Arctic Ghost", 260),
    "obsidian": ("Obsidian Reaper", "tier:18"), "solar": ("Solar Flare", 400),
}
TRIMS = {
    "neon": ("Neon green", "free"), "ice": ("Ice blue", 60), "ember": ("Ember orange", "tier:2"), "rose": ("Rose red", 90),
    "royal": ("Royal gold", "tier:9"), "plasma": ("Plasma violet", 140), "pure": ("Pure white", "tier:15"),
}
TIER_XP = 300
TIERS = 20
SEASON = "Season 1: Neon Dawn"


def _tier_reward(n):
    for kind, table in (("suit", SUITS), ("trim", TRIMS)):
        for cid, (name, unlock) in table.items():
            if unlock == f"tier:{n}":
                return {"type": kind, "id": cid, "name": name}
    return {"type": "shards", "amount": 30 + 10 * n, "name": f"{30 + 10 * n} shards"}


CHALLENGES = [
    {"id": "answer10", "text": "Answer 10 questions correctly", "goal": 10, "pay": 30},
    {"id": "arcade4", "text": "Get 4 right answers in mini-games", "goal": 4, "pay": 35},
    {"id": "streak5", "text": "Answer 5 in a row without a mistake", "goal": 5, "pay": 30},
    {"id": "topics3", "text": "Get answers right in 3 different topics", "goal": 3, "pay": 25},
    {"id": "boss3", "text": "Land 3 right answers in a boss fight or trial", "goal": 3, "pay": 40},
    {"id": "fight6", "text": "Defeat 6 enemies in ambushes", "goal": 6, "pay": 35},
    {"id": "answer25", "text": "Answer 25 questions correctly", "goal": 25, "pay": 60},
]
ARCADE_KINDS = {"maze", "snake", "hill", "shooter"}
BOSS_KINDS = {"mini_boss", "final_boss", "level_test"}


def _day(tz_min, offset=0):
    return (datetime.datetime.utcnow() - datetime.timedelta(minutes=tz_min) + datetime.timedelta(days=offset)).strftime("%Y-%m-%d")


def _day_start(tz_min):
    d = datetime.datetime.strptime(_day(tz_min), "%Y-%m-%d")
    return int((d + datetime.timedelta(minutes=tz_min) - datetime.datetime(1970, 1, 1)).total_seconds())


def _load(user):
    r = db.settings(hero._fresh(user)).get("rewards") or {}
    r.setdefault("streak", 0); r.setdefault("best", 0); r.setdefault("last", ""); r.setdefault("tiers", [])
    r.setdefault("owned", ["neon"]); r.setdefault("trims", ["neon"]); r.setdefault("suit", "neon"); r.setdefault("trim", "neon")
    r.setdefault("ch", {})
    return r


def _save(user, r):
    cfg = db.settings(hero._fresh(user))
    cfg["rewards"] = r
    db.save_settings(user["id"], cfg)


def _shards(user, n):
    h = hero._data(user)
    h["shards"] += int(n)
    hero._save(user, h)
    return h["shards"]


def _todays(day):
    seed = int(hashlib.sha1(day.encode()).hexdigest(), 16)
    pool = CHALLENGES[:]
    out = []
    while len(out) < 3:
        out.append(pool.pop(seed % len(pool)))
        seed //= 7
    return out


def _progress(user, ch, tz_min, r):
    since = _day_start(tz_min)
    rows = db.q("SELECT kind, concept, correct, ts FROM events WHERE user_id=? AND ts>=? ORDER BY ts", (user["id"], since))
    right = [x for x in rows if x["correct"]]
    best = run = 0
    for x in rows:
        run = run + 1 if x["correct"] else 0
        best = max(best, run)
    kills = hero._data(user)["kills"] - int(r["ch"].get("kills0", hero._data(user)["kills"]))
    val = {"answer10": len(right), "answer25": len(right), "arcade4": sum(1 for x in right if x["kind"] in ARCADE_KINDS), "streak5": best,
           "topics3": len({x["concept"] for x in right if x["concept"]}), "boss3": sum(1 for x in right if x["kind"] in BOSS_KINDS), "fight6": kills}
    return min(ch["goal"], val.get(ch["id"], 0))


def status(user, tz_min=0):
    r = _load(user)
    today = _day(tz_min)
    if r["ch"].get("day") != today:            # a new day: fresh challenges, remember the kill count to measure today's fights
        r["ch"] = {"day": today, "claimed": [], "kills0": hero._data(user)["kills"]}
        _save(user, r)
    alive = r["last"] in (today, _day(tz_min, -1))
    streak = r["streak"] if alive else 0
    nxt = streak + 1 if r["last"] != today else streak
    st = roadmap.stats(user)
    tier = min(TIERS, st["xp"] // TIER_XP)
    chs = [{**c, "progress": _progress(user, c, tz_min, r), "claimed": c["id"] in r["ch"]["claimed"]} for c in _todays(today)]
    cos = lambda table, owned: [{"id": k, "name": n, "owned": k in owned, "price": u if isinstance(u, int) else None, "tier": int(u.split(":")[1]) if isinstance(u, str) and u.startswith("tier:") else None} for k, (n, u) in table.items()]
    return {
        "today": today, "streak": streak, "best": r["best"], "claimedToday": r["last"] == today, "dailyPay": daily_pay(nxt),
        "week": [{"day": i + 1, "pay": daily_pay(i + 1)} for i in range(7)], "challenges": chs,
        "season": {"name": SEASON, "xp": st["xp"], "tier": tier, "tierXp": TIER_XP, "tiers": TIERS, "inTier": st["xp"] % TIER_XP if tier < TIERS else TIER_XP,
                   "track": [{"tier": n, "reward": _tier_reward(n), "reached": n <= tier, "claimed": n in r["tiers"]} for n in range(1, TIERS + 1)]},
        "look": {"suit": r["suit"], "trim": r["trim"]}, "suits": cos(SUITS, r["owned"]), "trims": cos(TRIMS, r["trims"]),
        "shards": hero._data(user)["shards"],
    }


def daily_pay(day_of_streak):
    d = ((max(1, day_of_streak) - 1) % 7) + 1
    return 80 if d == 7 else 10 + 5 * d


def claim(user, kind, cid, tz_min=0):
    r = _load(user)
    today = _day(tz_min)
    if kind == "daily":
        if r["last"] == today:
            return None, "Already claimed today. Come back tomorrow."
        r["streak"] = r["streak"] + 1 if r["last"] == _day(tz_min, -1) else 1
        r["best"] = max(r["best"], r["streak"])
        r["last"] = today
        pay = daily_pay(r["streak"])
        _save(user, r)
        _shards(user, pay)
        return {"paid": pay, "streak": r["streak"], **status(user, tz_min)}, None
    if kind == "challenge":
        s = status(user, tz_min)
        r = _load(user)
        c = next((x for x in s["challenges"] if x["id"] == cid), None)
        if not c:
            return None, "That challenge is not active today."
        if c["claimed"]:
            return None, "Already claimed."
        if c["progress"] < c["goal"]:
            return None, "Not finished yet."
        r["ch"]["claimed"].append(cid)
        _save(user, r)
        _shards(user, c["pay"])
        return {"paid": c["pay"], **status(user, tz_min)}, None
    if kind == "tier":
        try:
            n = int(cid)
        except (TypeError, ValueError):
            return None, "Bad tier."
        tier = min(TIERS, roadmap.stats(user)["xp"] // TIER_XP)
        if n < 1 or n > tier:
            return None, "Reach that tier first."
        if n in r["tiers"]:
            return None, "Already claimed."
        r["tiers"].append(n)
        rw = _tier_reward(n)
        if rw["type"] == "suit" and rw["id"] not in r["owned"]:
            r["owned"].append(rw["id"])
        if rw["type"] == "trim" and rw["id"] not in r["trims"]:
            r["trims"].append(rw["id"])
        _save(user, r)
        if rw["type"] == "shards":
            _shards(user, rw["amount"])
        return {"paid": rw.get("amount", 0), "reward": rw, **status(user, tz_min)}, None
    return None, "Unknown reward."


def cosmetic(user, action, kind, cid, tz_min=0):
    table, owned_key, eq_key = (SUITS, "owned", "suit") if kind == "suit" else (TRIMS, "trims", "trim") if kind == "trim" else (None, None, None)
    if not table or cid not in table:
        return None, "Unknown item."
    r = _load(user)
    if action == "buy":
        if cid in r[owned_key]:
            return None, "You already own it."
        price = table[cid][1]
        if not isinstance(price, int):
            return None, "Unlock it on the season pass."
        h = hero._data(user)
        if h["shards"] < price:
            return None, f"You need {price} shards."
        h["shards"] -= price
        hero._save(user, h)
        r[owned_key].append(cid)
        r[eq_key] = cid
        _save(user, r)
        return status(user, tz_min), None
    if action == "equip":
        if cid not in r[owned_key]:
            return None, "Unlock it first."
        r[eq_key] = cid
        _save(user, r)
        return status(user, tz_min), None
    return None, "Unknown action."


def look(user):
    r = _load(user)
    return {"suit": r["suit"], "trim": r["trim"]}

