"""Play while the game is still being built: chapter 1 opens early, the rest arrive in the background, and an AI that gives out half way
never takes away chapters the student is already playing."""
import os
import sys
import tempfile
import time

os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
os.environ.pop("DATABASE_URL", None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api  # noqa: E402
import db  # noqa: E402
import llm  # noqa: E402
import pipeline  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)
    print("ok -", msg)


db.conn()
U1 = db.create_user("early1", "x-test-pass-1")
U2 = db.create_user("early2", "x-test-pass-2")
TERMS = ["chlorophyll", "stomata", "glucose", "oxygen", "chloroplast", "xylem", "phloem", "respiration", "transpiration", "photosynthesis", "enzyme", "mitochondria"]
TEXT = " ".join(f"The {t} plays a key role in plant biology. Scientists describe the {t} as essential for growth in stage {i % 7 + 1}. "
                f"Without {t}, the plant cannot complete process {i}. Students often confuse {t} with {TERMS[(i + 3) % len(TERMS)]}."
                for i, t in enumerate(TERMS * 4))
N = 4
plan_obj = {"title": "Plants", "subject": "biology", "level": "school", "summary": "s. s.", "final_boss_name": "Boss",
            "concepts": [{"id": f"c{i}", "name": TERMS[i], "summary": "x", "importance": 3, "complexity": 2, "needs_research": False, "research_query": ""} for i in range(N)],
            "chapters": [{"title": f"Ch {i}", "goal": "g", "concept_ids": [f"c{i}"], "mood": "science", "fight": "magic", "boss_name": "B", "npc_names": ["A", "B", "C", "D"]} for i in range(N)]}
llm.call_json = lambda *a, **k: plan_obj
pipeline.split_parts = lambda text: [text[k * len(text) // N:(k + 1) * len(text) // N] for k in range(N)]
_, GENS = pipeline.mockgen.build(TEXT, "x.txt")
behaviour = {}


def fake_gen(job, plan, i, doc, index=None, part=None):
    delay, fail = behaviour.get(i, (0, False))
    time.sleep(delay)
    if fail:
        raise llm.LLMError("All AI providers are rate-limited right now.")
    ch = plan["chapters"][i]
    cons = [c for c in plan["concepts"] if c["id"] in ch["concept_ids"]]
    out = pipeline.assemble_chapter(i, len(plan["chapters"]), ch, cons, dict(GENS[0]), "school")
    out["madeBy"] = "ai"
    return out


pipeline.gen_chapter = fake_gen
real_conc = llm.concurrency
llm.concurrency = lambda: 2


class FakeReq:
    def __init__(self, owner, full):
        self.owner, self.query = owner, ({"script": ["1"]} if full else {})

    def need(self):
        return {"id": self.owner}


# 1. chapter 1 is playable long before the whole game is done
behaviour.clear()
behaviour.update({0: (0.2, False), 1: (2.5, False), 2: (2.5, False), 3: (2.5, False)})
job = pipeline.start("plants.txt", text=TEXT, opts={"fresh": True, "owner": U1})
job.mode = "ai"
t0 = time.time()
first = None
while job.status in ("queued", "running") and time.time() - t0 < 30:
    j = api.job_get(FakeReq(U1, True), job.id)
    if j["script"] and first is None:
        first = (time.time() - t0, j["status"], len(j["script"]["chapters"]), j["total"])
    time.sleep(0.05)
whole = time.time() - t0
ok(first and first[1] == "running" and first[2] >= 1 and first[3] == N, f"the game page gets chapter 1 while the build is still running (after {first[0]:.1f}s of {whole:.1f}s)")
ok(first[0] < whole / 2, "the student starts playing in well under half the full build time")
ok(job.status == "done" and len(job.script["chapters"]) == N, "the remaining chapters finish in the background")
lobby_view = None
behaviour.update({0: (0.2, False), 1: (1.5, False), 2: (1.5, False), 3: (1.5, False)})
job2 = pipeline.start("plants2.txt", text=TEXT + " again.", opts={"fresh": True, "owner": U1})
job2.mode = "ai"
while job2.ready() == 0 and time.time() - t0 < 60:
    time.sleep(0.05)
lobby_view = api.job_get(FakeReq(U1, False), job2.id)
ok(lobby_view["status"] == "running" and lobby_view["script"] is None and lobby_view["ready"] >= 1, "the lobby's progress checks stay small (no chapters attached), but report that chapter 1 is ready")
while job2.status in ("queued", "running"):
    time.sleep(0.05)

# 2. the AI gives out after chapters 1 and 2: those stay exactly as they are, chapters 3 and 4 are finished in quick mode
behaviour.clear()
behaviour.update({0: (0.1, False), 1: (0.3, False), 2: (0.5, True), 3: (0.5, True)})
real_sleep = time.sleep
job3 = pipeline.Job("plants3.txt", text=TEXT + " third.", opts={"fresh": True, "owner": U1})
job3.mode = "ai"
pipeline.JOBS[job3.id] = job3
pipeline.time.sleep = lambda s: real_sleep(min(s, 0.01))         # skip the retry pauses
pipeline._run(job3)
pipeline.time.sleep = real_sleep
chs = job3.script["chapters"] if job3.script else []
ok(job3.status == "done" and len(chs) == N, "a build whose AI gives out half way still finishes every chapter")
ok([c.get("madeBy") for c in chs] == ["ai", "ai", None, None], "chapters already written by the AI (maybe being played) are kept; only the missing ones use quick mode")
ok(job3.script.get("quick") and not db.q("SELECT 1 FROM script_cache WHERE game_id=?", (job3.id,), one=True), "the mixed game is marked quick (Rebuild offered later) and not shared as a finished AI game")
ok(all(c["scenes"] for c in chs) and not pipeline.check_script(job3.script), "the quick chapters are complete and the game passes validation")

# 3. a job that never got a chapter shows no chapters to the game page
behaviour.clear()
behaviour.update({i: (1.0, False) for i in range(N)})
job4 = pipeline.start("plants4.txt", text=TEXT + " fourth.", opts={"fresh": True, "owner": U1})
job4.mode = "ai"
time.sleep(0.3)
ok(api.job_get(FakeReq(U1, True), job4.id)["script"] is None, "before chapter 1 is ready the game page is told to wait")
try:
    api.job_get(FakeReq(U2, True), job4.id)
    ok(False, "another student cannot read this build")
except api.Err:
    ok(True, "another student cannot read this build")
while job4.status in ("queued", "running"):
    time.sleep(0.05)
llm.concurrency = real_conc
print("\nEARLY PLAY OK")
