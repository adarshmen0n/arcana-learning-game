"""Platform tests on a throwaway database: accounts, classes, students, permissions, events, reports, rate limits."""
import functools
import http.client
import json
import os
import sys
import tempfile
import threading

os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api  # noqa: E402
import config  # noqa: E402
import db  # noqa: E402
import pipeline  # noqa: E402
import server  # noqa: E402

PORT = 5196
srv = server.Server(("127.0.0.1", PORT), functools.partial(server.Handler, directory=str(config.ROOT / "arcana")))
threading.Thread(target=srv.serve_forever, daemon=True).start()


class Client:
    def __init__(self, token=None):
        self.cookie, self.token = None, token

    def call(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", PORT)
        h = {"Content-Type": "application/json"}
        if self.cookie:
            h["Cookie"] = self.cookie
        if self.token:
            h["X-Student-Token"] = self.token
        h.update(headers or {})
        c.request(method, path, json.dumps(body) if body is not None else None, h)
        r = c.getresponse()
        sc = r.getheader("Set-Cookie")
        if sc:
            self.cookie = sc.split(";")[0] if "=;" not in sc and not sc.startswith("arcana_session=;") else None
        data = json.loads(r.read() or b"{}")
        return r.status, data


def ok(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    assert cond, msg


# a finished game on disk, as the pipeline would leave it
game = {"schemaVersion": 1, "title": "Demo Game", "chapters": [{"id": "ch1", "title": "One", "goal": "g", "theme": {"background": "ancient_forest"}, "concepts": [{"id": "c1", "name": "Chlorophyll"}, {"id": "c2", "name": "Stroma"}],
        "scenes": [{"type": "obstacle", "id": "s1", "question": {"id": "q1", "conceptId": "c1", "prompt": "Pigment?", "options": ["A", "B"], "correctIndex": 0, "explanation": "x"}},
                   {"type": "match", "id": "s2", "opponent": {"name": "R", "skill": 0.5}, "questions": [{"id": "q2", "conceptId": "c2", "prompt": "Where?", "options": ["X", "Y"], "correctIndex": 1, "explanation": "y"}]},
                   {"type": "mini_boss", "id": "s3", "boss": {"name": "B", "kind": "enforcer"}, "count": 2}]}],
        "finalBoss": {"title": "F", "goal": "g", "theme": {"background": "ember_citadel"}, "boss": {"name": "O", "kind": "overlord"}, "count": 25, "passMarkRatio": 0.7}}
GID = "abcdef0123456789"
(pipeline.SCRIPTS / f"{GID}.json").write_text(json.dumps(game), encoding="utf-8")

print("teacher accounts")
T = Client()
s, d = T.call("POST", "/api/teacher/register", {"email": "bad", "name": "Ms Rao", "password": "longenough1"})
ok(s == 400, "rejects an invalid email")
s, d = T.call("POST", "/api/teacher/register", {"email": "rao@school.org", "name": "Ms Rao", "password": "short"})
ok(s == 400, "rejects a short password")
s, d = T.call("POST", "/api/teacher/register", {"email": "rao@school.org", "name": "Ms Rao", "password": "longenough1"})
ok(s == 200 and T.cookie, "registers and signs in")
ok(db.q("SELECT pw_hash FROM teachers", one=True)["pw_hash"].startswith("scrypt$"), "password is stored hashed")
s, d = T.call("GET", "/api/me")
ok(d["teacher"]["email"] == "rao@school.org", "session cookie identifies the teacher")
ok(Client().call("POST", "/api/teacher/login", {"email": "rao@school.org", "password": "wrongpass1"})[0] == 401, "wrong password is refused")
ok(Client().call("POST", "/api/teacher/register", {"email": "RAO@school.org", "name": "x", "password": "longenough1"})[0] == 409, "duplicate email (any case) is refused")

print("classes + games")
ok(Client().call("GET", "/api/classes")[0] == 401, "classes need a login")
s, d = T.call("POST", "/api/classes", {"name": "Grade 9 Biology"})
CID = d["id"]
s, lst = T.call("GET", "/api/classes")
CODE = lst[0]["code"]
ok(len(CODE) == 6 and lst[0]["students"] == 0, f"class created with a 6-character join code")
db.add_game(GID, db.q("SELECT id FROM teachers", one=True)["id"], "Demo Game")
ok(T.call("POST", f"/api/classes/{CID}/assign", {"gameId": GID})[0] == 200, "assigns a game to the class")
ok(T.call("POST", f"/api/classes/{CID}/assign", {"gameId": "0000000000000000"})[0] == 404, "cannot assign a game that does not exist")

print("other teacher is locked out")
T2 = Client()
T2.call("POST", "/api/teacher/register", {"email": "other@school.org", "name": "Other", "password": "longenough2"})
ok(T2.call("GET", f"/api/classes/{CID}/report?game={GID}")[0] == 404, "cannot read another teacher's report")
ok(T2.call("DELETE", f"/api/classes/{CID}")[0] == 404, "cannot delete another teacher's class")
ok(T2.call("POST", f"/api/classes/{CID}/assign", {"gameId": GID})[0] == 404, "cannot assign into another teacher's class")
ok(T2.call("GET", "/api/classes")[1] == [], "sees only their own classes")

print("students")
S1, S2 = Client(), Client()
ok(S1.call("POST", "/api/join", {"code": "ZZZZZZ", "nickname": "Mia"})[0] == 404, "unknown code is refused")
ok(S1.call("POST", "/api/join", {"code": CODE, "nickname": "<b>"})[0] == 400, "unsafe nickname is refused")
s, d = S1.call("POST", "/api/join", {"code": CODE.lower(), "nickname": "Mia"})
ok(s == 200 and d["games"][0]["id"] == GID and d["className"] == "Grade 9 Biology", "joins with the code (any case) and sees assigned games")
S1.token = d["token"]
ok(S2.call("POST", "/api/join", {"code": CODE, "nickname": "mia"})[0] == 409, "nickname taken (case-insensitive)")
ok(Client().call("POST", "/api/join", {"code": CODE, "nickname": "Mia", "token": d["token"]})[0] == 200, "same device can rejoin with its token")
s, d2 = S2.call("POST", "/api/join", {"code": CODE, "nickname": "Leo"})
S2.token = d2["token"]

print("events + progress")
ev = lambda q, c, ok_: {"qid": q, "concept": c, "correct": ok_, "kind": "obstacle", "chapter": "ch1"}
ok(Client().call("POST", "/api/events", {"gameId": GID, "events": []})[0] == 401, "events need a student token")
ok(S1.call("POST", "/api/events", {"gameId": "ffffffffffffffff", "events": [ev("q1", "c1", True)]})[0] == 403, "events for an unassigned game are refused")
ok(S1.call("POST", "/api/events", {"gameId": GID, "events": [ev("q1", "c1", True), ev("q2", "c2", False), ev("q2", "c2", False)]})[1]["saved"] == 3, "saves answers")
S2.call("POST", "/api/events", {"gameId": GID, "events": [ev("q1", "c1", False), ev("q2", "c2", False)]})
S1.call("POST", "/api/progress", {"gameId": GID, "chapterIdx": 1, "score": 120, "finished": True})
S1.call("POST", "/api/progress", {"gameId": GID, "chapterIdx": 0, "score": 50})
ok(S1.call("GET", f"/api/progress?game={GID}")[1]["progress"] == {"chapter": 1, "score": 120, "finished": True}, "progress only moves forward (no regress)")
ok(S1.call("GET", "/api/student/games")[1]["games"][0]["progress"]["finished"] is True, "student sees their own progress")

print("teacher report")
s, rep = T.call("GET", f"/api/classes/{CID}/report?game={GID}")
ok(s == 200 and rep["summary"]["students"] == 2 and rep["summary"]["finished"] == 1, "summary counts students and finishers")
ok(rep["concepts"][0]["name"] == "Stroma" and rep["concepts"][0]["accuracy"] == 0, "weakest concept is named and ranked first")
ok(rep["hardest"][0]["prompt"] == "Where?" and rep["hardest"][0]["answer"] == "Y", "hardest question shows the right answer")
ok({x["nickname"]: x["answered"] for x in rep["students"]} == {"Leo": 2, "Mia": 3}, "per-student answer counts")

print("limits + cleanup")
for i in range(11):
    last = Client().call("POST", "/api/teacher/login", {"email": "rao@school.org", "password": "nope" + str(i)})[0]
ok(last == 429, "repeated wrong passwords are rate-limited")
ok(T.call("POST", "/api/teacher/logout")[0] == 200 and T.call("GET", "/api/me")[1]["teacher"] is None, "logout ends the session")
T.cookie = None; api._hits.clear()
T.call("POST", "/api/teacher/login", {"email": "rao@school.org", "password": "longenough1"})
ok(T.call("DELETE", f"/api/classes/{CID}")[0] == 200 and db.q("SELECT COUNT(*) n FROM students", one=True)["n"] == 0, "deleting a class removes its students and answers")
bad = http.client.HTTPConnection("127.0.0.1", PORT)
bad.request("POST", "/api/join", "{}", {"Content-Type": "text/plain"})
ok(bad.getresponse().status == 415, "non-JSON POST is refused (blocks cross-site form posts)")
print("\nPLATFORM OK")
