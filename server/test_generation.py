"""Generation quality checks that need no AI key: evidence grounding, student-aware prompts, stored source, question reports, personal review."""
import json, os, pathlib, sys, tempfile, time
os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db, llm, pipeline, remedial, retrieval, roadmap, student  # noqa: E402


def ok(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    assert cond, msg


SOURCE = ("The water cycle moves water between oceans, air and land. Evaporation happens when the sun heats surface water and it turns into vapour. "
          "Condensation happens when vapour cools and forms clouds. Precipitation is rain, snow or hail falling from clouds. " * 4 +
          "Transpiration is the release of water vapour from plant leaves. Groundwater is water that soaks into the soil and is stored underground.")
idx = retrieval.Index(SOURCE)
good = {"prompt": "What is evaporation?", "options": ["Water turning into vapour when heated", "Rain falling", "Clouds forming", "Soaking into soil"], "correct_index": 0,
        "explanation": "The sun heats surface water and it turns into vapour.", "evidence": "Evaporation happens when the sun heats surface water and it turns into vapour."}
print("evidence grounding")
ok(pipeline.supported(idx, good), "a question whose evidence is really in the material is kept")
ok(not pipeline.supported(idx, {**good, "evidence": "Mitochondria are the powerhouse of the cell and make ATP from glucose in the matrix."}), "an invented quote is rejected")
ok(not pipeline.supported(idx, {**good, "prompt": "Who painted the Mona Lisa?", "options": ["Leonardo da Vinci", "Monet", "Picasso", "Dali"], "explanation": "It is a famous Renaissance painting.", "evidence": ""}), "off-topic questions are rejected")
n = pipeline.norm_q(good, ["c1"])
ok(n["evidence"].startswith("Evaporation") and "skill" not in n, "evidence travels with the question so the game can show 'from your notes'")

print("student-aware prompts")
blk = student.prompt_block({"level": 5, "difficulty": 4, "style": "challenge", "accuracy": 82, "answers": 60, "known": ["Condensation"], "weak": ["Transpiration"]})
ok("Condensation" in blk and "Transpiration" in blk and "apply" in blk, "known topics, weak topics and the difficulty shape the prompt")
ok(student.prompt_block(None) == "", "no profile means no extra text")

print("stored source, reports")
uid = db.create_user("tess", "long-enough-1", "f", "tess@example.com")
db.add_game("gamewater00001", uid, "Water")
script = {"title": "Water", "chapters": [{"id": "ch1", "title": "Cycle", "concepts": [{"id": "c1", "name": "Evaporation"}], "scenes": [
    {"type": "obstacle", "question": {"id": "g1", "conceptId": "c1", "prompt": "What is evaporation?", "options": ["a", "b"], "correctIndex": 0, "difficulty": 1}}]}], "finalBoss": {}}
db.save_script("gamewater00001", script); db.save_source("gamewater00001", SOURCE)
ok(db.get_source("gamewater00001") == SOURCE, "the source text is kept with the game")
db.add_report(uid, "gamewater00001", "g1", "unclear")
ok(db.reported(uid, "gamewater00001") == {"g1"}, "reported questions are remembered")
for i in range(3):
    db.apply_events(uid, "gamewater00001", [{"qid": "g1", "concept": "c1", "correct": False, "difficulty": 1, "ms": 5000, "hints": 0, "kind": "t", "chapter": "ch1"}])
user = db.q("SELECT * FROM users WHERE id=?", (uid,), one=True)
ok("g1" not in roadmap.adaptation(user, "gamewater00001")["practice"], "a reported question is not used for practice")

print("personal review")
def fake(system, prompt, schema, **kw):
    if "results" in schema["properties"]:
        ids = [l.split(":")[0] for l in prompt.split("\n\n") if l[:1] == "q"]
        return {"results": [{"id": i, "valid": True, "correct_index": 0, "issue": ""} for i in ids]}
    return {"lines": [{"text": "Evaporation is water turning into vapour when the sun heats it.", "highlight": ["Evaporation"]}],
            "questions": [dict(good, concept_id="c1"), dict(good, prompt="Which process turns heated surface water into vapour?", concept_id="c1"),
                          dict(good, prompt="What happens to surface water when the sun heats it?", concept_id="c1"),
                          dict(good, prompt="Invented question", concept_id="c1", evidence="Dinosaurs lived in the Jurassic period and ate ferns and cycads every day.")]}
llm.call_json = fake
j = {"status": "running", "ts": time.time()}
remedial._work(user, "gamewater00001", "c1", j)
ok(j["status"] == "done" and j["concept"] == "Evaporation", "a review lesson is written for the weak topic")
qs = j["scenes"][1]["questions"]
ok(len(qs) == 3 and all(q["id"].startswith("r") and q.get("evidence") for q in qs), "its questions are new, uniquely numbered and carry evidence")
ok(j["scenes"][0]["type"] == "npc" and j["scenes"][1]["practice"], "it becomes a mentor scene plus a practice test")
j2 = {"status": "running", "ts": time.time()}
remedial._work(user, "gamewater00001", "zz", j2)
ok(j2["status"] == "error", "an unknown topic is refused")
print("full coverage of the upload")
import re as _re
long_text = " ".join(f"Sentence number {i} explains idea {i % 37} about water and energy in detail." for i in range(400))
parts = pipeline.split_parts(long_text)
norm = lambda t: _re.sub(r"\s+", " ", t).strip()
ok(len(parts) >= 5 and norm(" ".join(parts)) == norm(long_text), "the upload is split in order and every word is in exactly one part")
huge = " ".join(["Word filler sentence about history and science."] * 6000)
ok(len(pipeline.split_parts(huge)) <= pipeline.MAX_CHAPTERS, "very long files are capped at the maximum number of chapters")
plan = {"concepts": [{"id": "c1", "name": "x"}], "chapters": [{"title": "One", "goal": "g", "concept_ids": ["c1"], "mood": "science", "fight": "magic", "boss_name": "B", "npc_names": ["A"]}]}
ok(len(pipeline.align_parts(plan, ["a", "b", "c"])["chapters"]) == 3, "a chapter is added for any part the planner forgot")
part = "Evaporation turns surface water into vapour when heated. Condensation forms clouds when vapour cools. Precipitation falls as rain or snow."
full = {"npcs": [{"lines": [{"text": "Evaporation turns surface water into vapour when the sun heats it."}, {"text": "Condensation forms clouds when vapour cools high up."}, {"text": "Precipitation falls as rain or snow."}]}], "tablets": []}
ok(pipeline.coverage(part, full)[0] == 1.0, "lessons that teach the whole part score full coverage")
pct, missed = pipeline.coverage(part, {"npcs": [{"lines": [{"text": "Evaporation turns surface water into vapour when heated."}]}], "tablets": []})
ok(pct < 0.92 and missed, "untaught passages are detected so an extra lesson can be written")
print("\nGENERATION OK")
