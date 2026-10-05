"""Checks every key in .env with one tiny request. Prints status only; keys are never shown.
Run:  python server/check_keys.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}

if not llm.PROVIDERS:
    sys.exit("No keys found. Copy .env.example to .env and add at least one key.")
for p in llm.PROVIDERS:
    try:
        out = p.json("You are a test.", 'Reply with {"ok": true}.', SCHEMA, None, 200, "low", None)
        print(f"  OK       {p.name:<14} model={getattr(p, 'model', None)}  reply={out}")
    except llm.Skip as e:
        print(f"  FAILED   {p.name:<14} {e}" + ("  (key rejected: check it)" if e.fatal else f"  (cooldown {int(e.cooldown)}s)" if e.cooldown else ""))
    except Exception as e:  # noqa: BLE001
        print(f"  ERROR    {p.name:<14} {type(e).__name__}: {e}")
