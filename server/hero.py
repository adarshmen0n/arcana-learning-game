"""The student's hero: unlocked powers, enchantments and shard-bought enhancements. Saved per account.

Powers and enchantments unlock with the player level (which comes from real study: answers and chapter scores), so playing and learning
is what strengthens the hero. Shards are earned from defeating enemies and learning facts in combat and are spent on enhancements.
"""
import db
import roadmap

ABILITIES = [
    {"id": "strike", "name": "Strike", "key": "J", "unlock": 1, "cost": 0, "desc": "Fast punch combo. Chain three hits for a finisher."},
    {"id": "kick", "name": "Heavy kick", "key": "K", "unlock": 1, "cost": 0, "desc": "Slower, harder, knocks enemies back."},
    {"id": "bolt", "name": "Arcane Bolt", "key": "1", "unlock": 2, "cost": 20, "desc": "Fire a bolt of energy across the arena."},
    {"id": "shock", "name": "Shockwave", "key": "2", "unlock": 4, "cost": 35, "desc": "Slam the ground: damages and stuns everything near you."},
    {"id": "surge", "name": "Overcharge", "key": "3", "unlock": 6, "cost": 55, "desc": "For 6 seconds your hits do 60% more damage and you take less."},
    {"id": "nova", "name": "Knowledge Nova", "key": "4", "unlock": 9, "cost": 0, "desc": "Needs a full Knowledge meter (earned from shards). Wipes the arena."},
]
ENCHANTS = [
    {"id": "aegis", "name": "Aegis", "unlock": 3, "desc": "A shield blocks your first wrong answer in every boss fight and trial."},
    {"id": "insight", "name": "Insight", "unlock": 5, "desc": "Removes one wrong option from boss questions."},
    {"id": "siphon", "name": "Siphon", "unlock": 7, "desc": "Defeating an enemy restores some health."},
    {"id": "fortune", "name": "Fortune", "unlock": 10, "desc": "+25% score and +25% shards."},
]
UPGRADES = [
    {"id": "power", "name": "Power", "desc": "+8% damage per level"},
    {"id": "vitality", "name": "Vitality", "desc": "+10% health per level"},
    {"id": "focus", "name": "Focus", "desc": "+12% energy regeneration per level"},
    {"id": "luck", "name": "Scholar's luck", "desc": "+10% shards per level"},
]
MAX_UP = 5
COSTS = [25, 50, 90, 150, 240]


def _fresh(user):
    return db.q("SELECT * FROM users WHERE id=?", (user["id"],), one=True) or user


def _data(user):
    h = db.settings(_fresh(user)).get("hero") or {}
    return {"shards": int(h.get("shards", 0)), "kills": int(h.get("kills", 0)), "upgrades": {k: int(v) for k, v in (h.get("upgrades") or {}).items()}, "equipped": list(h.get("equipped") or [])}


def _save(user, h):
    cfg = db.settings(_fresh(user))
    cfg["hero"] = h
    db.save_settings(user["id"], cfg)


def slots(level):
    return 2 if level < 8 else 3


def view(user):
    level = roadmap.stats(user)["level"]
    h = _data(user)
    ups = h["upgrades"]
    eq = [e for e in h["equipped"] if any(x["id"] == e and x["unlock"] <= level for x in ENCHANTS)][: slots(level)]
    mult = {"damage": 1 + 0.08 * ups.get("power", 0), "health": 1 + 0.10 * ups.get("vitality", 0), "energy": 1 + 0.12 * ups.get("focus", 0),
            "shards": (1 + 0.10 * ups.get("luck", 0)) * (1.25 if "fortune" in eq else 1), "score": 1.25 if "fortune" in eq else 1}
    return {"level": level, "shards": h["shards"], "kills": h["kills"], "slots": slots(level), "equipped": eq, "mult": mult,
            "abilities": [{**a, "unlocked": a["unlock"] <= level} for a in ABILITIES],
            "enchants": [{**e, "unlocked": e["unlock"] <= level, "equipped": e["id"] in eq} for e in ENCHANTS],
            "upgrades": [{**u, "level": ups.get(u["id"], 0), "max": MAX_UP, "cost": COSTS[ups.get(u["id"], 0)] if ups.get(u["id"], 0) < MAX_UP else None} for u in UPGRADES]}


def upgrade(user, uid):
    h = _data(user)
    if not any(u["id"] == uid for u in UPGRADES):
        return None, "Unknown upgrade."
    lv = h["upgrades"].get(uid, 0)
    if lv >= MAX_UP:
        return None, "Already at the maximum."
    if h["shards"] < COSTS[lv]:
        return None, f"You need {COSTS[lv]} shards."
    h["shards"] -= COSTS[lv]
    h["upgrades"][uid] = lv + 1
    _save(user, h)
    return view(user), None


def equip(user, ids):
    v = view(user)
    ok = [e["id"] for e in v["enchants"] if e["unlocked"]]
    chosen = []
    for i in ids:
        if i in ok and i not in chosen:
            chosen.append(i)
    h = _data(user)
    h["equipped"] = chosen[: v["slots"]]
    _save(user, h)
    return view(user)


def earn(user, shards, kills):
    h = _data(user)
    h["shards"] += max(0, min(60, int(shards)))
    h["kills"] += max(0, min(20, int(kills)))
    _save(user, h)
    return view(user)
