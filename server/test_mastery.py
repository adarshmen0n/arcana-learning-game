"""Unit tests for the mastery and adaptation rules (pure functions, no server)."""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mastery as M  # noqa: E402


def ok(c, msg):
    print(("  ok   " if c else "  FAIL ") + msg)
    assert c, msg


print("mastery update")
m = M.PRIOR
for _ in range(6):
    m = M.update(m, True, 2)
ok(0.7 < m < 0.95, f"six correct answers raise mastery from 0.30 to {m:.2f}")
ok(M.update(0.5, False, 2) < 0.5, "a mistake lowers mastery")
ok(M.update(0.4, True, 3) > M.update(0.4, True, 1), "a harder question earns more")
ok(M.update(0.4, True, 2, hints=1) < M.update(0.4, True, 2), "using a hint earns less")
ok(M.update(0.4, True, 2, streak=3) > M.update(0.4, True, 2, streak=0), "a streak earns more")
ok(0.02 <= M.update(0.02, False) and M.update(0.99, True) <= 0.99, "mastery stays inside 0.02 to 0.99")

print("forgetting")
now = 10_000_000
ok(M.effective(0.9, now - 90 * 86400, now) < 0.9, "strong knowledge fades after 90 days")
ok(M.effective(0.9, now - 90 * 86400, now) > 0.5, "...but not below 0.5")
ok(M.effective(0.3, now - 90 * 86400, now) == 0.3, "weak knowledge does not 'fade up'")
ok(M.level(0.2) == "weak" and M.level(0.6) == "learning" and M.level(0.9) == "strong", "levels")

print("performance summary")
evs = [{"correct": i % 4 != 0, "ms": 9000, "concept": "c1"} for i in range(40)]
s = M.summarize(evs)
ok(s["answers"] == 40 and s["accuracy"] == 75 and s["pace"] == 9.0, "accuracy and pace are computed")
ok(M.summarize([])["accuracy"] is None, "no data gives None, not zero")

print("difficulty adaptation")
ok(M.next_difficulty(3, 20, 0, 90, 20) == (4, 20), "high accuracy raises difficulty one step")
ok(M.next_difficulty(3, 20, 0, 40, 20) == (2, 20), "low accuracy lowers difficulty one step")
ok(M.next_difficulty(3, 25, 20, 95, 20) == (3, 20), "no second move before 12 new answers")
ok(M.next_difficulty(3, 5, 0, 99, 5) == (3, 0), "too little data changes nothing")
ok(M.next_difficulty(5, 40, 0, 99, 30)[0] == 5 and M.next_difficulty(1, 40, 0, 10, 30)[0] == 1, "stays inside 1 to 5")

print("settings")
easy, hard = M.settings_for(2, "guided"), M.settings_for(5, "challenge")
ok(easy["maxHearts"] > hard["maxHearts"], "struggling students get more hearts")
ok(easy["bossRatioDelta"] < 0 < hard["bossRatioDelta"], "boss strictness follows difficulty")
ok(easy["showHints"] and easy["explainAlways"] and not hard["showHints"], "guided shows hints, challenge hides them")
ok(M.style_for(3, 50, 20) == "guided" and M.style_for(5, 90, 20) == "challenge" and M.style_for(3, 75, 20) == "balanced", "style choice")
ok("still learning" in M.explain(M.settings_for(3, "balanced"), {"recentAccuracy": None, "recentCount": 0}), "explains when data is thin")

print("question choice")
pool = [{"id": f"q{i}", "conceptId": "weak" if i < 3 else "ok", "difficulty": 1 + i % 3} for i in range(20)]
pick = M.pick_questions(pool, 6, ["weak"], 2, random.Random(1))
ok(sum(1 for q in pick if q["conceptId"] == "weak") >= 2, "weak concepts are favoured")
ok(len(pick) == 6 and len({q["id"] for q in pick}) == 6, "no duplicates")
print("\nMASTERY OK")
