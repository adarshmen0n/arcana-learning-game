"""Scale tests on a throwaway database: shared game cache, quick-mode fallback when every AI is busy, build queue, static file serving."""
import functools
import http.client
import os
import sys
import tempfile
import threading
import time

os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
os.environ.pop("DATABASE_URL", None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
import db  # noqa: E402
import llm  # noqa: E402
import pipeline  # noqa: E402
import server  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)
    print("ok -", msg)


def wait(job, limit=60):
    t0 = time.time()
    while job.status in ("queued", "running") and time.time() - t0 < limit:
        time.sleep(0.05)
    return job


db.conn()
TERMS = ["chlorophyll", "stomata", "glucose", "oxygen", "chloroplast", "xylem", "phloem", "respiration", "transpiration", "photosynthesis", "enzyme", "mitochondria",
         "nucleus", "membrane", "osmosis", "diffusion", "cellulose", "starch", "nitrogen", "carbon"]
TEXT = " ".join(f"The {t} plays a key role in plant biology. Scientists describe the {t} as essential for growth in stage {i % 7 + 1}. "
                f"Without {t}, the plant cannot complete process {i}. Students often confuse {t} with {TERMS[(i + 3) % len(TERMS)]}."
                for i, t in enumerate(TERMS * 4))

# 1. every AI busy -> a quick game is still built
calls = {"n": 0}
real_ai = pipeline._ai


def busy_ai(job, text):
    calls["n"] += 1
    raise llm.LLMError("All AI providers are rate-limited right now.")


pipeline._ai = busy_ai
job = pipeline.Job("notes.txt", text=TEXT)
job.mode = "ai"
pipeline.JOBS[job.id] = job
pipeline._run(job)
ok(job.status == "done" and job.script.get("quick") and job.chapters, "when every AI service is busy the student still gets a playable quick game")
ok(not db.q("SELECT 1 FROM script_cache", one=True), "quick games are not shared as finished games")

# 2. a finished AI game is reused for the same material (no AI calls)
def fake_ai(job, text):
    pipeline._offline(job, text)                     # stands in for a real AI build


pipeline._ai = fake_ai
first = pipeline.Job("a.txt", text=TEXT)
first.mode = "ai"
pipeline.JOBS[first.id] = first
pipeline._run(first)
ok(first.status == "done" and db.q("SELECT 1 FROM script_cache", one=True), "a finished AI game is stored for reuse")
pipeline._ai = busy_ai
calls["n"] = 0
second = pipeline.Job("b.txt", text="  " + TEXT.upper() + "  ")
second.mode = "ai"
pipeline.JOBS[second.id] = second
pipeline._run(second)
ok(second.status == "done" and calls["n"] == 0 and not second.script.get("quick") and len(second.chapters) == len(first.chapters), "the same material uploaded again is served instantly from the shared cache")
ok(second.script["projectId"] == second.id, "a reused game gets its own id")
fresh = pipeline.Job("c.txt", text=TEXT, opts={"fresh": True})
fresh.mode = "ai"
pipeline.JOBS[fresh.id] = fresh
pipeline._run(fresh)
ok(calls["n"] == 1, "a rebuild skips the cache and writes a new version")
pipeline._ai = real_ai

# 3. the build queue: at most MAX_PARALLEL run at once
running, peak, lock = [0], [0], threading.Lock()


def slow_offline(job, text):
    with lock:
        running[0] += 1
        peak[0] = max(peak[0], running[0])
    time.sleep(0.4)
    with lock:
        running[0] -= 1
    real_offline(job, text)


real_offline = pipeline._offline
pipeline._offline = slow_offline
jobs = [pipeline.start("q.txt", text=TEXT + f" extra {i}.", opts={"offline": True, "fresh": True}) for i in range(pipeline.MAX_PARALLEL + 3)]
time.sleep(0.15)
ok(any(j.status == "queued" and "queue" in j.message.lower() for j in jobs), "extra builds wait in line and are told their place")
for j in jobs:
    wait(j)
ok(all(j.status == "done" for j in jobs) and peak[0] <= pipeline.MAX_PARALLEL, f"every queued build finishes and no more than {pipeline.MAX_PARALLEL} run at once")
pipeline._offline = real_offline

# 4. static files: gzip, ETag, 304
PORT = 5197
srv = server.Server(("127.0.0.1", PORT), functools.partial(server.Handler, directory=str(config.ROOT / "arcana")))
threading.Thread(target=srv.serve_forever, daemon=True).start()
c = http.client.HTTPConnection("127.0.0.1", PORT)
c.request("GET", "/game.js", headers={"Accept-Encoding": "gzip"})
r = c.getresponse(); body = r.read()
size = os.path.getsize(config.ROOT / "arcana" / "game.js")
ok(r.status == 200 and r.getheader("Content-Encoding") == "gzip" and len(body) < size * 0.5, f"game files are compressed ({len(body) // 1024} KB instead of {size // 1024} KB)")
etag = r.getheader("ETag")
c = http.client.HTTPConnection("127.0.0.1", PORT)
c.request("GET", "/game.js", headers={"If-None-Match": etag})
r = c.getresponse(); r.read()
ok(r.status == 304, "unchanged files are not sent again")
c = http.client.HTTPConnection("127.0.0.1", PORT)
c.request("GET", "/")
r = c.getresponse(); r.read()
ok(r.status == 200 and r.getheader("Cache-Control") == "no-cache", "pages are always checked for updates")
c = http.client.HTTPConnection("127.0.0.1", PORT)
c.request("GET", "/api/status")
r = c.getresponse(); r.read()
ok(r.getheader("Cache-Control") == "no-store", "API answers are never cached")

# 5. many players at once
errors = []


def hammer():
    try:
        for _ in range(10):
            cc = http.client.HTTPConnection("127.0.0.1", PORT, timeout=20)
            cc.request("GET", "/api/status")
            rr = cc.getresponse(); rr.read()
            if rr.status != 200:
                errors.append(rr.status)
    except Exception as e:
        errors.append(str(e))


ts = [threading.Thread(target=hammer) for _ in range(40)]
t0 = time.time()
[t.start() for t in ts]
[t.join() for t in ts]
ok(not errors, f"400 requests from 40 players at once all succeed ({time.time() - t0:.1f}s)")
srv.shutdown()
print("\nSCALE OK")
