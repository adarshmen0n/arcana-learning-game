"""Personal review: when a student keeps missing a topic, write a short extra lesson and fresh questions for it from the stored source text.
The same safeguards as normal generation apply: retrieval of the right passages, an independent answer check, and a support check against the source."""
import secrets
import threading
import time
import types

import db
import llm
import pipeline
import retrieval

S, I = pipeline.S, pipeline.I
REM_SCHEMA = pipeline._obj({"lines": pipeline.ARR(pipeline._obj({"text": S, "highlight": pipeline.ARR(S)})), "questions": pipeline.ARR(pipeline.QUESTION)})
_jobs = {}
_lock = threading.Lock()


def _public(j):
    return {"status": j["status"], "scenes": j.get("scenes"), "concept": j.get("concept"), "error": j.get("error")}


def start(user, game_id, concept_id):
    key = (user["id"], game_id, concept_id)
    with _lock:
        j = _jobs.get(key)
        if j and (j["status"] == "running" or (j["status"] == "done" and time.time() - j["ts"] < 1800)):
            return _public(j)
        j = _jobs[key] = {"status": "running", "ts": time.time()}
    threading.Thread(target=_work, args=(user, game_id, concept_id, j), daemon=True).start()
    return _public(j)


def status(user, game_id, concept_id):
    j = _jobs.get((user["id"], game_id, concept_id))
    return _public(j) if j else {"status": "none"}


def _work(user, game_id, concept_id, j):
    try:
        script = pipeline.load_script(game_id)
        source = db.get_source(game_id)
        if not script or not source:
            raise ValueError("The original text of this game was not kept, so a personal review cannot be written for it.")
        names = {k["id"]: k["name"] for ch in script["chapters"] for k in ch.get("concepts", [])}
        if concept_id not in names:
            raise ValueError("Unknown topic.")
        name = names[concept_id]
        qs_all = {q["id"]: q for ch in script["chapters"] for sc in ch["scenes"] for q in ([sc["question"]] if "question" in sc else sc.get("questions", []))}
        missed = []
        for e in db.recent_events(user["id"], game_id, 300):
            if not e["correct"] and e["concept"] == concept_id and e["qid"] in qs_all and qs_all[e["qid"]]["prompt"] not in missed:
                missed.append(qs_all[e["qid"]]["prompt"])
        index = retrieval.Index(source)
        doc = pipeline.doc_block(index.context(name + " " + " ".join(missed[:3]), 1100))
        prompt = (f"A student keeps getting questions about \"{name}\" wrong. Write a short personal review for it, using only the material.\n"
                  "- lines: 3 short spoken lines (max 220 characters each) from a friendly mentor that explain the idea simply, one with a concrete everyday analogy. highlight: 1-3 key terms that appear verbatim in the line.\n"
                  "- questions: 4 fresh questions (difficulty 1, 1, 2, 2) with four options, exactly one correct, plausible distractors built from common mistakes, correct_index varied. "
                  f"concept_id must be \"{concept_id}\". evidence: a short VERBATIM quote (max 200 characters) from the material that proves the correct answer. skill: recall, understand, apply or analyze.\n"
                  + ("Questions the student already missed (do NOT repeat them, but test the same idea from a different angle):\n- " + "\n- ".join(missed[:4]) if missed else ""))
        shim = types.SimpleNamespace(usage={}, log=lambda *a, **k: None)
        gen = llm.call_json(pipeline.SYS, prompt, REM_SCHEMA, doc=doc, max_tokens=4000, tally=shim.usage)
        wrap = {"obstacles": [], "match": gen["questions"], "arcade": [], "test": [], "spare": []}
        wrap = pipeline.verify(shim, wrap, doc, 0)
        good = []
        for q in wrap["match"]:
            n = pipeline.norm_q(q, [concept_id])
            if n and pipeline.supported(index, q):
                n["id"] = "r" + secrets.token_hex(4)
                good.append(n)
        if len(good) < 2:
            raise ValueError("Could not write enough reliable review questions this time.")
        lines = [{"text": str(l["text"]).strip()[:300], "highlight": [h for h in l.get("highlight", []) if h and h.lower() in str(l["text"]).lower()][:3]} for l in gen["lines"][:4] if str(l.get("text", "")).strip()]
        if not lines:
            raise ValueError("No lesson text was produced.")
        j.update(status="done", concept=name, ts=time.time(), scenes=[
            {"type": "npc", "id": "rev-" + concept_id, "conceptIds": [concept_id], "npc": {"name": "Mentor Aria", "look": "lumen"}, "dialogue": lines, "teacherNote": "A personal review of " + name},
            {"type": "level_test", "id": "revq-" + concept_id, "practice": True, "questions": good[:4], "passMark": 0}])
    except Exception as e:
        j.update(status="error", error=str(e)[:200], ts=time.time())
