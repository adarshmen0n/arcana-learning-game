"""Runs one real upload through the live providers and prints what came out (uses your free quota)."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm, pipeline

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "samples", "photosynthesis.txt")
text = open(path, encoding="utf-8").read()
print("providers:", llm.label())
job = pipeline.start(os.path.basename(path), text=text)
t0 = time.time()
seen = 0
while job.status in ("queued", "running") and time.time() - t0 < 600:
    time.sleep(1)
    logs = job.public()["logs"]
    for l in logs[seen:]:
        print(f"  [{l['t']:>5}s] {l['msg']}")
    seen = len(logs)
p = job.public()
for l in p["logs"][seen:]:
    print(f"  [{l['t']:>5}s] {l['msg']}")
print("STATUS:", p["status"], p["error"] or "", "| usage:", p["usage"])
if p["status"] == "done":
    s = job.script
    print("TITLE:", s["title"], "| source:", s["source"])
    for ch in s["chapters"]:
        print(f"\n== {ch['id']} {ch['title']}  [{ch['theme']['background']}]  goal: {ch['goal']}")
        for sc in ch["scenes"]:
            if sc["type"] == "npc":
                print(f"  NPC {sc['npc']['name']}: {sc['dialogue'][0]['text'][:150]}")
            elif sc["type"] in ("obstacle",):
                q = sc["question"]; print(f"  Q: {q['prompt'][:110]}  -> {q['options'][q['correctIndex']][:50]}")
            elif sc["type"] == "mission":
                print("  MISSION:", sc["mission"]["kind"], str(sc["mission"].get("items") or sc["mission"].get("pairs"))[:140])
            elif sc["type"] == "mini_boss":
                print("  BOSS:", sc["boss"])
        n = sum(len(x.get("questions", [])) + ("question" in x) for x in ch["scenes"])
        print("  questions:", n)
