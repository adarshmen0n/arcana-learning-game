"""Arcana server: serves the game and the /api.
Local:   python server/server.py [port]          -> http://127.0.0.1:port (private to your computer)
Hosted:  set PORT (and ARCANA_HOSTED=1)          -> listens on all interfaces, login required to create games"""
import functools
import gzip
import hashlib
import mimetypes
import threading
import http.server
import json
import os
import pathlib
import socketserver
import sys
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import api  # noqa: E402
import config  # noqa: E402
import llm  # noqa: E402

WEB = config.ROOT / "arcana"
MAX_BODY = 40 * 1024 * 1024


_static = {}                         # path -> (mtime, etag, raw bytes, gzipped bytes or None, content type)
_static_lock = threading.Lock()
ZIP_TYPES = ("text/", "application/javascript", "application/json", "image/svg+xml", "application/manifest+json")
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("application/javascript", ".js")


def _load_static(path):
    """Read a file once and keep it (plus a gzipped copy) in memory until it changes on disk."""
    st = os.stat(path)
    hit = _static.get(path)
    if hit and hit[0] == st.st_mtime:
        return hit
    raw = open(path, "rb").read()
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype.endswith(("javascript", "json")):
        ctype += "; charset=utf-8"
    zipped = gzip.compress(raw, 6) if ctype.startswith(ZIP_TYPES) and len(raw) > 1024 else None
    entry = (st.st_mtime, '"' + hashlib.md5(raw).hexdigest()[:16] + '"', raw, zipped, ctype)
    with _static_lock:
        _static[path] = entry
    return entry


import re as _re


def _build_id():
    """Fingerprint of every script and style file: changes with any update, so pages always load matching, fresh files."""
    h = hashlib.md5()
    for f in sorted(os.listdir(WEB)):
        if f.endswith((".js", ".css")):
            st = os.stat(os.path.join(WEB, f))
            h.update(f"{f}:{st.st_mtime_ns}:{st.st_size}".encode())
    return h.hexdigest()[:10]


def _stamp_html(raw):
    """Add ?v=<build> to the page's own scripts and styles, and tell the page its build for scripts it loads later."""
    v = _build_id()
    html = raw.decode("utf-8")
    html = _re.sub(r'((?:src|href)=")([a-z0-9][a-z0-9\-]*\.(?:js|css))(")', lambda m: f"{m.group(1)}{m.group(2)}?v={v}{m.group(3)}", html)
    html = html.replace("<head>", f'<head><script>window.ARCANA_BUILD="{v}"</script>', 1)
    return html.encode("utf-8")


class Handler(http.server.SimpleHTTPRequestHandler):
    cache_rule = "no-store"

    def end_headers(self):
        self.send_header("Cache-Control", self.cache_rule)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/jobs/" not in str(args[0] if args else ""):      # keep the console quiet during progress polling
            super().log_message(fmt, *args)

    def ip(self):
        if config.HOSTED and self.headers.get("X-Forwarded-For"):
            return self.headers["X-Forwarded-For"].split(",")[0].strip()
        return self.client_address[0]

    def _send(self, code, obj, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _api(self, method):
        u = urlsplit(self.path)
        body = None
        if method in ("POST", "PUT"):
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                return self._send(413, {"error": "File too large (limit 25 MB)."})
            if "application/json" not in (self.headers.get("Content-Type") or ""):
                return self._send(415, {"error": "JSON only."})
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self._send(400, {"error": "Bad request."})
        req = api.Req(method, u.path.rstrip("/") or "/", parse_qs(u.query), body, self.headers, self.ip())
        code, obj = api.dispatch(req)
        self._send(code, obj, req.set_cookie)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._api("GET")
        return self._static()

    def _static(self):
        """Game files: compressed, with ETags (unchanged files cost a tiny 304), cached briefly by the browser."""
        path = self.translate_path(urlsplit(self.path).path)
        if os.path.isdir(path):
            path = os.path.join(path, "index.html")
        if not os.path.isfile(path):
            return super().do_GET()
        try:
            _, etag, raw, zipped, ctype = _load_static(path)
        except OSError:
            return super().do_GET()
        name = os.path.basename(path)
        if name.endswith(".html"):                             # pages: stamp fresh file versions in (computed per request, never cached)
            raw = _stamp_html(raw)
            zipped = gzip.compress(raw, 6)
            etag = '"' + hashlib.md5(raw).hexdigest()[:16] + '"'
        stamped = "v=" in (urlsplit(self.path).query or "") and name.endswith((".js", ".css"))
        self.cache_rule = "public, max-age=31536000, immutable" if stamped else "public, max-age=86400" if name.endswith((".png", ".webp", ".jpg", ".ico", ".woff2")) else "no-cache"   # code is always checked (a cheap 304 when unchanged), so a deploy never mixes old and new files
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        body = zipped if zipped is not None and "gzip" in (self.headers.get("Accept-Encoding") or "") else raw
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        self.send_header("Vary", "Accept-Encoding")
        if body is zipped:
            self.send_header("Content-Encoding", "gzip")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        return self._static() if not self.path.startswith("/api/") else self._send(405, {"error": "Use GET."})

    def do_POST(self):
        return self._api("POST") if self.path.startswith("/api/") else self._send(404, {"error": "Not found."})

    def do_DELETE(self):
        return self._api("DELETE") if self.path.startswith("/api/") else self._send(404, {"error": "Not found."})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 256                          # many players connecting at once queue up instead of being refused


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 5181))
    host = os.environ.get("HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    handler = functools.partial(Handler, directory=str(WEB))
    print(f"Arcana on http://{host}:{port}  |  AI: {'ON (' + llm.label() + ')' if llm.available() else 'OFF (offline mode; add keys to .env)'}  |  hosted={config.HOSTED}", flush=True)
    import pipeline  # noqa: E402
    n = pipeline.resume_unfinished()
    if n:
        print(f"Resumed {n} game build(s) interrupted by the restart", flush=True)
    Server((host, port), handler).serve_forever()
