# Arcana AI

Turn any study material into a playable 2D adventure. Students walk, jump and fight through chapters that teach the material, take quizzes as boss fights and arcade levels, and teachers see which topics the class finds hard.

- **Game:** side-scrolling adventure with a man or woman ranger, animated martial-arts and magic fights, a Pac-Man style maze and a Space-Invaders style shooter, five themed worlds, and a revision screen for missed questions.
- **Upload to game:** PDF, DOCX, PPTX, TXT, MD, HTML or images become chapters, lessons, missions and checked questions. Several AI services work as automatic backups for each other (Gemini, Groq, OpenRouter, Claude, Mistral, DeepSeek, OpenAI, local Ollama), and an offline mode works with no key at all.
- **Classes:** teachers create classes with a join code, assign games and read reports. Students join with a code and a nickname only (no email, no password).
- **Phones:** installable as an app, with touch controls.

## Run it on your computer
```
pip install -r requirements.txt
python server/server.py 5181
```
Open http://127.0.0.1:5181 (game) and http://127.0.0.1:5181/teacher.html (teacher portal).

## Turn on the AI (any one key is enough)
1. Copy `.env.example` to `.env` and paste one or more keys. Free options: Gemini, Groq, OpenRouter. Best quality: Claude.
2. Restart the server. Check the keys with `python server/check_keys.py`.

If a service hits its limit or errors, the next one takes over automatically. Keys stay on the server and are never sent to the browser. `.env` is never committed.

## Put it online (Render)
1. Push this repo to GitHub.
2. On https://dashboard.render.com choose **New > Blueprint**, pick this repo and apply `render.yaml`.
3. In the service's **Environment** tab paste your keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, optional `ANTHROPIC_API_KEY`).
4. Open the `onrender.com` address. Teachers register at `/teacher.html`.

Hosted mode (`ARCANA_HOSTED=1`) requires a teacher login to create games and limits each teacher to `ARCANA_MAX_GAMES_PER_DAY` (default 5) so free AI quotas are protected.

**Important on the free plan:** Render's free web service has a temporary disk and sleeps after 15 minutes without visits. Accounts, classes and games are stored in `data/` (SQLite and JSON files) and are lost when the service restarts or redeploys. For real classroom use, add a Render persistent disk mounted at `/opt/render/project/src/data` (paid) or set `ARCANA_DATA` to a mounted volume.

## Controls
`A`/`D` or arrows move, `W`/Space jump, Shift sprint, `E` interact, `1`-`4` choose answers, `M` mute. On phones: on-screen buttons, rotate to landscape.

## Tests
```
python server/test_ingest.py     # file readers
python server/test_ai_path.py    # AI layer + provider failover (local stand-ins, no keys, no cost)
python server/test_platform.py   # accounts, classes, students, permissions, reports
```

## Project layout
`arcana/` browser game and teacher portal (Phaser 3, no build step) · `server/` Python server, AI router, pipeline, database · `samples/` example notes.
