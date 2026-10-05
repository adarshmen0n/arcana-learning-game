"""End-to-end check against a running site: sign up, upload notes, wait for the game, play-answer a few questions, read roadmap and coach, delete the account.
Usage: python server/live_smoke.py https://your-site.onrender.com
"""
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5181").rstrip("/")
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

NOTES = """The Water Cycle. Water moves continuously between oceans, air and land. Evaporation: the sun heats surface water, which turns into water vapour and rises. Transpiration: plants release water vapour from their leaves, adding to the air. Condensation: as vapour rises it cools and condenses into tiny droplets that form clouds. Precipitation: when droplets grow heavy they fall as rain, snow, sleet or hail. Collection: water runs over the ground as surface runoff into rivers, lakes and oceans, or soaks into the soil as infiltration and becomes groundwater. Groundwater slowly flows to the sea, and the cycle repeats. The sun is the energy source that drives the cycle, and gravity pulls precipitation and runoff downhill. Only about 3 percent of Earth's water is fresh, and most of that is frozen in glaciers and ice caps. Humans affect the cycle through dams, irrigation, deforestation and climate change, which alters rainfall patterns and speeds up evaporation. Water vapour is also a greenhouse gas. The residence time of water differs: a day or so in the atmosphere, years in lakes, and thousands of years in deep groundwater and ice. """ * 2


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"Content-Type": "application/json"})
    try:
        with op.open(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def step(msg, cond, extra=""):
    print(("  ok    " if cond else "  FAIL  ") + msg + (f"  {extra}" if extra else ""))
    if not cond:
        sys.exit(1)


name = "smoke" + str(int(time.time()))[-7:]
s, d = call("POST", "/api/register", {"username": name, "password": "smoketest-pass1", "gender": "f"})
step("register", s == 200)
step("session persists", call("GET", "/api/me")[1]["user"]["username"] == name)
s, d = call("POST", "/api/jobs", {"filename": "water-cycle.txt", "text": NOTES})
step("upload accepted", s == 200, d.get("mode", ""))
jid, t0 = d["id"], time.time()
job = {}
while time.time() - t0 < 900:
    s, job = call("GET", "/api/jobs/" + jid)
    if job.get("status") in ("done", "error"):
        break
    time.sleep(5)
step("game built", job.get("status") == "done", f"{round(time.time() - t0)}s | {job.get('title')}")
sc = job["script"]
text = json.dumps(sc).lower()
step("content is about the upload, not the demo", "water" in text and "evapor" in text and "chlorophyll" not in text)
qs = [q for ch in sc["chapters"] for x in ch["scenes"] for q in ([x["question"]] if "question" in x else x.get("questions", []))]
step("has questions", len(qs) >= 8, str(len(qs)))
step("game is stored for this student", any(g["id"] == jid for g in call("GET", "/api/games")[1]))
evs = [{"qid": q["id"], "concept": q["conceptId"], "correct": i % 3 != 0, "difficulty": q["difficulty"], "ms": 6000, "hints": 0, "kind": "test", "chapter": "ch1"} for i, q in enumerate(qs[:12])]
step("answers tracked", call("POST", "/api/events", {"gameId": jid, "events": evs})[1].get("saved") == 12)
call("POST", "/api/progress", {"gameId": jid, "chapterIdx": 1, "score": 200})
rm = call("GET", "/api/roadmap")[1]
g = next(x for x in rm["games"] if x["id"] == jid)
step("roadmap updated", g["nodes"][0]["status"] != "locked" and rm["stats"]["answers"] == 12)
step("adaptation available", call("GET", "/api/adapt?game=" + jid)[1].get("maxHearts", 0) > 0)
co = call("GET", "/api/coach")[1]
step("coach analysis", co["answers"] == 12 and co["plan"])
step("logout", call("POST", "/api/logout")[0] == 200 and call("GET", "/api/games")[0] == 401)
call("POST", "/api/login", {"username": name, "password": "smoketest-pass1"})
step("delete account (cleanup)", call("DELETE", "/api/account")[0] == 200)
print("\nLIVE SMOKE OK")
