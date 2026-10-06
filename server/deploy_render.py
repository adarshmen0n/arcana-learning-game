"""Creates (or updates) the Arcana web service on Render through Render's API and waits until it is live.
Needs RENDER_API_KEY in .env (Render dashboard > Account Settings > API Keys). Your AI keys are copied from .env to
the service's environment; no key is ever printed.
Run:  python server/deploy_render.py"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402,F401  (loads .env)

API = "https://api.render.com/v1"
KEY = os.environ.get("RENDER_API_KEY", "")
REPO = os.environ.get("ARCANA_REPO", "https://github.com/adarshmen0n/arcana-learning-game")
NAME = os.environ.get("ARCANA_RENDER_NAME", "arcana-ai")
SECRETS = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "MISTRAL_API_KEY", "CEREBRAS_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "DATABASE_URL", "GOOGLE_CLIENT_ID"]


def call(method, path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + KEY, "Accept": "application/json", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "ignore")[:600]
        try:
            return e.code, json.loads(txt)
        except ValueError:
            return e.code, {"message": txt}


def main():
    if not KEY:
        sys.exit("RENDER_API_KEY is missing. Create one at https://dashboard.render.com/u/settings#api-keys and add it to .env as RENDER_API_KEY=...")
    code, owners = call("GET", "/owners?limit=20")
    if code == 401:
        sys.exit("Render rejected the API key. Create a new one and update .env.")
    if code != 200 or not owners:
        sys.exit(f"Could not list Render workspaces ({code}): {owners}")
    owner = (owners[0].get("owner") or owners[0])
    print("Workspace:", owner.get("name"), "|", owner.get("email", ""))
    env = [{"key": "ARCANA_HOSTED", "value": "1"}, {"key": "ARCANA_MAX_GAMES_PER_DAY", "value": "5"}, {"key": "PYTHON_VERSION", "value": "3.12.7"}]
    env += [{"key": k, "value": os.environ[k]} for k in SECRETS if os.environ.get(k)]
    print("Environment variables to set:", ", ".join(e["key"] for e in env))

    code, existing = call("GET", f"/services?name={NAME}&limit=5")
    svc = next((s.get("service") for s in (existing if code == 200 else []) if s.get("service", {}).get("name") == NAME), None)
    if svc:
        print("Service already exists, updating its settings:", svc["id"])
        c, r = call("PUT", f"/services/{svc['id']}/env-vars", env)
        print("  env vars:", "ok" if c == 200 else f"failed {c} {r}")
        c, r = call("POST", f"/services/{svc['id']}/deploys", {"clearCache": "do_not_clear"})
        print("  redeploy:", "started" if c in (200, 201) else f"failed {c} {r}")
    else:
        payload = {"type": "web_service", "name": NAME, "ownerId": owner["id"], "repo": REPO, "branch": "main", "autoDeploy": "yes", "envVars": env,
                   "serviceDetails": {"runtime": "python", "plan": "free", "region": "oregon", "healthCheckPath": "/api/status",
                                      "envSpecificDetails": {"buildCommand": "pip install -r requirements.txt", "startCommand": "python server/server.py"}}}
        code, r = call("POST", "/services", payload)
        if code == 400 and "runtime" in json.dumps(r).lower():          # older API spelling
            payload["serviceDetails"]["env"] = payload["serviceDetails"].pop("runtime")
            code, r = call("POST", "/services", payload)
        if code not in (200, 201):
            sys.exit(f"Render refused to create the service ({code}): {json.dumps(r)[:600]}")
        svc = r.get("service") or r
        print("Created service:", svc.get("id"))

    sid = svc["id"]
    print("Waiting for the build and first start (usually 3-6 minutes)...")
    url = None
    for _ in range(90):
        time.sleep(10)
        c, ds = call("GET", f"/services/{sid}/deploys?limit=1")
        st = (ds[0].get("deploy") or ds[0]).get("status") if c == 200 and ds else "?"
        c2, s2 = call("GET", f"/services/{sid}")
        url = (s2.get("serviceDetails") or {}).get("url") if c2 == 200 else url
        print(f"  deploy: {st}")
        if st == "live":
            break
        if st in ("build_failed", "update_failed", "canceled", "pre_deploy_failed"):
            sys.exit(f"Deploy ended with status {st}. Open the service logs in the Render dashboard.")
    else:
        sys.exit("Timed out waiting for the deploy. Check the Render dashboard.")
    print("\nLIVE:", url)
    try:
        with urllib.request.urlopen(url + "/api/status", timeout=60) as r:
            print("Health check:", r.status, json.loads(r.read()).get("mode"))
    except Exception as e:  # free services can take a while to wake
        print("Health check not answered yet (the free plan may still be starting):", type(e).__name__)


if __name__ == "__main__":
    main()
