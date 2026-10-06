"""Platform tests on a throwaway database: accounts, privacy between students, mastery, adaptation, roadmap."""
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
    def __init__(self):
        self.cookie = None

    def call(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", PORT)
        h = {"Content-Type": "application/json"}
        if self.cookie:
            h["Cookie"] = self.cookie
        c.request(method, path, json.dumps(body) if body is not None else None, h)
        r = c.getresponse()
        sc = r.getheader("Set-Cookie")
        if sc:
            self.cookie = None if sc.startswith("arcana_session=;") else sc.split(";")[0]
        return r.status, json.loads(r.read() or b"{}")


def ok(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    assert cond, msg


import pathlib
SAMPLE = json.loads((pathlib.Path(__file__).parent / "fixtures" / "sample_game.json").read_text(encoding="utf-8"))
GID = "fixture0game1"
STARTER = SAMPLE
QS = [q for ch in STARTER["chapters"] for s in ch["scenes"] for q in ([s["question"]] if "question" in s else s.get("questions", []))]


def ev(q, correct, ms=8000, hints=0):
    return {"qid": q["id"], "concept": q["conceptId"], "correct": correct, "difficulty": q["difficulty"], "ms": ms, "hints": hints, "kind": "test", "chapter": "ch1"}


print("accounts")
A = Client()
ok(A.call("POST", "/api/register", {"username": "a b", "email": "a@example.com", "password": "longenough1", "acceptTerms": True})[0] == 400, "rejects an invalid display name")
ok(A.call("POST", "/api/register", {"username": "alex_9", "email": "alex@example.com", "password": "short", "acceptTerms": True})[0] == 400, "rejects a short password")
ok(A.call("POST", "/api/register", {"username": "alex_9", "email": "alex@example.com", "password": "password1", "acceptTerms": True})[0] == 400, "rejects a common password")
ok(A.call("POST", "/api/register", {"username": "alex_9", "email": "not-an-email", "password": "longenough1", "acceptTerms": True})[0] == 400, "rejects a bad email")
ok(A.call("POST", "/api/register", {"username": "alex_9", "email": "alex@example.com", "password": "longenough1"})[0] == 400, "requires accepting the terms")
s, d = A.call("POST", "/api/register", {"username": "Alex_9", "email": "Alex@Example.com", "password": "longenough1", "gender": "f", "acceptTerms": True})
ok(s == 200 and A.cookie and d["user"]["gender"] == "f", "registers, signs in, remembers the ranger choice")
ok(db.q("SELECT pw_hash FROM users", one=True)["pw_hash"].startswith("scrypt$"), "password is stored hashed")
ok(Client().call("POST", "/api/register", {"username": "alex_9", "email": "other@example.com", "password": "longenough1", "acceptTerms": True})[0] == 409, "duplicate display name (any case) is refused")
ok(Client().call("POST", "/api/register", {"username": "someone", "email": "ALEX@example.com", "password": "longenough1", "acceptTerms": True})[0] == 409, "duplicate email (any case) is refused")
ok(Client().call("POST", "/api/login", {"login": "alex@example.com", "password": "longenough1"})[0] == 200, "login works with the email address")
ok(A.call("GET", "/api/me")[1]["user"]["username"] == "Alex_9", "the session cookie keeps the student logged in")
ok(Client().call("POST", "/api/login", {"username": "alex_9", "password": "wrongpass1"})[0] == 401, "wrong password is refused")
ok(Client().call("GET", "/api/games")[0] == 401, "private data needs a login")
A.call("POST", "/api/profile", {"gender": "m"})
ok(A.call("GET", "/api/me")[1]["user"]["gender"] == "m", "ranger choice can be changed")

print("privacy between students")
B = Client()
B.call("POST", "/api/register", {"username": "bella", "email": "bella@example.com", "password": "longenough2", "acceptTerms": True})
uid_a = db.q("SELECT id FROM users WHERE username='Alex_9'", one=True)["id"]
db.add_game("aaaa1111bbbb2222", uid_a, "Alex's private game")
db.add_game(GID, uid_a, SAMPLE["title"])
db.save_script(GID, SAMPLE)
db.save_script("aaaa1111bbbb2222", {"title": "Alex's private game", "chapters": [], "finalBoss": {}})
ok(A.call("GET", "/api/scripts/aaaa1111bbbb2222")[0] == 200, "owner can open their game")
ok(B.call("GET", "/api/scripts/aaaa1111bbbb2222")[0] == 404, "another student cannot open it")
ok(B.call("POST", "/api/events", {"gameId": "aaaa1111bbbb2222", "events": [ev(QS[0], True)]})[0] == 403, "cannot send answers into someone else's game")
ok(B.call("POST", "/api/progress", {"gameId": "aaaa1111bbbb2222", "chapterIdx": 1})[0] == 403, "cannot write progress into someone else's game")
ok(B.call("DELETE", "/api/games/aaaa1111bbbb2222")[0] == 404, "cannot delete it")
ok(B.call("GET", "/api/games")[1] == [], "a new student starts with no games and sees nobody else's")
ok(A.call("GET", "/api/jobs/anything")[0] == 404, "unknown build jobs are hidden")

print("mastery + performance tracking")
for q_ in QS[:6]:
    A.call("POST", "/api/events", {"gameId": GID, "events": [ev(q_, True)]})
m = {r["concept"]: r["m"] for r in db.mastery_rows(uid_a, GID)}
ok(all(v > 0.3 for v in m.values()) and len(m) >= 2, "correct answers raise mastery for the concepts asked")
st = A.call("GET", "/api/stats")[1]
ok(st["answers"] == 6 and st["accuracy"] == 100 and st["pace"] == 8.0, "accuracy and pace are tracked")
ok(B.call("GET", "/api/stats")[1]["answers"] == 0, "the other student's record is separate")

print("the game adapts to the student")
a0 = A.call("GET", "/api/adapt?game=" + GID)[1]
ok(a0["difficulty"] == 3 and "still learning" in a0["why"], "starts at the middle setting while data is thin")
A.call("POST", "/api/events", {"gameId": GID, "events": [ev(q_, True) for q_ in QS[6:20]]})
a1 = A.call("GET", "/api/adapt?game=" + GID)[1]
ok(a1["difficulty"] == 4 and a1["maxHearts"] == 4 and a1["bossRatioDelta"] > 0, "strong accuracy raises difficulty (fewer hearts, stricter bosses)")
ok(A.call("GET", "/api/adapt?game=" + GID)[1]["difficulty"] == 4, "asking again does not keep climbing")
A.call("POST", "/api/events", {"gameId": GID, "events": [ev(q_, False, hints=1) for q_ in QS[0:14]]})
a2 = A.call("GET", "/api/adapt?game=" + GID)[1]
ok(a2["difficulty"] == 3, "a run of mistakes lowers it again")
ok(a2["practice"] and set(a2["practice"]) <= {q_["id"] for q_ in QS}, "missed questions are queued for practice")
ok(any(w["mastery"] < 0.55 for w in a2["weak"]), "weak topics are named with their mastery")
ok(B.call("GET", "/api/adapt?game=" + GID)[0] == 403 and B.call("GET", "/api/adapt")[1]["difficulty"] == 3, "the other student's setup is untouched")

print("roadmap")
rm = A.call("GET", "/api/roadmap")[1]
g = next(x for x in rm["games"] if x["id"] == GID)
ok(g["id"] == GID and len(g["nodes"]) == 3 and g["nodes"][0]["status"] == "current" and g["nodes"][1]["status"] == "locked", "chapters are unlocked in order")
A.call("POST", "/api/progress", {"gameId": GID, "chapterIdx": 1, "score": 300})
g = next(x for x in A.call("GET", "/api/roadmap")[1]["games"] if x["id"] == GID)
ok(g["nodes"][0]["status"] in ("done", "review", "mastered") and g["nodes"][1]["status"] == "current", "finishing a chapter moves the path forward")
ok(g["nodes"][0]["status"] == "review" or g["nodes"][0]["mastery"] is not None, "chapter mastery is shown")
ok(any(n["kind"] in ("continue", "practice", "review") for n in A.call("GET", "/api/roadmap")[1]["next"]), "recommendations are generated")
ok(A.call("GET", "/api/roadmap")[1]["achievements"][1]["earned"], "achievements update")

print("uploads + limits")
ok(Client().call("POST", "/api/jobs", {"text": "x" * 500})[0] == 401, "uploading needs a login")
ok(A.call("POST", "/api/jobs", {})[0] == 400, "an empty upload is refused")
for i in range(config.MAX_GAMES_PER_DAY):
    db.add_game(f"fill{i}aaaa", uid_a, "x")
ok(A.call("POST", "/api/jobs", {"text": "word " * 200})[0] == 429, "the daily limit protects the free AI quota")
for i in range(11):
    last = Client().call("POST", "/api/login", {"login": "alex_9", "password": "nope" + str(i)})[0]
ok(last == 429, "repeated wrong passwords are rate-limited")
api._hits.clear()
bad = http.client.HTTPConnection("127.0.0.1", PORT)
bad.request("POST", "/api/login", "{}", {"Content-Type": "text/plain"})
ok(bad.getresponse().status == 415, "non-JSON POST is refused")

print("passwords, reset, support, export")
ok(A.call("POST", "/api/password", {"current": "wrong-one", "new": "brandnew-pass9"})[0] == 403, "changing the password needs the current one")
ok(A.call("POST", "/api/password", {"current": "longenough1", "new": "brandnew-pass9"})[0] == 200 and A.call("GET", "/api/me")[1]["user"], "password can be changed and this device stays signed in")
ok(Client().call("POST", "/api/login", {"login": "alex_9", "password": "longenough1"})[0] == 401, "the old password stops working")
ok(Client().call("POST", "/api/forgot", {"email": "alex@example.com"})[0] == 503, "forgot-password is honest when email is not configured")
tok = db.make_reset(uid_a)
ok(Client().call("POST", "/api/reset", {"token": "nope", "password": "another-pass77"})[0] == 400, "a wrong reset token is refused")
C = Client()
ok(C.call("POST", "/api/reset", {"token": tok, "password": "another-pass77"})[0] == 200 and C.call("GET", "/api/me")[1]["user"]["username"] == "Alex_9", "a valid reset link sets a new password and signs in")
ok(C.call("POST", "/api/reset", {"token": tok, "password": "yet-another-77"})[0] == 400, "a reset link works only once")
ok(A.call("GET", "/api/me")[1]["user"] is None, "a reset signs out the other devices")
A.cookie = C.cookie
ok(A.call("POST", "/api/support", {"subject": "x", "message": "short"})[0] == 400, "support needs a real message")
s_, d_ = A.call("POST", "/api/support", {"category": "bug", "subject": "Game will not load", "message": "The chapter screen stays black after I press start."})
ok(s_ == 200 and d_["id"], "a support ticket is saved")
ok(Client().call("POST", "/api/support", {"email": "guest@example.com", "subject": "Question", "message": "How do I upload a PDF file please?"})[0] == 200, "visitors without an account can contact support")
ok(len(A.call("GET", "/api/support")[1]) == 1, "students see their own tickets")
ok(A.call("GET", "/api/admin/tickets")[0] == 403, "the support inbox is admin only")
ex = A.call("GET", "/api/export")[1]
ok(ex["account"]["email"] == "alex@example.com" and ex["answers"] and "pw_hash" not in json.dumps(ex), "data export has the student's records and no password hash")

print("coach + google")
co = A.call("GET", "/api/coach")[1]
ok(co["answers"] >= 20 and co["plan"] and "byDifficulty" in co and "speed" in co, "the coach analyses stored answers (accuracy by difficulty, speed, hints)")
ok(Client().call("GET", "/api/coach")[0] == 401, "the coach needs a login")
ok(Client().call("POST", "/api/google", {"credential": "x" * 200})[0] == 404, "Google sign-in is off until a client id is configured")
gu = db.google_user("sub123", "pat.lee@gmail.com", "pat.lee")
ok(gu["username"] == "pat.lee" and db.google_user("sub123", "pat.lee@gmail.com", "pat.lee")["id"] == gu["id"], "a Google identity maps to one account")
ok(db.login("pat.lee", "google") is None, "Google accounts cannot be entered with a password")

print("logout + delete account")
ok(A.call("POST", "/api/logout")[0] == 200 and A.call("GET", "/api/me")[1]["user"] is None, "logout ends the session")
s, _ = A.call("POST", "/api/login", {"login": "alex_9", "password": "another-pass77"})
ok(s == 200, "logging back in works")
ok(A.call("DELETE", "/api/account")[0] == 200 and db.q("SELECT COUNT(*) n FROM events", one=True)["n"] == 0, "deleting the account removes the student's answers")
ok(db.get_script("aaaa1111bbbb2222") is None, "...and their private games")
print("\nPLATFORM OK")
