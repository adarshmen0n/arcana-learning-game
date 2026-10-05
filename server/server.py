"""Arcana server: serves the game and the /api.
Local:   python server/server.py [port]          -> http://127.0.0.1:port (private to your computer)
Hosted:  set PORT (and ARCANA_HOSTED=1)          -> listens on all interfaces, login required to create games"""
import functools
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


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/jobs/" not in (args[0] if args else ""):      # keep the console quiet during progress polling
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
        return super().do_GET()

    def do_POST(self):
        return self._api("POST") if self.path.startswith("/api/") else self._send(404, {"error": "Not found."})

    def do_DELETE(self):
        return self._api("DELETE") if self.path.startswith("/api/") else self._send(404, {"error": "Not found."})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 5181))
    host = os.environ.get("HOST") or ("0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    handler = functools.partial(Handler, directory=str(WEB))
    print(f"Arcana on http://{host}:{port}  |  AI: {'ON (' + llm.label() + ')' if llm.available() else 'OFF (offline mode; add keys to .env)'}  |  hosted={config.HOSTED}", flush=True)
    Server((host, port), handler).serve_forever()
