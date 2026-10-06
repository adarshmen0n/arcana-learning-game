"""Developer helper: start the server on a throwaway database with one ready-made account and game (no AI needed).
   python server/dev_seed.py 5183   ->  log in as demo@example.com / demo-pass-123"""
import json, os, pathlib, runpy, sys, tempfile
os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import db  # noqa: E402
uid = db.create_user("demo", "demo-pass-123", "m", "demo@example.com")
game = json.loads((pathlib.Path(__file__).parent / "fixtures" / "sample_game.json").read_text(encoding="utf-8"))
db.add_game("demo0game0001", uid, game["title"]); db.save_script("demo0game0001", game)
sys.argv = ["server.py", sys.argv[1] if len(sys.argv) > 1 else "5183"]
runpy.run_path(str(pathlib.Path(__file__).parent / "server.py"), run_name="__main__")
