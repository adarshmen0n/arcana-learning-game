"""Mastery and adaptation: pure, deterministic functions (no AI, no database) so they are easy to test.

Mastery is a number from 0 to 1 per student and concept. It rises with correct answers (more for harder questions,
less when a hint was used), falls with mistakes, and strong knowledge slowly fades without practice.
The adaptation rules turn recent performance into game settings for that one student."""
import math
import statistics

PRIOR = 0.30
WEAK, STRONG = 0.45, 0.75


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def update(m, correct, difficulty=2, hints=0, streak=0):
    """New mastery after one answer. streak = correct answers in a row on this concept before this one."""
    w = 0.10 + 0.05 * clamp(int(difficulty or 2), 1, 3)
    if correct:
        gain = w * (1 - m) * (1 + 0.2 * min(streak, 3))
        if hints:
            gain *= 0.5
        m += gain
    else:
        m -= w * m * 1.2
    return clamp(m, 0.02, 0.99)


def effective(m, last_ts, now):
    """Forgetting: strong knowledge drifts toward 0.5 with a 45-day time constant; weak knowledge stays weak."""
    if not last_ts or m <= 0.5:
        return m
    days = max(0.0, (now - last_ts) / 86400)
    return 0.5 + (m - 0.5) * math.exp(-days / 45)


def level(m):
    return "weak" if m < WEAK else "learning" if m < STRONG else "strong"


def summarize(events):
    """events: dicts newest first with keys correct, ms, concept. Returns the performance picture used everywhere."""
    n = len(events)
    recent = events[:30]
    acc = lambda es: (sum(1 for e in es if e["correct"]) / len(es)) if es else None
    times = [e["ms"] / 1000 for e in recent if e.get("ms") and 0 < e["ms"] < 120000]
    best = run = 0
    for e in reversed(events):
        run = run + 1 if e["correct"] else 0
        best = max(best, run)
    trend = None
    if len(events) >= 20:
        trend = round(100 * (acc(events[:10]) - acc(events[10:20])))
    return {"answers": n, "accuracy": None if not n else round(100 * acc(events)), "recentAccuracy": None if not recent else round(100 * acc(recent)),
            "recentCount": len(recent), "pace": round(statistics.median(times), 1) if times else None, "bestStreak": best, "trend": trend}


def next_difficulty(prev, total_answers, changed_at, recent_acc, recent_n):
    """Difficulty 1..5. Moves at most one step, and only after 12 new answers since the last move."""
    d = clamp(int(prev or 3), 1, 5)
    if recent_acc is None or recent_n < 12 or total_answers - (changed_at or 0) < 12:
        return d, changed_at or 0
    if recent_acc >= 85 and d < 5:
        return d + 1, total_answers
    if recent_acc <= 55 and d > 1:
        return d - 1, total_answers
    return d, changed_at or 0


def style_for(difficulty, recent_acc, recent_n):
    if recent_n >= 8 and recent_acc is not None and (recent_acc < 60 or difficulty <= 2):
        return "guided"
    if difficulty >= 4 and recent_acc is not None and recent_acc >= 80:
        return "challenge"
    return "balanced"


HEARTS = {1: 7, 2: 6, 3: 5, 4: 4, 5: 3}


def settings_for(difficulty, style):
    """The concrete game changes for this student. The game engine only reads these numbers."""
    return {
        "difficulty": difficulty, "style": style, "maxHearts": HEARTS[difficulty],
        "rivalBonus": round((difficulty - 3) * 0.06, 2),            # opponent skill in matches
        "bossRatioDelta": round((difficulty - 3) * 0.05, 2),        # share of boss questions needed
        "bossCountDelta": 2 if difficulty >= 4 else -1 if difficulty <= 2 else 0,
        "testPassDelta": -1 if difficulty <= 2 else 0,
        "targetDifficulty": 1 if difficulty <= 2 else 2 if difficulty == 3 else 3,   # preferred question difficulty
        "showHints": style != "challenge",
        "explainAlways": style == "guided",
        "scoreBonus": 1.25 if style == "challenge" else 1.0,
    }


def explain(settings, stats):
    a, p = stats.get("recentAccuracy"), stats.get("pace")
    if a is None or stats["recentCount"] < 8:
        return "ARCANA is still learning how you play. Answer a few more questions and it will tune the game to you."
    why = f"You are answering {a}% correctly" + (f" in about {p}s each" if p else "") + ". "
    st = settings["style"]
    what = {"guided": f"So ARCANA gives you more hearts ({settings['maxHearts']}), easier bosses, hints, explanations after every answer and extra practice on your weak topics.",
            "challenge": f"So ARCANA raises the stakes: {settings['maxHearts']} hearts, bigger bosses, no hints and 25% bonus score.",
            "balanced": f"So ARCANA keeps a steady setup: {settings['maxHearts']} hearts and normal bosses, with practice on topics you miss."}[st]
    return why + what


def pick_questions(pool, n, weak_concepts, target_diff, rnd):
    """Choose n questions: favour weak concepts and questions near the student's target difficulty."""
    weak = set(weak_concepts)
    scored = []
    for q in pool:
        s = rnd.random() * 1.0
        if q.get("conceptId") in weak:
            s += 1.2
        s -= 0.35 * abs((q.get("difficulty") or 2) - target_diff)
        scored.append((s, q))
    scored.sort(key=lambda t: -t[0])
    return [q for _, q in scored[:n]]
