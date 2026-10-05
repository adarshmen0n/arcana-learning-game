"""Learning analytics + AI coach.

`analyse` is deterministic: it studies every answer a student has stored (accuracy by difficulty, speed, guessing, hint use,
trend, forgetting risk) and returns findings plus a next-steps plan. `advice` asks the AI router to turn those facts into a
short personal study plan in the background; the dashboard shows the deterministic plan at once and swaps in the AI plan
when it arrives. The AI only sees numbers and topic names, never the student's username or files.
"""
import statistics
import threading
import time

import db
import llm
import mastery as M

_cache = {}          # user id -> {"key": n_events, "ts": t, "ai": plan or None, "busy": bool}
_lock = threading.Lock()

PLAN_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["headline", "advice"], "properties": {
    "headline": {"type": "string"}, "advice": {"type": "array", "items": {"type": "string"}}}}


def analyse(user) -> dict:
    uid = user["id"]
    ev = db.recent_events(uid, None, 600)
    now = int(time.time())
    out = {"answers": len(ev), "findings": [], "plan": [], "forgetting": []}
    if len(ev) < 5:
        out["plan"] = ["Play a chapter or two. After about 10 answers ARCANA can see how you learn."]
        return out
    by_d = {}
    for e in ev:
        by_d.setdefault(e["difficulty"] or 2, []).append(e["correct"])
    out["byDifficulty"] = {str(d): {"accuracy": round(100 * sum(v) / len(v)), "n": len(v)} for d, v in sorted(by_d.items())}
    times = [e["ms"] for e in ev if e["ms"]]
    med = statistics.median(times) / 1000 if times else None
    fast_wrong = [e for e in ev if e["ms"] and e["ms"] < 3500 and not e["correct"]]
    slow_right = [e for e in ev if e["ms"] and e["ms"] > 15000 and e["correct"]]
    hinted = [e for e in ev if e["hints"]]
    acc = lambda xs: sum(e["correct"] for e in xs) / len(xs) if xs else None
    out["speed"] = {"median": round(med, 1) if med else None, "fastWrong": len(fast_wrong), "slowRight": len(slow_right)}
    out["hintUse"] = round(100 * len(hinted) / len(ev))
    f = out["findings"]
    if len(fast_wrong) >= 4 and len(fast_wrong) / max(1, sum(1 for e in ev if not e["correct"])) > 0.4:
        f.append({"kind": "rushing", "text": "Many of your mistakes are quick answers. Reading all options before choosing would likely fix them."})
        out["plan"].append("Slow down on the first read: aim for at least 5 seconds per question.")
    if len(slow_right) >= 4:
        f.append({"kind": "slow", "text": "You get these right but take long. Short repeats of the same topics will build speed."})
    lo = [x for d in by_d for x in by_d[d] if d == 1]
    hi = [x for d in by_d for x in by_d[d] if d == 3]
    if len(lo) >= 5 and len(hi) >= 5 and sum(lo) / len(lo) - sum(hi) / len(hi) > 0.3:
        f.append({"kind": "depth", "text": "You know the basics well but hard questions are tough. Focus on how and why, not only definitions."})
        out["plan"].append("After each lesson, explain the idea in your own words before moving on.")
    if out["hintUse"] > 40:
        f.append({"kind": "hints", "text": f"You use hints on {out['hintUse']}% of questions. Try to answer first, then check the hint."})
    recent, older = ev[:15], ev[15:30]
    if len(recent) >= 10 and len(older) >= 10:
        d = round(100 * (acc(recent) - acc(older)))
        out["trend"] = d
        f.append({"kind": "trend", "text": ("Your accuracy is rising (+%d points)." % d) if d >= 8 else ("Accuracy dropped %d points recently. Review before pushing on." % -d) if d <= -8 else "Your accuracy is steady."})
    rows = db.mastery_rows(uid)
    for r in rows:
        e = M.effective(r["m"], r["last_ts"], now)
        days = (now - r["last_ts"]) / 86400
        if r["m"] >= 0.7 and e < r["m"] - 0.08 and days > 5:
            out["forgetting"].append({"game": r["game_id"], "concept": r["concept"], "was": round(r["m"], 2), "now": round(e, 2), "days": round(days)})
    if out["forgetting"]:
        f.append({"kind": "forgetting", "text": f"{len(out['forgetting'])} topics are fading from memory. A quick replay will lock them in."})
        out["plan"].append("Replay a chapter you finished more than a week ago.")
    weak = sorted((r for r in rows if M.level(M.effective(r["m"], r["last_ts"], now)) == "weak" and r["attempts"] >= 2), key=lambda r: r["m"])[:3]
    if weak:
        out["plan"].append(f"Practise your {len(weak)} weakest topic{'s' if len(weak) > 1 else ''} first; the practice station in each chapter targets them.")
    if not out["plan"]:
        out["plan"].append("Keep going. Upload a new file to extend your path while your accuracy is strong.")
    return out


def _ask(user, facts):
    import roadmap
    st = roadmap.stats(user)
    prompt = ("You are the coach inside a study game. From these numbers about one student, write a short personal study plan. "
              "headline: one encouraging sentence (max 120 chars). advice: 3 to 5 concrete actions, each max 160 chars, referring to the weak topics by name when given. "
              "Do not invent numbers.\n\n" + str({"accuracy": st["accuracy"], "recentAccuracy": st["recentAccuracy"], "pace_s": st["pace"], "bestStreak": st["bestStreak"],
                                                  "weakTopics": [t["name"] for t in st["weak"]], "strongTopics": [t["name"] for t in st["strong"]],
                                                  "byDifficulty": facts.get("byDifficulty"), "speed": facts.get("speed"), "hintUsePct": facts.get("hintUse"),
                                                  "trend": facts.get("trend"), "fadingTopics": len(facts["forgetting"]), "findings": [x["text"] for x in facts["findings"]]}))
    return llm.call_json("You are a supportive learning coach. Reply in JSON only.", prompt, PLAN_SCHEMA, max_tokens=900)


def advice(user) -> dict:
    facts = analyse(user)
    key = facts["answers"]
    with _lock:
        c = _cache.setdefault(user["id"], {"key": -1, "ai": None, "busy": False, "ts": 0})
        if key >= 5 and llm.available() and not c["busy"] and (c["key"] != key and time.time() - c["ts"] > 120):
            c["busy"] = True

            def work():
                try:
                    plan = _ask(user, facts)
                    ok = isinstance(plan.get("advice"), list) and plan.get("headline")
                    with _lock:
                        c.update(ai={"headline": str(plan["headline"])[:200], "advice": [str(a)[:220] for a in plan["advice"]][:5]} if ok else None, key=key)
                except Exception:
                    pass
                finally:
                    with _lock:
                        c["busy"] = False
                        c["ts"] = time.time()
            threading.Thread(target=work, daemon=True).start()
        ai = c["ai"]
        busy = c["busy"]
    facts["ai"] = ai
    facts["aiPending"] = busy
    return facts
