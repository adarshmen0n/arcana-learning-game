"""Several Gemini keys (named gemini#1, gemini#2, ...) must behave exactly like a single key named gemini:
the fast Lite models are allowed and come first, a busy model falls through to the next one, and thinking is kept short."""
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402

IDS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-preview-tts"]
sent = []


def fake_http(url, key, body=None, **k):
    if url.endswith("/models"):
        return {"data": [{"id": "models/" + i} for i in IDS]}
    sent.append(body)
    if body["model"] == "gemini-flash-lite-latest" and len(sent) == 1:   # the first model is overloaded once
        raise urllib.error.HTTPError(url, 503, "busy", {}, None)
    return {"choices": [{"message": {"content": '{"answer": "hi"}'}, "finish_reason": "stop"}], "usage": {}}


llm._http = fake_http
for label in ("gemini", "gemini#2"):
    sent.clear()
    p = next(x for x in llm.PROVIDERS if x.name.startswith("gemini")).__class__.__new__(llm.CompatProvider)
    src = next(x for x in llm.PROVIDERS if x.name.startswith("gemini"))
    llm.CompatProvider.__init__(p, "gemini", src.base, "test-key", src.model_env, src.prefer, 400_000, 16000, True, True, label=label)
    assert p.resolve_model() == "gemini-flash-lite-latest", (label, p.model)
    try:
        p.json("s", "u", {"type": "object", "properties": {"answer": {"type": "string"}}}, None, 4000, None, {})
    except llm.Skip:
        pass
    p.model = None
    assert p.resolve_model() == "gemini-3.5-flash-lite", (label, "a busy model must fall through to the next Lite model, not rest the whole key")
    out = p.json("s", "u", {"type": "object", "properties": {"answer": {"type": "string"}}}, None, 4000, None, {})
    assert sent[-1].get("reasoning_effort") == "low", (label, "thinking must stay short on every key")
    print(f"ok - {label}: Lite first, falls through when busy, short thinking")
print("\nGEMINI KEYS OK")
