# Arcana AI (v2.0)

Turn any study material into a playable 2D adventure. Students walk, jump and fight through chapters that teach the material, take quizzes as boss fights and arcade levels, and the game learns how each student studies and adapts to them.

- **Teaching first:** every chapter has four mentors (introduction, core lesson, deep dive, recap) who speak 5 to 7 lines each and end with a key idea, plus two Knowledge Tablets (key points, a worked example, a common mistake, key terms). At least 60% of every chapter is teaching; questions are written only about what the lessons taught.
- **Arc Search:** an AI assistant (like ChatGPT) built into the game and the hub. Ask anything; inside a game it also uses your own uploaded notes, and it keeps your notes from every lesson and tablet. It is locked while a question, quest or fight is on screen.
- **Combat:** ambush fights are real-time with buttons (strike, kick, guard, dodge, powers). Every enemy carries a knowledge shard: a fact from your own upload. Bosses, missions and trials stay question-based. Powers and enchantments unlock as you level up; shards buy permanent enhancements in the Armory.
- **Game:** side-scrolling adventure with a man or woman ranger, animated martial-arts and magic fights, a Pac-Man style maze and a Space-Invaders style shooter, five themed worlds, and a revision screen for missed questions.
- **Upload to game:** PDF, DOCX, PPTX, TXT, MD, HTML or images become chapters, lessons, missions and checked questions. Several AI services work as automatic backups for each other (Gemini, Groq, OpenRouter, Claude, Mistral, DeepSeek, OpenAI, local Ollama), and an offline mode works with no key at all.
- **Accounts:** sign up with email and password (or Google), strong-password check, terms and privacy pages, password change and reset by email, download-my-data, delete-account, help centre with a support inbox. Every student has a private account and stays logged in. Games, answers and progress belong to that student only. There are no teachers or classes: the game is the teacher.
- **Adaptive:** accuracy, pace, mistakes and hints are tracked per topic. ARCANA changes your difficulty (hearts, boss size, rival skill), hints, explanations and extra practice to fit you.
- **Roadmap:** an interactive path of every chapter and the final boss, showing what is done, mastered, needs review or locked, with topic mastery bars and next-step recommendations.
- **Phones:** installable as an app, with touch controls.

## Run it on your computer
```
pip install -r requirements.txt
python server/server.py 5181
```
Open http://127.0.0.1:5181, create an account, and upload your notes.

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

**Keep data on the free plan:** Render's free web service has a temporary disk and sleeps after 15 minutes without visits. Create a free Postgres database at https://neon.tech (or supabase.com), copy its connection string and set it as `DATABASE_URL` (in `.env`, then `python server/deploy_render.py`, or in the Render Environment tab). Accounts, games, answers, mastery and roadmaps are then stored there and survive restarts. Without `DATABASE_URL` the app uses a local SQLite file, which Render's free plan erases on every restart.

## Support inbox and password-reset emails (optional)
Set `ADMIN_EMAILS` to your own account email: when you log in you see a Support inbox with the messages from the Help page. Set the `SMTP_*` and `MAIL_FROM` variables (any SMTP service, such as Brevo's free plan) to also enable "Forgot your password?" emails and email copies of new tickets. Until then the forgot link is hidden. The Terms and Privacy pages are plain-language drafts; have a lawyer review them before a commercial launch.

## Sign in with Google (optional)
Students can always use a username and password. To also show **Continue with Google**: in Google Cloud Console create an OAuth client of type *Web application*, add your site address (for example your onrender.com URL) under *Authorized JavaScript origins*, and set `GOOGLE_CLIENT_ID` in `.env` or the Render environment. The server verifies each Google token itself and links it to one private account.

## How generation stays on your material
The upload is split into passages and ranked (BM25). Each chapter is written only from the passages that match its topic, then a second AI pass re-answers every question, and finally each question is checked against your text; anything your material does not support is removed.

## Controls
`A`/`D` or arrows move, `W`/Space jump, Shift sprint, `E` interact, `1`-`4` choose answers, `M` mute. In a fight: `J` 4-hit strike chain, `K` kick (hold to break guards), `U` launcher then `J` in the air, `L` grab and throw, `S`+`J` sweep, `Shift` dodge then `J` dash strike, air `K` dive kick, air `S`+`K` ground slam, tap `S` as a hit lands to parry (reflects bolts), `E` execute a stunned weak enemy, `1`-`4` powers, `H` hide the move list. `Q` opens Arc Search. On phones: on-screen buttons, rotate to landscape.

## Tests
```
python server/test_ingest.py     # file readers
python server/test_ai_path.py    # AI layer + provider failover (local stand-ins, no keys, no cost)
python server/test_platform.py   # accounts, privacy between students, adaptation, roadmap
python server/test_mastery.py    # mastery and difficulty engine
python server/pg_test.py         # platform tests on a throwaway Postgres (pip install pgserver)
```

## Project layout
`arcana/` student dashboard (index.html) and game (play.html) (Phaser 3, no build step) · `server/` Python server, AI router, pipeline, database · `samples/` example notes.
