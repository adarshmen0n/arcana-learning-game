"""Multi-provider AI router. Tries providers in order; when one is rate-limited, out of quota, too small for the
document, or returns bad JSON, the next one takes over. Keys come from the environment or the project .env file and
never leave this process.

Claude uses the official Anthropic SDK (structured outputs, prompt caching, web search, PDF reading).
Every other service speaks the OpenAI-compatible chat API and is called over plain HTTPS."""
import base64
import http.client
import json
import os
import pathlib
import re
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_env():
    """Tiny .env loader (KEY=VALUE per line) so keys live in a local file, not in code or chat."""
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()


class LLMError(Exception):
    pass


class Skip(Exception):
    """This provider cannot serve the call right now. cooldown seconds; fatal=True means the key is unusable."""
    def __init__(self, msg, cooldown=0, fatal=False):
        super().__init__(msg)
        self.cooldown, self.fatal = cooldown, fatal


usage_total = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "calls": 0}
_lock = threading.Lock()


def _track(tally, inp, out, cread=0, cwrite=0):
    with _lock:
        usage_total["calls"] += 1
        for k, v in (("input", inp), ("output", out), ("cache_read", cread), ("cache_write", cwrite)):
            usage_total[k] += v
    if tally is not None:
        for k, v in (("input", inp), ("output", out), ("cache_read", cread), ("cache_write", cwrite)):
            tally[k] = tally.get(k, 0) + v


# ----------------------------------------------------------------------------- JSON helpers
def extract_json(text: str):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find("{"), t.rfind("}")
        if a >= 0 and b > a:
            return json.loads(t[a:b + 1])
        raise


def coerce(obj, schema):
    """Repair harmless slips from smaller models: numeric strings, missing arrays, stray types."""
    t = schema.get("type")
    if t == "object" and isinstance(obj, dict):
        out = {}
        for k, sub in schema.get("properties", {}).items():
            if k in obj:
                out[k] = coerce(obj[k], sub)
            elif k in schema.get("required", []):
                out[k] = {"array": [], "string": "", "integer": 0, "boolean": False, "object": {}}.get(sub.get("type"))
        return out
    if t == "array":
        if not isinstance(obj, list):
            return []
        return [coerce(x, schema.get("items", {})) for x in obj]
    if t == "integer":
        try:
            return int(float(obj)) if not isinstance(obj, bool) else int(obj)
        except (TypeError, ValueError):
            return obj
    if t == "boolean" and isinstance(obj, str):
        return obj.strip().lower() in ("true", "yes", "1")
    if t == "string" and isinstance(obj, (int, float)) and not isinstance(obj, bool):
        return str(obj)
    return obj


def validate(obj, schema, path="$"):
    errs, t = [], schema.get("type")
    if t == "object":
        if not isinstance(obj, dict):
            return [f"{path}: expected object"]
        for k in schema.get("required", []):
            if k not in obj:
                errs.append(f"{path}.{k}: missing")
        for k, sub in schema.get("properties", {}).items():
            if k in obj:
                errs += validate(obj[k], sub, f"{path}.{k}")
    elif t == "array":
        if not isinstance(obj, list):
            return [f"{path}: expected array"]
        for i, x in enumerate(obj[:60]):
            errs += validate(x, schema.get("items", {}), f"{path}[{i}]")
    elif t == "string":
        if not isinstance(obj, str):
            errs.append(f"{path}: expected string")
        elif "enum" in schema and obj not in schema["enum"]:
            errs.append(f"{path}: must be one of {schema['enum']}")
    elif t == "integer":
        if not isinstance(obj, int) or isinstance(obj, bool):
            errs.append(f"{path}: expected integer")
    elif t == "boolean":
        if not isinstance(obj, bool):
            errs.append(f"{path}: expected boolean")
    return errs[:8]


# ----------------------------------------------------------------------------- providers
class Provider:
    name = "?"
    web = False
    pdf = False
    vision = False

    def __init__(self):
        self.cool_until = 0.0
        self.dead = None            # reason string when the key was rejected
        self.last_model = None

    def ready(self):
        return self.dead is None and time.time() >= self.cool_until

    def state(self):
        if self.dead:
            return "rejected"
        return "cooling" if time.time() < self.cool_until else "ready"

    def fits(self, chars):
        return True


class AnthropicProvider(Provider):
    name = "claude"
    web = pdf = vision = True

    def __init__(self):
        super().__init__()
        self.model = os.environ.get("ARCANA_MODEL", "claude-opus-5-5")
        self.effort = os.environ.get("ARCANA_EFFORT", "medium")
        self._client = None

    def client(self):
        import anthropic
        with _lock:
            if self._client is None:
                kw = {"base_url": os.environ["ANTHROPIC_BASE_URL"]} if os.environ.get("ANTHROPIC_BASE_URL") else {}
                self._client = anthropic.Anthropic(max_retries=2, timeout=600.0, **kw)
            return self._client

    def _errors(self, e):
        import anthropic
        if isinstance(e, anthropic.AuthenticationError):
            raise Skip("key rejected", fatal=True)
        if isinstance(e, anthropic.RateLimitError):
            raise Skip("rate limited", cooldown=float(e.response.headers.get("retry-after", "60")))
        if isinstance(e, anthropic.APIConnectionError):
            raise Skip("cannot reach the API", cooldown=20)
        if isinstance(e, anthropic.APIStatusError):
            if e.status_code == 402 or "credit" in str(e.message).lower() or "billing" in str(e.message).lower():
                raise Skip("out of credit", cooldown=3600)
            raise Skip(f"API error {e.status_code}", cooldown=30 if e.status_code >= 500 else 0)
        raise e

    def json(self, system, user, schema, doc, max_tokens, effort, tally):
        import anthropic
        blocks = [{"type": "text", "text": system}]
        if doc:
            blocks.append({"type": "text", "text": doc, "cache_control": {"type": "ephemeral"}})
        try:
            r = self.client().messages.create(model=self.model, max_tokens=max_tokens, system=blocks, messages=[{"role": "user", "content": user}],
                                              output_config={"effort": effort or self.effort, "format": {"type": "json_schema", "schema": schema}})
        except (anthropic.APIError,) as e:
            self._errors(e)
        u = r.usage
        _track(tally, u.input_tokens or 0, u.output_tokens or 0, getattr(u, "cache_read_input_tokens", 0) or 0, getattr(u, "cache_creation_input_tokens", 0) or 0)
        if r.stop_reason == "refusal":
            raise Skip("declined the request", cooldown=0)
        if r.stop_reason == "max_tokens":
            raise Skip("ran out of output space")
        try:
            return json.loads("".join(b.text for b in r.content if b.type == "text"))
        except json.JSONDecodeError:
            raise Skip("malformed JSON")

    def chat(self, system, messages, max_tokens, tally):
        import anthropic
        try:
            r = self.client().messages.create(model=self.model, max_tokens=max_tokens, system=system, messages=messages, output_config={"effort": "low"})
        except anthropic.APIError as e:
            self._errors(e)
        _track(tally, r.usage.input_tokens or 0, r.usage.output_tokens or 0)
        if r.stop_reason == "refusal":
            raise Skip("declined the request", cooldown=0)
        return "".join(b.text for b in r.content if b.type == "text").strip()

    def research(self, query, tally):
        import anthropic
        tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 3}]
        messages = [{"role": "user", "content": f"Research this topic for a student study guide and write concise, factual notes (150-250 words) with key definitions, numbers and examples. Prefer authoritative sources.\n\nTopic: {query}"}]
        sources, notes = [], ""
        try:
            for _ in range(4):
                r = self.client().messages.create(model=self.model, max_tokens=4000, tools=tools, messages=messages, output_config={"effort": "low"})
                u = r.usage
                _track(tally, u.input_tokens or 0, u.output_tokens or 0)
                if r.stop_reason in ("refusal", "max_tokens") and not notes:
                    raise Skip("research stopped")
                for b in r.content:
                    if b.type == "web_search_tool_result" and isinstance(b.content, list):
                        for x in b.content:
                            url = getattr(x, "url", None)
                            if url and not any(s["url"] == url for s in sources):
                                sources.append({"title": getattr(x, "title", "") or url, "url": url})
                notes = "".join(b.text for b in r.content if b.type == "text") or notes
                if r.stop_reason != "pause_turn":
                    break
                messages = [messages[0], {"role": "assistant", "content": r.content}]
        except anthropic.APIError as e:
            self._errors(e)
        return {"notes": notes.strip(), "sources": sources[:6]}

    def transcribe(self, data, mime, tally):
        import anthropic
        b64 = base64.standard_b64encode(data).decode("ascii")
        block = {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}} if mime == "application/pdf" else {"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}}
        try:
            r = self.client().messages.create(model=self.model, max_tokens=16000, output_config={"effort": "low"},
                                              messages=[{"role": "user", "content": [block, {"type": "text", "text": TRANSCRIBE_PROMPT}]}])
        except anthropic.APIError as e:
            self._errors(e)
        _track(tally, r.usage.input_tokens or 0, r.usage.output_tokens or 0)
        return "".join(b.text for b in r.content if b.type == "text").strip()


TRANSCRIBE_PROMPT = ("Transcribe all the study content in this file as clean text. Keep headings (prefix with '# '), lists and tables readable. "
                     "Describe diagrams in one sentence each in [brackets]. Output only the transcription.")

# name: (base url, env var for key(s), model env var, preferred model keywords, max document chars, output cap, vision, json mode)
COMPAT = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", ("GEMINI_API_KEY", "GOOGLE_API_KEY"), "GEMINI_MODEL", ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3-flash", "gemini-flash", "gemini-pro-latest", "gemini"], 400_000, 16000, True, True),
    "mistral": ("https://api.mistral.ai/v1", ("MISTRAL_API_KEY",), "MISTRAL_MODEL", ["mistral-small", "mistral-medium", "mistral-large", "mistral"], 100_000, 8000, False, True),
    "deepseek": ("https://api.deepseek.com/v1", ("DEEPSEEK_API_KEY",), "DEEPSEEK_MODEL", ["deepseek-chat"], 120_000, 8000, False, True),
    "openai": ("https://api.openai.com/v1", ("OPENAI_API_KEY",), "OPENAI_MODEL", ["gpt-4o-mini", "gpt-4.1-mini", "mini"], 200_000, 16000, True, True),
    "groq": ("https://api.groq.com/openai/v1", ("GROQ_API_KEY",), "GROQ_MODEL", ["gpt-oss-120b", "llama-3.3-70b", "qwen3", "gpt-oss-20b", "llama", "qwen"], 18_000, 6000, False, True),
    "cerebras": ("https://api.cerebras.ai/v1", ("CEREBRAS_API_KEY",), "CEREBRAS_MODEL", ["gpt-oss-120b", "llama-3.3-70b", "llama3.3-70b", "qwen", "llama"], 22_000, 6000, False, True),
    "openrouter": ("https://openrouter.ai/api/v1", ("OPENROUTER_API_KEY",), "OPENROUTER_MODEL", [":free"], 60_000, 16000, False, False),
}
DEFAULT_ORDER = ["claude", "gemini", "mistral", "deepseek", "openai", "groq", "cerebras", "openrouter", "custom", "ollama"]


def _http(url, key, body=None, timeout=240):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
    req.add_header("Content-Type", "application/json")
    if key:
        req.add_header("Authorization", "Bearer " + key)
    req.add_header("User-Agent", "arcana-ai/0.3")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _retry_after(headers, text):
    v = headers.get("retry-after") if headers else None
    if v:
        try:
            return min(float(v), 3600)
        except ValueError:
            pass
    m = re.search(r"retry(?:Delay)?\"?:?\s*\"?(\d+(?:\.\d+)?)s", text) or re.search(r"try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s", text)
    if m:
        g = [x for x in m.groups() if x]
        return min(sum(float(x) * (60 if i == 0 and len(g) == 2 else 1) for i, x in enumerate(g)), 3600)
    return 60.0


class CompatProvider(Provider):
    def __init__(self, name, base, key, model_env, prefer, max_chars, out_cap, vision, json_mode, label=None):
        super().__init__()
        self.name, self.base, self.key, self.model_env, self.prefer = label or name, base.rstrip("/"), key, model_env, prefer
        self.max_chars, self.out_cap, self.vision, self.json_mode = max_chars, out_cap, vision, json_mode
        self.model = os.environ.get(model_env) if model_env else None
        self.no_json = False
        self.bad = set()

    def fits(self, chars):
        return chars <= self.max_chars

    def resolve_model(self):
        if self.model:
            return self.model
        try:
            data = _http(self.base + "/models", self.key, timeout=30)
            ids = [m.get("id", "").replace("models/", "") for m in data.get("data", data.get("models", []))]
        except Exception:
            ids = []
        skip = ("embed", "whisper", "tts", "guard", "safety", "moderation", "image", "vision-preview", "audio", "orpheus", "rerank", "imagen", "veo", "aqa", "customtools", "live", "omni", "lite", "nano", "thinkingmachines")
        if self.name == "gemini":
            skip = tuple(x for x in skip if x != "lite")             # the lite models are a good fallback when the main one is busy
        ids = [i for i in ids if i and i not in self.bad and not any(s in i.lower() for s in skip)]
        if self.name.startswith("openrouter"):
            ids = [i for i in ids if i.endswith(":free")]
            pri = ["nemotron-3-super", "gpt-oss", "llama-3.3-70b", "gemma-4-31b", "qwen3", "nemotron-3-ultra", "deepseek", "gemma-4", "mistral"]   # reasoning is kept short per call, see json()/chat()
            for k in pri:
                hit = [i for i in ids if k in i.lower()]
                if hit:
                    self.model = hit[0]
                    return self.model
        else:
            for k in self.prefer:
                hit = [i for i in ids if k in i.lower()]
                if hit:
                    self.model = sorted(hit, key=len)[0]
                    return self.model
        if ids:
            self.model = ids[0]
            return self.model
        raise Skip("no usable model found (set the *_MODEL variable in .env)", cooldown=300)

    def _post(self, body):
        url = self.base + "/chat/completions"
        try:
            return _http(url, self.key, body)
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "ignore")[:1200]
            low = text.lower()
            if e.code in (401, 403):
                raise Skip("key rejected", fatal=True)
            if e.code == 413 or "too large" in low or "reduce your" in low or "context length" in low or "maximum context" in low:
                raise Skip("request too large for this plan", cooldown=0)
            if e.code == 429 and "upstream" in low and self.model and not os.environ.get(self.model_env or "_"):   # one free model is busy: use another one
                m = self.model; self.bad.add(m); self.model = None
                t = threading.Timer(600, lambda: self.bad.discard(m)); t.daemon = True; t.start()
                raise Skip("model busy; trying another", cooldown=0)
            if e.code == 429 or "quota" in low or "rate limit" in low:
                raise Skip("rate limited / quota used", cooldown=_retry_after(e.headers, text))
            if e.code == 402:
                raise Skip("out of credit", cooldown=3600)
            if e.code in (400, 404) and ("model" in low and ("not found" in low or "no longer available" in low or "not supported" in low or "does not exist" in low)):
                if self.model and not os.environ.get(self.model_env or "_"):
                    self.bad.add(self.model)
                    self.model = None
                raise Skip("model unavailable; trying another", cooldown=0)
            if e.code == 400 and "reasoning" in low:
                self.no_reason = True
                raise Skip("model unavailable; retrying without reasoning setting", cooldown=0)
            if e.code == 400 and "response_format" in low:
                self.no_json = True
                raise Skip("json mode unsupported", cooldown=0)
            if e.code in (500, 502, 503, 504) and self.model and not os.environ.get(self.model_env or "_"):      # this model is overloaded: try another one for a while
                m = self.model; self.bad.add(m); self.model = None
                t = threading.Timer(600, lambda: self.bad.discard(m)); t.daemon = True; t.start()
                raise Skip("model busy; trying another", cooldown=0)
            raise Skip(f"HTTP {e.code}", cooldown=20 if e.code >= 500 else 0)
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException, json.JSONDecodeError, OSError) as e:   # dropped or truncated connections are retried
            raise Skip("cannot reach the service", cooldown=20)

    def _post_any_model(self, body):
        """Post; if the chosen model is busy or retired, pick the next usable model and try again (a few times)."""
        for n in range(4):
            try:
                return self._post(body)
            except Skip as sk:
                if n < 3 and str(sk).startswith(("model busy", "model unavailable")):
                    body["model"] = self.resolve_model()
                    if getattr(self, "no_reason", False):
                        body.pop("reasoning_effort", None)
                    continue
                raise

    def json(self, system, user, schema, doc, max_tokens, effort, tally):
        model = self.resolve_model()
        sys_text = system + (("\n\n" + doc) if doc else "")
        instr = "\n\nReturn ONLY one JSON object (no markdown, no commentary) that conforms to this JSON Schema:\n" + json.dumps(schema, separators=(",", ":"))
        msgs = [{"role": "system", "content": sys_text}, {"role": "user", "content": user + instr}]
        last = "malformed JSON"
        for attempt in range(2):
            body = {"model": model, "messages": msgs, "temperature": 0.4, "max_tokens": min(max_tokens, self.out_cap)}
            if self.name == "gemini" and not getattr(self, "no_reason", False):
                body["reasoning_effort"] = "low"          # newer Gemini models think first; keep that short so the answer is not cut off
            if self.name.startswith("openrouter"):
                body["reasoning"] = {"effort": "low", "exclude": True}
            if self.json_mode and not self.no_json:
                body["response_format"] = {"type": "json_object"}
            r = self._post_any_model(body)
            u = r.get("usage") or {}
            _track(tally, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
            ch = (r.get("choices") or [{}])[0]
            text = (ch.get("message") or {}).get("content") or ""
            if ch.get("finish_reason") == "length":
                raise Skip("answer cut off (output limit)", cooldown=0)
            try:
                obj = coerce(extract_json(text), schema)
                errs = validate(obj, schema)
            except (json.JSONDecodeError, ValueError):
                errs = ["the reply was not valid JSON"]
                obj = None
            if not errs:
                return obj
            last = "; ".join(errs[:3])
            msgs = msgs + [{"role": "assistant", "content": text[:6000]}, {"role": "user", "content": "That did not match the schema (" + last + "). Return the complete corrected JSON object only."}]
        raise Skip("could not produce valid JSON: " + last)

    def chat(self, system, messages, max_tokens, tally):
        body = {"model": self.resolve_model(), "messages": [{"role": "system", "content": system}] + messages, "temperature": 0.5, "max_tokens": min(max_tokens, self.out_cap)}
        if self.name == "gemini" and not getattr(self, "no_reason", False):
            body["reasoning_effort"] = "low"
        if self.name.startswith("openrouter"):
            body["reasoning"] = {"effort": "low", "exclude": True}
        r = self._post_any_model(body)
        u = r.get("usage") or {}
        _track(tally, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
        ch = (r.get("choices") or [{}])[0]
        text = ((ch.get("message") or {}).get("content") or "").strip()
        if not text:
            raise Skip("empty answer", cooldown=0)
        if ch.get("finish_reason") == "length":
            text += "\n\n*(answer shortened: ask me to continue)*"
        return text

    def transcribe(self, data, mime, tally):
        if not self.vision or mime == "application/pdf":
            raise Skip("cannot read this file type")
        model = self.resolve_model()
        url = f"data:{mime};base64," + base64.standard_b64encode(data).decode("ascii")
        r = self._post({"model": model, "max_tokens": min(8000, self.out_cap), "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": url}}, {"type": "text", "text": TRANSCRIBE_PROMPT}]}]})
        u = r.get("usage") or {}
        _track(tally, u.get("prompt_tokens", 0), u.get("completion_tokens", 0))
        return (((r.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()


def _build():
    provs = []
    order = [x.strip() for x in os.environ.get("ARCANA_PROVIDERS", ",".join(DEFAULT_ORDER)).split(",") if x.strip()]
    for name in order:
        if name == "claude":
            if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
                provs.append(AnthropicProvider())
        elif name in COMPAT:
            base, keyvars, menv, prefer, maxc, outc, vis, jm = COMPAT[name]
            keys = [k.strip() for kv in keyvars for k in os.environ.get(kv, "").split(",") if k.strip()]
            for i, k in enumerate(keys):
                provs.append(CompatProvider(name, base, k, menv, prefer, maxc, outc, vis, jm, label=name if len(keys) == 1 else f"{name}#{i + 1}"))
        elif name == "custom" and os.environ.get("CUSTOM_BASE_URL"):
            provs.append(CompatProvider("custom", os.environ["CUSTOM_BASE_URL"], os.environ.get("CUSTOM_API_KEY", ""), "CUSTOM_MODEL", [], int(os.environ.get("CUSTOM_MAX_CHARS", "60000")), 8000, False, True))
        elif name == "ollama" and os.environ.get("OLLAMA_MODEL"):
            provs.append(CompatProvider("ollama", os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/v1"), "", "OLLAMA_MODEL", [], int(os.environ.get("OLLAMA_MAX_CHARS", "24000")), 4096, False, True))
    return provs


PROVIDERS = _build()
MODEL = PROVIDERS[0].model if PROVIDERS and isinstance(PROVIDERS[0], AnthropicProvider) else (PROVIDERS[0].name if PROVIDERS else "none")


def available() -> bool:
    return any(p.dead is None for p in PROVIDERS)


def has_web() -> bool:
    return any(p.web and p.dead is None for p in PROVIDERS)


def concurrency() -> int:
    """Claude handles parallel chapters; free tiers do better one at a time."""
    return 3 if any(isinstance(p, AnthropicProvider) and p.dead is None for p in PROVIDERS) else 1


def status():
    return [{"name": p.name, "state": p.state(), "model": getattr(p, "model", None) or "auto", "note": p.dead or ""} for p in PROVIDERS]


def label():
    names = [p.name for p in PROVIDERS if p.dead is None]
    return ", ".join(names) if names else "none"


def _apply(p, e: Skip, log):
    if e.fatal:
        p.dead = str(e)
    elif e.cooldown:
        p.cool_until = time.time() + e.cooldown
    if log:
        wait = f" (paused {int(e.cooldown)}s)" if e.cooldown >= 5 else ""
        log(f"{p.name}: {e}{wait}")


def _route(op, chars, *, need=None, log=None, wait_total=150):
    """Run op(provider) on the first provider that works; fail over on Skip."""
    deadline, tried, notes = time.time() + wait_total, set(), []
    while True:
        cands = [p for p in PROVIDERS if p.dead is None and p.fits(chars) and (need is None or getattr(p, need, False))]
        if not cands:
            if not PROVIDERS:
                raise LLMError("No AI provider is configured. Add at least one API key to the .env file.")
            raise LLMError("No configured AI provider can handle this request" + (" (the document is too long for the free plans; add a Gemini key, which accepts long documents)." if need is None else "."))
        for p in cands:
            if not p.ready():
                continue
            try:
                out = op(p)
                if tried and log:
                    log(f"Continued with {p.name}")
                return out
            except Skip as e:
                _apply(p, e, log)
                notes.append(f"{p.name}: {e}")
                tried.add(p.name)
        waiting = [p for p in cands if p.dead is None and not p.ready()]
        if not waiting:
            raise LLMError("All AI providers failed: " + "; ".join(notes[-4:]))
        nxt = min(p.cool_until for p in waiting) - time.time()
        if time.time() + max(nxt, 1) > deadline:
            raise LLMError("All AI providers are rate-limited right now. Try again in about %d seconds." % max(nxt, 5))
        if log and nxt > 3:
            log(f"All providers are busy; waiting {int(nxt)}s")
        time.sleep(min(max(nxt, 1), 30))


def call_json(system: str, user: str, schema: dict, *, doc: str | None = None, max_tokens: int = 16000, effort: str | None = None, tally=None, log=None) -> dict:
    chars = len(system) + len(user) + len(doc or "") + len(json.dumps(schema))
    return _route(lambda p: p.json(system, user, schema, doc, max_tokens, effort, tally), chars, log=log)


def chat(system: str, messages: list, *, max_tokens: int = 1800, tally=None, log=None) -> str:
    """Plain conversational answer (Markdown text). messages: [{"role": "user"|"assistant", "content": str}, ...]"""
    chars = len(system) + sum(len(m["content"]) for m in messages)
    return _route(lambda p: p.chat(system, messages, max_tokens, tally), chars, log=log, wait_total=40)


def research(query: str, *, tally=None, log=None) -> dict:
    if not has_web():
        raise LLMError("web search needs a Claude key")
    return _route(lambda p: p.research(query, tally), len(query), need="web", log=log, wait_total=30)


def transcribe(data: bytes, mime: str, *, tally=None, log=None) -> str:
    need = "pdf" if mime == "application/pdf" else "vision"
    if not any(getattr(p, need, False) and p.dead is None for p in PROVIDERS):
        raise LLMError("Reading scanned PDFs needs a Claude key; reading images needs Claude, Gemini or OpenAI." if need == "pdf" else "Reading images needs a Claude, Gemini or OpenAI key.")
    return _route(lambda p: p.transcribe(data, mime, tally), 0, need=need, log=log)
