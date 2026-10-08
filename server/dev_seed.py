"""Developer helper: start the server on a throwaway database with one ready-made account and two games (no AI needed).
   python server/dev_seed.py 5183   ->  log in as demo@example.com / demo-pass-123
   Games: the old-format fixture (demo0game0001) and one built offline by the current generator (demo0game0002)."""
import json, os, pathlib, runpy, sys, tempfile, time
os.environ["ARCANA_DATA"] = tempfile.mkdtemp()
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import db, pipeline  # noqa: E402
uid = db.create_user("demo", "demo-pass-123", "m", "demo@example.com")
game = json.loads((HERE / "fixtures" / "sample_game.json").read_text(encoding="utf-8"))
db.add_game("demo0game0001", uid, game["title"]); db.save_script("demo0game0001", game)
text = (HERE.parent / "samples" / "photosynthesis.txt").read_text(encoding="utf-8")
job = pipeline.start("photosynthesis.txt", text=text, opts={"offline": True})
while job.status in ("queued", "running"):
    time.sleep(0.1)
db.add_game("demo0game0002", uid, job.script["title"] + " (v2)"); db.save_script("demo0game0002", job.script); db.save_source("demo0game0002", text)
sys.argv = ["server.py", sys.argv[1] if len(sys.argv) > 1 else "5183"]
runpy.run_path(str(HERE / "server.py"), run_name="__main__")
