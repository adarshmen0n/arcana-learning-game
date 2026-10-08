"""Offline tests for the AI layer. No keys, no cost: local stand-in services pretend to be Claude and OpenAI-compatible APIs.
Checks: request shapes, verify/drop/assemble logic, and provider failover (rate limit, bad JSON, document too long, all failing)."""
import tempfile as _t
os_ = __import__("os")
os_.environ["ARCANA_DATA"] = _t.mkdtemp()
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for k in list(os.environ):
    if k.endswith("_API_KEY") or k.startswith(("ARCANA_", "CUSTOM_", "OLLAMA_")):
        del os.environ[k]
os.environ["ARCANA_PROVIDERS"] = "claude,gemini,groq"
os.environ["ANTHROPIC_API_KEY"] = "test-claude"
os.environ["ANTHROPIC_BASE_URL"] = "http://127.0.0.1:5199"
os.environ["GEMINI_API_KEY"] = "test-gemini"
os.environ["GROQ_API_KEY"] = "test-groq"
import llm  # noqa: E402
import pipeline  # noqa: E402
import pathlib, tempfile
pipeline.SCRIPTS = pathlib.Path(tempfile.mkdtemp())   # tests never touch your saved games

SEEN = {"claude": [], "gemini": [], "groq": []}


def question(n, topic="x"):
    return {"prompt": f"Question {n} about {topic}?", "options": [f"{topic} A{n}", f"{topic} B{n}", f"{topic} C{n}", f"{topic} D{n}"], "correct_index": n % 4,
            "explanation": f"Because {topic}.", "concept_id": "c1", "difficulty": 1 + n % 3}


def payload_for(props, user):
    if "final_boss_name" in props:
        return {"title": "Test Game", "subject": "bio", "level": "school", "summary": "A test.", "final_boss_name": "Core Tyrant",
                "concepts": [{"id": "c1", "name": "Chlorophyll", "summary": "pigment", "importance": 9, "complexity": 2, "needs_research": True, "research_query": "chlorophyll spectrum"},
                             {"id": "c2", "name": "Photolysis", "summary": "water split", "importance": 3, "complexity": 3, "needs_research": False, "research_query": ""}],
                "chapters": [{"title": "Light", "goal": "Understand light", "concept_ids": ["c1"], "mood": "science", "fight": "magic", "boss_name": "Prism Warden", "npc_names": ["Ada", "Ben"]},
                             {"title": "Water", "goal": "Understand water", "concept_ids": ["c2", "bogus"], "mood": "history", "fight": "martial", "boss_name": "Aqua Brute", "npc_names": ["Solo"]}]}
    if "npcs" in props:
        return {"npcs": [{"npc_name": "Ada", "concept_ids": ["c1"], "lines": [{"text": "Chlorophyll absorbs light energy.", "highlight": ["Chlorophyll", "nothere"]}, {"text": "Second line.", "highlight": []}], "teacher_note": "Ask why leaves are green.", "key_idea": "Chlorophyll absorbs light."},
                         {"npc_name": "Ben", "concept_ids": ["c2"], "lines": [{"text": "Water is split.", "highlight": ["Water"]}], "teacher_note": "Draw it.", "key_idea": "Water splits."}]}
    if "tablets" in props:
        return {"tablets": [{"title": "Light", "concept_ids": ["c1"], "points": ["Chlorophyll absorbs light energy.", "Leaves look green because green light is reflected."], "example": "A leaf in sunlight.", "mistake": "Plants do not eat soil.", "terms": [{"term": "Chlorophyll", "meaning": "green pigment"}]},
                            {"title": "Water", "concept_ids": ["c2"], "points": ["Water is split in light.", "Oxygen is released."], "example": "Bubbles from pond weed.", "mistake": "", "terms": []}],
                "mission": {"kind": "order", "instruction": "Order the steps.", "items": ["one", "two", "three", "four"], "pairs": []}}
    if "test" in props and "obstacles" not in props:
        it = iter(range(20, 40))
        return {"test": [question(next(it)) for _ in range(4)], "spare": [question(next(it)) for _ in range(3)]}
    if "obstacles" in props:
        it = iter(range(40))
        nxt = lambda: question(next(it))
        return {"obstacles": [{"question": nxt(), "hint": "hint 1"}, {"question": nxt(), "hint": "hint 2"}], "match": [nxt() for _ in range(3)], "arcade": [nxt() for _ in range(3)]}
    ids = re.findall(r"^(q\d+):", user, re.M)       # verify: agree with the claimed answer (n % 4) except q3 invalid, q5 disagrees
    return {"results": [{"id": i, "valid": i != "q3", "correct_index": (int(i[1:]) + (1 if i == "q5" else 0)) % 4, "issue": ""} for i in ids]}


class Quiet(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, obj, headers=None):
        out = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(out)


class FakeClaude(Quiet):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        SEEN["claude"].append(body)
        fmt = (body.get("output_config") or {}).get("format")
        if body.get("tools"):
            content = [{"type": "server_tool_use", "id": "s1", "name": "web_search", "input": {"query": "q"}},
                       {"type": "web_search_tool_result", "tool_use_id": "s1", "content": [{"type": "web_search_result", "url": "https://example.org/a", "title": "A", "encrypted_content": "x", "page_age": None}]},
                       {"type": "text", "text": "Researched notes."}]
        elif fmt:
            content = [{"type": "text", "text": json.dumps(payload_for(fmt["schema"]["properties"], body["messages"][0]["content"]))}]
        else:
            content = [{"type": "text", "text": "ok"}]
        self.reply(200, {"id": "m", "type": "message", "role": "assistant", "model": body["model"], "content": content, "stop_reason": "end_turn", "stop_sequence": None,
                         "usage": {"input_tokens": 1000, "output_tokens": 500, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}})


def compat_handler(name, behaviour):
    class H(Quiet):
        def do_GET(self):
            self.reply(200, {"data": [{"id": "models/whisper-x"}, {"id": "models/big-model-70b"}]})

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            SEEN[name].append(body)
            mode = behaviour[0]
            if mode == "ratelimit":
                return self.reply(429, {"error": {"message": "Rate limit reached. Please try again in 1.5s"}}, {"retry-after": "2"})
            if mode == "badjson":
                return self.reply(200, {"choices": [{"message": {"content": "sorry, here you go: not json"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}})
            if mode == "rejected":
                return self.reply(401, {"error": {"message": "invalid key"}})
            user = body["messages"][-2]["content"] if body["messages"][-1]["role"] == "user" and len(body["messages"]) > 2 else body["messages"][-1]["content"]
            schema = json.loads(body["messages"][1]["content"].split("JSON Schema:\n", 1)[1])
            data = payload_for(schema["properties"], body["messages"][1]["content"])
            self.reply(200, {"choices": [{"message": {"content": "```json\n" + json.dumps(data) + "\n```"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 100, "completion_tokens": 50}})
    return H


class Srv(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def serve(port, handler):
    threading.Thread(target=Srv(("127.0.0.1", port), handler).serve_forever, daemon=True).start()


def rebuild(gemini_mode, groq_mode, order="claude,gemini,groq", claude=True):
    GEM[0], GRQ[0] = gemini_mode, groq_mode
    llm.COMPAT["gemini"] = ("http://127.0.0.1:5197",) + llm.COMPAT["gemini"][1:]
    llm.COMPAT["groq"] = ("http://127.0.0.1:5198",) + llm.COMPAT["groq"][1:]
    os.environ["ARCANA_PROVIDERS"] = order
    if claude:
        os.environ["ANTHROPIC_API_KEY"] = "test-claude"
    else:
        os.environ.pop("ANTHROPIC_API_KEY", None)
    llm.PROVIDERS[:] = llm._build()
    for k in SEEN:
        SEEN[k].clear()


def run(text, name="notes.txt"):
    job = pipeline.start(name, text=text)
    t0 = time.time()
    while job.status in ("queued", "running") and time.time() - t0 < 90:
        time.sleep(0.1)
    return job


GEM, GRQ = ["ok"], ["ok"]
serve(5199, FakeClaude)
serve(5197, compat_handler("gemini", GEM))
serve(5198, compat_handler("groq", GRQ))
TEXT = open(os.path.join(os.path.dirname(__file__), "..", "samples", "photosynthesis.txt"), encoding="utf-8").read()


def show(title, job):
    p = job.public()
    print(f"\n== {title}: {p['status']} | chapters {p['ready']}/{p['total']} | {p['error'] or ''}")
    for l in p["logs"]:
        if any(w in l["msg"] for w in ("claude", "gemini", "groq", "Continued", "busy", "skipped", "removed")):
            print("   ", l["msg"])
    return p


# 1. Claude path: request shapes, web search, verify/drop
rebuild("ok", "ok", order="claude")
job = run(TEXT)
p = show("Claude only", job)
assert p["status"] == "done", p["error"]
first = SEEN["claude"][0]
assert first["output_config"]["format"]["type"] == "json_schema" and any(b.get("cache_control") for b in first["system"])
assert any(c.get("tools") and c["tools"][0]["type"] == "web_search_20260209" for c in SEEN["claude"])
ch1 = job.script["chapters"][0]
assert ch1["theme"]["background"] == "crystal_cave" and job.script["chapters"][1]["theme"]["background"] == "desert_canyon"
assert ch1["scenes"][0]["dialogue"][0]["highlight"] == ["Chlorophyll"] and ch1["concepts"][0].get("sources")
assert pipeline.check_script(job.script) == []

# 2. Rate-limited first provider -> second takes over
rebuild("ratelimit", "ok", order="gemini,groq", claude=False)
job = run(TEXT)
p = show("gemini rate-limited -> groq", job)
assert p["status"] == "done" and SEEN["groq"], p["error"]
assert llm.PROVIDERS[0].state() == "cooling"
assert any("web research skipped" in l["msg"].lower() for l in p["logs"])

# 3. Bad JSON from first, then it works on the second
rebuild("badjson", "ok", order="gemini,groq", claude=False)
job = run(TEXT)
p = show("gemini bad JSON -> groq", job)
assert p["status"] == "done" and SEEN["groq"]

# 4. Rejected key is dropped for good
rebuild("rejected", "ok", order="gemini,groq", claude=False)
job = run(TEXT)
p = show("gemini key rejected -> groq", job)
assert p["status"] == "done" and llm.PROVIDERS[0].dead

# 5. Long document: the planning call skips groq's small limit; chapter calls get only the retrieved passages
rebuild("ok", "ok", order="groq,gemini", claude=False)
long_text = (TEXT + "\n\n") * 8
assert len(long_text) > llm.PROVIDERS[0].max_chars
job = run(long_text)
p = show("long document -> gemini only", job)
assert p["status"] == "done" and SEEN["gemini"]      # planning needs the big-context model; chapters use retrieved passages and may fit smaller ones

# 6. Everything failing gives a clear message, not a crash
rebuild("rejected", "rejected", order="gemini,groq", claude=False)
job = run(TEXT)
p = show("all providers failing", job)
assert p["status"] == "error" and "failed" in p["error"].lower(), p
print("\nALL OK")
