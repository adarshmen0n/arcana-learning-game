"""Runs one real generation with the current providers and reports the teaching-to-question balance and a sample of the lessons."""
import collections, os, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
import pipeline  # noqa: E402

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
job = pipeline.start(os.path.basename(path), text=text)
t0, seen = time.time(), 0
while job.status in ("queued", "running") and time.time() - t0 < 1200:
    time.sleep(2)
    logs = job.public()["logs"]
    for l in logs[seen:]:
        print(f"  [{l['t']:>5}s] {l['msg'][:150]}", flush=True)
    seen = len(logs)
print("STATUS", job.status, job.error or "", f"{round(time.time() - t0)}s")
if job.status == "done":
    for ch in job.script["chapters"]:
        c = collections.Counter(s["type"] for s in ch["scenes"])
        lines = sum(len(s["dialogue"]) for s in ch["scenes"] if s["type"] == "npc")
        chars = sum(len(l["text"]) for s in ch["scenes"] if s["type"] == "npc" for l in s["dialogue"]) + sum(len(" ".join(s["tablet"]["points"])) + len(s["tablet"]["example"]) for s in ch["scenes"] if s["type"] == "tablet")
        qs = sum(len(s.get("questions", [])) + ("question" in s) for s in ch["scenes"])
        print(f"\n== {ch['id']} {ch['title']}: mentors {c['npc']} ({lines} lines), tablets {c['tablet']}, teaching text {chars} chars, questions {qs}, scenes {[s['type'] for s in ch['scenes']]}")
        for s in ch["scenes"][:2]:
            if s["type"] == "npc":
                print(f"  {s['npc']['name']} [{s.get('role')}]:")
                for l in s["dialogue"]:
                    print("    -", l["text"][:200])
                print("    KEY IDEA:", s.get("keyIdea", "")[:160])
            if s["type"] == "tablet":
                print("  TABLET:", s["tablet"]["title"])
                for p in s["tablet"]["points"]:
                    print("    *", p[:180])
                print("    EXAMPLE:", s["tablet"]["example"][:200])
