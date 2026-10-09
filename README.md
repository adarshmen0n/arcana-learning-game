# Arcana AI (v2.1)

Turn any study material into a playable 2D adventure. Students walk, jump and fight through chapters that teach the material, take quizzes as boss fights and arcade levels, and the game learns how each student studies and adapts to them.

- **Game lobby:** a neon game menu over a living stage where your ranger trains. Continue your quest, world map, ranks (students can hide themselves), lobby music with a mute button.
- **Rewards:** level-up moments with XP count-ups, a daily login reward and streak flame (day 7 pays a jackpot), three daily challenges that pay shards for real study, a 20-tier season pass, and ranger looks (suits and glow trims) shown in the lobby and in every game.
- **Teaching first:** every chapter has four mentors (introduction, core lesson, deep dive, recap) who speak 5 to 7 lines each and end with a key idea, plus two Knowledge Tablets (key points, a worked example, a common mistake, key terms). At least 60% of every chapter is teaching; questions are written only about what the lessons taught.
- **Arc Search:** an AI assistant (like ChatGPT) built into the game and the hub. Ask anything; it checks live sources (Wikipedia for free, or Tavily/Brave if you add a key) so facts that change over time are current, cites them, and inside a game it also uses your own uploaded notes, and it keeps your notes from every lesson and tablet. It is locked while a question, quest or fight is on screen.
- **Combat:** ambush fights are real-time with buttons (strike, kick, guard, dodge, powers) and come in waves: 2 waves in an ambush, 3 waves and a champion in an elite fight. Difficulty follows your mastery so fights are hard but winnable. Every enemy carries a knowledge shard: a fact from your own upload. Bosses, missions and trials stay question-based. Powers and enchantments unlock as you level up; shards buy permanent enhancements in the Armory.
- **Game:** side-scrolling adventure with a man or woman ranger, animated martial-arts and magic fights, four mini-games (a Pac-Man style maze, Snake, a Hill Climb rally and a Space-Invaders style shooter, one in every chapter, each asking questions from your material and explaining every right answer), five themed worlds, and a revision screen for missed questions.
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

Every upload needs a login. There is no daily game limit by default (set `ARCANA_MAX_GAMES_PER_DAY` to add one). A student can build two games at once; when the free AI services are busy, the router waits and switches to the next one.

**Built for many players at once:**
- Game builds wait in a line (`ARCANA_PARALLEL_JOBS`, default 3 at a time) and students see their place in it.
- A file that was already turned into a game is reused instantly for the next student (no AI calls). Rebuild always writes a new version.
- If every AI service stays busy for `ARCANA_AI_PATIENCE` seconds (default 600), a quick version is built so the student can play now; Rebuild later adds full AI lessons.
- Common first questions to Arc Search are answered from a shared 6-hour cache; when the AI is busy, Arc answers from the notes and live sources.
- Game files are gzip-compressed with ETags; the Postgres connection pool (`ARCANA_DB_POOL`, default 8) lets requests run side by side.
- Free AI quotas are per key, so add several keys separated by commas (`GEMINI_API_KEY=key1,key2,key3`); the router rotates through them. `ARCANA_HOSTED=1` makes the session cookie Secure (HTTPS only).

**Keep data on the free plan:** Render's free web service has a temporary disk and sleeps after 15 minutes without visits. Create a free Postgres database at https://neon.tech (or supabase.com), copy its connection string and set it as `DATABASE_URL` (in `.env`, then `python server/deploy_render.py`, or in the Render Environment tab). Accounts, games, answers, mastery and roadmaps are then stored there and survive restarts. Without `DATABASE_URL` the app uses a local SQLite file, which Render's free plan erases on every restart.

## Support inbox and password-reset emails (optional)
Set `ADMIN_EMAILS` to your own account email: when you log in you see a Support inbox with the messages from the Help page. Set the `SMTP_*` and `MAIL_FROM` variables (any SMTP service, such as Brevo's free plan) to also enable "Forgot your password?" emails and email copies of new tickets. Until then the forgot link is hidden. The Terms and Privacy pages are plain-language drafts; have a lawyer review them before a commercial launch.

## Sign in with Google (optional)
Students can always use a username and password. To also show **Continue with Google**: in Google Cloud Console create an OAuth client of type *Web application*, add your site address (for example your onrender.com URL) under *Authorized JavaScript origins*, and set `GOOGLE_CLIENT_ID` in `.env` or the Render environment. The server verifies each Google token itself and links it to one private account.

## How generation stays on your material
The whole upload is split, in order, into parts (up to 20) and every part becomes its own chapter, so the game is as long as the material. After the lessons are written, a coverage check compares them with the part; anything not yet taught gets an extra mentor lesson. Without a Claude key, flagged topics are filled in from a free web lookup. Each chapter is written only from its own passages, then a second AI pass re-answers every question, and finally each question is checked against your text; anything your material does not support is removed.

## Controls
`A`/`D` or arrows move, `W`/Space jump, Shift sprint, `E` interact, `1`-`4` choose answers, `M` mute. In a fight: `J` 4-hit strike chain, `K` kick (hold to break guards), `U` launcher then `J` in the air, `L` grab and throw, `S`+`J` sweep, `Shift` dodge then `J` dash strike, air `K` dive kick, air `S`+`K` ground slam, tap `S` as a hit lands to parry (reflects bolts), `E` execute a stunned weak enemy, `1`-`4` powers, `H` hide the move list. `Q` opens Arc Search. On phones: on-screen buttons, rotate to landscape.

## Tests
```
python server/test_ingest.py     # file readers
python server/test_ai_path.py    # AI layer + provider failover (local stand-ins, no keys, no cost)
python server/test_platform.py   # accounts, privacy between students, adaptation, roadmap
python server/test_mastery.py    # mastery and difficulty engine
python server/test_generation.py # generation pipeline, full coverage of the upload
python server/test_rewards.py    # streaks, daily challenges, season pass, cosmetics
python server/test_scale.py      # build queue, shared game cache, quick-mode fallback, compression, many players
python server/pg_test.py         # platform tests on a throwaway Postgres (pip install pgserver)
```

## Project layout
`arcana/` student dashboard (index.html) and game (play.html) (Phaser 3, no build step) · `server/` Python server, AI router, pipeline, database · `samples/` example notes.
