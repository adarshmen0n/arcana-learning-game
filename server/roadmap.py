"""Builds each student's learning roadmap from their games, progress and mastery. Pure assembly: no AI."""
import time

import db
import mastery as M
import pipeline


def _script(gid):
    return pipeline.load_script(gid) or {"title": gid, "chapters": []}


def adaptation(user, game_id=None):
    """The personal setup for this student, plus what to practise. Moves difficulty only when the rules allow."""
    evs = db.recent_events(user["id"])
    st = M.summarize(evs)
    cfg = db.settings(user)
    total = db.q("SELECT COUNT(*) c FROM events WHERE user_id=?", (user["id"],), one=True)["c"]
    d, at = M.next_difficulty(cfg.get("difficulty", 3), total, cfg.get("changedAt", 0), st["recentAccuracy"], st["recentCount"])
    if (d, at) != (cfg.get("difficulty", 3), cfg.get("changedAt", 0)):
        cfg.update(difficulty=d, changedAt=at)
        db.save_settings(user["id"], cfg)
    style = M.style_for(d, st["recentAccuracy"], st["recentCount"])
    out = M.settings_for(d, style)
    out["stats"], out["why"] = st, M.explain(out, st)
    now = int(time.time())
    weak, practice = [], []
    if game_id and db.can_use_game(user["id"], game_id):
        names = {k["id"]: k["name"] for ch in _script(game_id)["chapters"] for k in ch.get("concepts", [])}
        for r in db.mastery_rows(user["id"], game_id):
            e = M.effective(r["m"], r["last_ts"], now)
            if r["attempts"] >= 2 and e < 0.55:
                weak.append({"id": r["concept"], "name": names.get(r["concept"], r["concept"]), "mastery": round(e, 2)})
        weak.sort(key=lambda w: w["mastery"])
        ids = {w["id"] for w in weak[:3]}
        seen = set()
        for e in db.recent_events(user["id"], game_id, 200):          # newest first: practise what was missed most recently
            if not e["correct"] and e["concept"] in ids and e["qid"] not in seen:
                seen.add(e["qid"])
                practice.append(e["qid"])
            if len(practice) >= 4:
                break
    out["weak"], out["practice"] = weak[:5], practice
    return out


def stats(user):
    evs = db.recent_events(user["id"], None, 400)
    st = M.summarize(evs)
    now = int(time.time())
    rows = db.mastery_rows(user["id"])
    per = {}
    for r in rows:
        per.setdefault(r["concept"] + "|" + r["game_id"], r)
    names = {}
    for g in db.q("SELECT id FROM games WHERE owner_id=?", (user["id"],)):
        for ch in _script(g["id"])["chapters"]:
            for k in ch.get("concepts", []):
                names[(g["id"], k["id"])] = k["name"]
    topics = []
    for r in rows:
        e = M.effective(r["m"], r["last_ts"], now)
        topics.append({"game": r["game_id"], "id": r["concept"], "name": names.get((r["game_id"], r["concept"]), r["concept"]), "mastery": round(e, 2), "level": M.level(e), "attempts": r["attempts"]})
    topics.sort(key=lambda t: t["mastery"])
    prog = db.q("SELECT SUM(score) s, SUM(finished) f FROM progress WHERE user_id=?", (user["id"],), one=True)
    correct = sum(1 for e in evs if e["correct"])
    xp = (prog["s"] or 0) + 2 * correct
    return {**st, "xp": xp, "level": 1 + xp // 500, "xpInLevel": xp % 500, "gamesFinished": prog["f"] or 0,
            "weak": [t for t in topics if t["level"] == "weak"][:6], "strong": [t for t in topics if t["level"] == "strong"][-6:][::-1], "topics": len(topics)}


def build(user):
    now = int(time.time())
    games, recs = [], []
    achievements = {"First game": False, "First boss defeated": False, "Sharp mind (80%+ over 30 answers)": False, "Finished a game": False, "Five concepts mastered": False}
    mrows = db.mastery_rows(user["id"])
    st = M.summarize(db.recent_events(user["id"], None, 400))
    for g in db.q("SELECT * FROM games WHERE owner_id=? ORDER BY created", (user["id"],)):
        sc = _script(g["id"])
        p = db.q("SELECT * FROM progress WHERE user_id=? AND game_id=?", (user["id"], g["id"]), one=True)
        done_idx, finished = (p["chapter_idx"], bool(p["finished"])) if p else (0, False)
        mm = {r["concept"]: r for r in mrows if r["game_id"] == g["id"]}
        nodes = []
        chapters = sc["chapters"]
        for i, ch in enumerate(chapters + [None]):
            final = ch is None
            ids = [k["id"] for k in ch.get("concepts", [])] if ch else [k["id"] for c in chapters for k in c.get("concepts", [])]
            names = {k["id"]: k["name"] for c in chapters for k in c.get("concepts", [])}
            cs = []
            for cid in ids:
                r = mm.get(cid)
                e = M.effective(r["m"], r["last_ts"], now) if r else None
                cs.append({"id": cid, "name": names.get(cid, cid), "mastery": None if e is None else round(e, 2), "level": None if e is None else M.level(e), "attempts": r["attempts"] if r else 0})
            seen = [c["mastery"] for c in cs if c["mastery"] is not None]
            avg = round(sum(seen) / len(seen), 2) if seen else None
            status = "done" if (finished or i < done_idx) else "current" if i == done_idx else "locked"
            if status == "done" and avg is not None and avg >= 0.8:
                status = "mastered"
            elif status == "done" and avg is not None and avg < 0.5:
                status = "review"
            nodes.append({"index": i, "title": "Final boss" if final else ch["title"], "goal": "Face the final exam" if final else ch.get("goal", ""), "theme": (sc.get("finalBoss", {}).get("theme") if final else ch.get("theme")) or {}, "final": final, "status": status, "mastery": avg, "concepts": cs})
        cur = next((n for n in nodes if n["status"] == "current"), None)
        games.append({"id": g["id"], "title": sc.get("title") or g["title"], "finished": finished, "score": p["score"] if p else 0, "nodes": nodes, "chapters": len(chapters)})
        if cur and not finished:
            recs.append({"kind": "continue", "text": f"Continue \"{games[-1]['title']}\": {cur['title']}", "game": g["id"], "weight": 2})
        for n in nodes:
            if n["status"] == "review":
                recs.append({"kind": "review", "text": f"Review {n['title']} (mastery {round(100 * n['mastery'])}%)", "game": g["id"], "weight": 3})
        for c in sorted((c for n in nodes for c in n["concepts"] if c["mastery"] is not None and c["mastery"] < 0.45 and c["attempts"] >= 2), key=lambda c: c["mastery"])[:2]:
            recs.append({"kind": "practice", "text": f"Practise {c['name']} (mastery {round(100 * c['mastery'])}%)", "game": g["id"], "weight": 4})
        if finished:
            achievements["Finished a game"] = True
        if p and (p["chapter_idx"] >= 1 or finished):
            achievements["First boss defeated"] = True
    own = db.q("SELECT COUNT(*) c FROM games WHERE owner_id=?", (user["id"],), one=True)["c"]
    achievements["First game"] = own > 0
    achievements["Sharp mind (80%+ over 30 answers)"] = st["recentCount"] >= 30 and (st["recentAccuracy"] or 0) >= 80
    achievements["Five concepts mastered"] = sum(1 for r in mrows if M.effective(r["m"], r["last_ts"], now) >= 0.8) >= 5
    if not own:
        recs.append({"kind": "upload", "text": "Upload your own notes to build a personal path", "game": None, "weight": 1})
    elif all(g["finished"] for g in games):
        recs.append({"kind": "upload", "text": "You finished your games. Upload new material to extend your roadmap", "game": None, "weight": 1})
    recs.sort(key=lambda r: -r["weight"])
    return {"games": games, "next": recs[:5], "achievements": [{"name": k, "earned": v} for k, v in achievements.items()]}
