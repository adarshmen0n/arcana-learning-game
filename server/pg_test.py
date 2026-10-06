"""Runs the platform tests against a throwaway embedded Postgres (needs: pip install pgserver)."""
import os, runpy, sys, tempfile
import pgserver
srv = pgserver.get_server(tempfile.mkdtemp())
os.environ["DATABASE_URL"] = srv.get_uri()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_platform.py"), run_name="__main__")
