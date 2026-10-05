# Arcana AI

Turn any study material into a playable 2D adventure. Students walk, jump and fight through chapters that teach the material, take quizzes as boss fights and arcade levels, and the game learns how each student studies and adapts to them.

- **Game:** side-scrolling adventure with a man or woman ranger, animated martial-arts and magic fights, a Pac-Man style maze and a Space-Invaders style shooter, five themed worlds, and a revision screen for missed questions.
- **Upload to game:** PDF, DOCX, PPTX, TXT, MD, HTML or images become chapters, lessons, missions and checked questions. Several AI services work as automatic backups for each other (Gemini, Groq, OpenRouter, Claude, Mistral, DeepSeek, OpenAI, local Ollama), and an offline mode works with no key at all.
- **Accounts:** every student has a private account (username and password, stays logged in). Games, answers and progress belong to that student only. There are no teachers or classes: the game is the teacher.
- **Adaptive:** accuracy, pace, mistakes and hints are tracked per topic. ARCANA changes your difficulty (hearts, boss size, rival skill), hints, explanations and extra practice to fit you.
- **Roadmap:** an interactive path of every chapter and the final boss, showing what is done, mastered, needs review or locked, with topic mastery bars and next-step recommendations.
- **Phones:** installable as an app, with touch controls.

## Run it on your computer
```
pip install -r requirements.txt
python server/server.py 5181
```
Open http://127.0.0.1:5181, create an account, and upload your notes (or play the built-in starter game).

## Turn on the AI (any one key is enough)
1. Copy `.env.example` to `.env` and paste one or more keys. Free options: Gemini, Groq, OpenRouter. Best quality: Claude.
2. Restart the server. Check the keys with `python server/check_keys.py`.

If a service hits its limit or errors, the next one takes over automatically. Keys stay on the server and are never sent to the browser. `.env` is never committed.

## Put it online (Render)
1. Push this repo to GitHub.
2. On https://dashboard.render.com choose **New > Blueprint**, pick this repo and apply `render.yaml`.
3. In the service's **Environment** tab paste your keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, optional `ANTHROPIC_API_KEY`).
4. Open the `onrender.com` address and create a student account.

Every upload needs a login. Each student can build `ARCANA_MAX_GAMES_PER_DAY` games a day (default 5) to protect free AI quotas. `ARCANA_HOSTED=1` makes the session cookie Secure (HTTPS only).

**Important on the free plan:** Render's free web service has a temporary disk and sleeps after 15 minutes without visits. Accounts, games, answers and roadmaps are stored in `data/` (SQLite and JSON files) and are lost when the service restarts or redeploys. For real use, add a Render persistent disk mounted at `/opt/render/project/src/data` (paid) or set `ARCANA_DATA` to a mounted volume.

## Controls
`A`/`D` or arrows move, `W`/Space jump, Shift sprint, `E` interact, `1`-`4` choose answers, `M` mute. On phones: on-screen buttons, rotate to landscape.

## Tests
```
python server/test_ingest.py     # file readers
python server/test_ai_path.py    # AI layer + provider failover (local stand-ins, no keys, no cost)
python server/test_platform.py   # accounts, privacy between students, adaptation, roadmap
python server/test_mastery.py    # mastery and difficulty engine
```

## Project layout
`arcana/` student dashboard (index.html) and game (play.html) (Phaser 3, no build step) · `server/` Python server, AI router, pipeline, database · `samples/` example notes.
