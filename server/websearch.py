"""Live web lookup for Arc Search, so answers about changing facts (office holders, events, versions) are current.
Free by default: Wikipedia's API (no key). If TAVILY_API_KEY or BRAVE_API_KEY is set, a real web search is used first."""
import json
import os
import re
import urllib.parse
import urllib.request

UA = {"User-Agent": "ArcanaAI/2.0 (study assistant; https://arcana-ai-16xh.onrender.com)"}
ABBR = {r"\bcm\b": "chief minister", r"\bpm\b": "prime minister", r"\bceo\b": "chief executive officer", r"\bus\b": "united states", r"\buk\b": "united kingdom",
        r"\bun\b": "united nations", r"\bipl\b": "indian premier league", r"\bisro\b": "indian space research organisation", r"\btamilnadu\b": "tamil nadu"}
FILLER = r"\b(who|what|which|when|where|why|how|is|are|was|were|the|a|an|of|in|on|for|to|current|currently|present|now|today|latest|tell|me|about|please|explain|do|does|did|you|know)\b"


def _get(url, headers=None, data=None, timeout=12):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers={**UA, **(headers or {}), **({"Content-Type": "application/json"} if data is not None else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def clean_query(q):
    s = q.lower()
    for a, b in ABBR.items():
        s = re.sub(a, b, s)
    s = re.sub(FILLER, " ", s)
    return re.sub(r"[^\w\s\-]", " ", re.sub(r"\s+", " ", s)).strip()


def _wikipedia(q, limit=4):
    out, seen = [], set()
    for query in dict.fromkeys([clean_query(q), q]):                  # cleaned first: "current CM of tamilnadu" -> "chief minister tamil nadu"
        if not query.strip():
            continue
        try:
            res = _get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "list": "search", "srsearch": query, "srlimit": 3, "format": "json"}))
        except Exception:
            continue
        for x in res.get("query", {}).get("search", []):
            if x["title"] not in seen:
                seen.add(x["title"]); out.append(x["title"])
    titles = out[:limit]
    if not titles:
        return []
    try:
        res = _get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "redirects": 1, "titles": "|".join(titles), "format": "json"}))
    except Exception:
        return []
    pages = {p.get("title"): p.get("extract", "") for p in res.get("query", {}).get("pages", {}).values()}
    results = []
    for t in titles:
        text = pages.get(t) or next((v for k, v in pages.items() if k.lower() == t.lower()), "")
        if text:
            if len(text) > 1800:                                         # keep the most current part: sentences about incumbents and recent years
                key = max(re.split(r"(?<=[.!?])\s+", text), key=lambda s: ("incumbent" in s.lower()) * 3 + len(re.findall(r"20[2-3]\d", s)))
                text = text[:1400] + " ... " + key
            results.append({"title": t, "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(t.replace(" ", "_")), "content": text[:2000]})
    return results


def _tavily(q):
    res = _get("https://api.tavily.com/search", data={"api_key": os.environ["TAVILY_API_KEY"], "query": q, "max_results": 5, "search_depth": "basic"})
    return [{"title": x.get("title", ""), "url": x.get("url", ""), "content": (x.get("content") or "")[:1500]} for x in res.get("results", [])]


def _brave(q):
    res = _get("https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": q, "count": 5}), headers={"X-Subscription-Token": os.environ["BRAVE_API_KEY"], "Accept": "application/json"})
    return [{"title": x.get("title", ""), "url": x.get("url", ""), "content": re.sub(r"<[^>]+>", "", x.get("description", ""))[:800]} for x in res.get("web", {}).get("results", [])]


def lookup(q):
    """Returns a list of {title, url, content}. Never raises: an empty list means no live data."""
    found = []
    for name, fn in (("TAVILY_API_KEY", _tavily), ("BRAVE_API_KEY", _brave)):
        if os.environ.get(name):
            try:
                found = fn(q)
            except Exception:
                found = []
            if found:
                break
    try:
        wiki = _wikipedia(q)
    except Exception:
        wiki = []
    return (found + wiki)[:6]
