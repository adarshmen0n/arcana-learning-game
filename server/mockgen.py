"""Offline fallback (no API key): builds a plan + chapter content from the text with simple NLP-free heuristics.
Questions are fill-in-the-blank on key terms with distractors from the same document. Good enough to play, far below AI quality."""
import random
import re
from collections import Counter

STOP = set("""about above after again against all also although always among and another any are around because been before being between both but can could did does doing down during each either else even every first for from further had has have having her here him his how however into its itself just like made make many may more most much must never new not now off often only other our out over own same she should since some such than that the their them then there these they this those through thus too under until upon very was were what when where whether which while who whom why will with within without would you your""".split())
BOSS = ["Warlord Kragg", "Siege Titan", "Iron Marshal", "Dread Captain", "Steel Baron"]
MOODS = ["science", "nature", "conflict", "history", "abstract"]


def _sentences(text):
    out = []
    for block in re.split(r"\n+", text):
        block = block.strip()
        if not block or block.startswith("#"):
            continue
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", block):
            s = s.strip()
            if 40 <= len(s) <= 260:
                out.append(s)
    return out


def _terms(sentences):
    """Candidate key terms: capitalised mid-sentence phrases and long frequent words."""
    caps, words = Counter(), Counter()
    for s in sentences:
        toks = re.findall(r"[A-Za-z][A-Za-z\-']+", s)
        for i, t in enumerate(toks):
            lo = t.lower()
            if lo in STOP or len(t) < 5:
                continue
            words[lo] += 1
            if i > 0 and t[0].isupper():
                caps[t] += 1
    scored = {}
    for w, c in words.items():
        scored[w] = c + (2 if caps.get(w.capitalize()) else 0) + min(len(w), 12) / 12
    return [w for w, _ in sorted(scored.items(), key=lambda kv: -kv[1])]


def _short(s, n=200):
    if len(s) <= n:
        return s
    cut = max(s.rfind(",", 0, n), s.rfind(";", 0, n))
    return (s[:cut] if cut > n * 0.5 else s[:n].rsplit(" ", 1)[0]) + "."


def _has(sentence, term):
    return re.search(r"\b" + re.escape(term) + r"\b", sentence, re.I)


def _cloze(sentence, term, pool, rnd):
    m = _has(sentence, term)
    if not m:
        return None
    shown = sentence[m.start():m.end()]
    blank = sentence[:m.start()] + "_____" + sentence[m.end():]
    others = [t for t in pool if t.lower() != term.lower() and not _has(sentence, t)]
    similar = sorted(others, key=lambda t: abs(len(t) - len(term)))[:14]
    if len(similar) < 3:
        return None
    opts = [shown] + [t.capitalize() if shown[0].isupper() else t for t in rnd.sample(similar, 3)]
    rnd.shuffle(opts)
    return {"prompt": "Complete the statement: " + _short(blank, 230), "options": opts, "correct_index": opts.index(shown), "explanation": _short(sentence, 230), "concept_id": "", "difficulty": 1 + (len(term) > 8)}


def build(text, filename="notes"):
    rnd = random.Random(len(text))
    sents = _sentences(text)
    if len(sents) < 8:
        raise ValueError("Not enough material: add more text (at least about 10 full sentences).")
    heads = [l.lstrip("# ").strip() for l in text.split("\n") if l.startswith("#") and 3 < len(l) < 80]
    title = heads[0] if heads else re.sub(r"[_\-]+", " ", filename.rsplit(".", 1)[0]).strip().title() or "Study Material"
    k = max(1, min(5, round(len(sents) / 14)))
    size = -(-len(sents) // k)
    groups = [sents[i * size:(i + 1) * size] for i in range(k) if sents[i * size:(i + 1) * size]]
    global_terms = _terms(sents)[:80]
    plan_chapters, gens, concepts, cid = [], [], [], 0
    for ci, g in enumerate(groups):
        terms = [t for t in _terms(g) if t in global_terms or True][:5]
        ch_concepts = []
        for t in terms[:4]:
            src = next((s for s in g if _has(s, t)), g[0])
            cid += 1
            ch_concepts.append({"id": f"c{cid}", "name": t.capitalize(), "summary": _short(src, 200), "importance": 3, "complexity": 2, "needs_research": False, "research_query": ""})
        concepts += ch_concepts
        ids = [c["id"] for c in ch_concepts]
        sub = heads[ci + 1] if len(heads) > ci + 1 and len(heads) >= len(groups) else None
        name = sub or f"Part {ci + 1}: {ch_concepts[0]['name']}" if ch_concepts else f"Part {ci + 1}"
        plan_chapters.append({"title": name, "goal": "Understand " + ", ".join(c["name"] for c in ch_concepts[:3]), "concept_ids": ids, "mood": MOODS[ci % 5], "fight": "martial", "boss_name": BOSS[ci % len(BOSS)], "npc_names": ["Mentor Aria", "Archivist Venn"]})
        # question pool
        cands = []
        for c in ch_concepts:
            for s in [s for s in g if _has(s, c["name"])][:3]:
                cands.append((s, c["name"], c["id"]))
        for s in g:
            for t in _terms([s])[:2]:
                cands.append((s, t, ch_concepts[0]["id"] if ch_concepts else ""))
        qs, seen = [], set()
        for s, t, i in cands:
            key = (s, t.lower())
            if key in seen:
                continue
            seen.add(key)
            q = _cloze(s, t, global_terms, rnd)
            if q:
                q["concept_id"] = i
                qs.append(q)
        rnd.shuffle(qs)
        n = len(qs)
        need = {"obstacles": 2, "match": 5, "arcade": 3, "test": 5, "spare": 2}
        if n < sum(need.values()):                      # scale down for small documents
            f = n / sum(need.values())
            need = {k_: max(1, int(v * f)) for k_, v in need.items()}
        take = lambda m: [qs.pop() for _ in range(min(m, len(qs)))]
        obstacles = [{"question": q, "hint": "Re-read the mentor's words: look for the key term."} for q in take(need["obstacles"])]
        match, arcade, test, spare = take(need["match"]), take(need["arcade"]), take(need["test"]), take(need["spare"])
        npcs = []
        for j in range(2):
            lines = g[j * 3:j * 3 + 3] or g[:3]
            npcs.append({"npc_name": plan_chapters[-1]["npc_names"][j], "concept_ids": ids[:2], "lines": [{"text": _short(l), "highlight": [t.capitalize() for t in terms if _has(l, t)][:2]} for l in lines], "teacher_note": "Pause and ask students to restate this in their own words."})
        short = [s for s in g if len(s) < 120]
        if len(short) >= 4:
            mission = {"kind": "order", "instruction": "Put these statements in the order they appear in your notes.", "items": short[:4], "pairs": []}
        else:
            mission = {"kind": "match_pairs", "instruction": "Connect each term to the sentence that explains it.", "items": [], "pairs": [{"term": c["name"], "definition": _short(c["summary"], 70)} for c in ch_concepts[:4]]}
        gens.append({"npcs": npcs, "obstacles": obstacles, "match": match, "mission": mission, "arcade": arcade, "test": test, "spare": spare})
    plan = {"title": title, "subject": "", "level": "general", "summary": _short(sents[0], 240), "concepts": concepts, "chapters": plan_chapters, "final_boss_name": "Malachar the Sorcerer"}
    return plan, gens
