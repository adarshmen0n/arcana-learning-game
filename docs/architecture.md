# Architecture (current)

```
Browser (arcana/)                          Server (server/)
 game: Phaser 3 engine ───────────────►  api.py       routes, auth, rate limits
 index.html dashboard + roadmap          db.py        SQLite: users, sessions, games, events, progress, mastery
                                          mastery.py   pure engine: mastery, difficulty, teaching style, settings
                                          roadmap.py   stats, adaptation per student, roadmap nodes, achievements
                                          pipeline.py  file -> text -> plan -> chapters -> verify -> GameScript JSON
                                          llm.py       provider router with failover (Claude, Gemini, Groq, ...)
                                          ingest.py    PDF/DOCX/PPTX/TXT/HTML readers
                                          mockgen.py   offline fallback (no key)
```

## The one hard boundary
The AI side produces a **GameScript** (JSON data). The game engine turns it into gameplay. The AI never decides pixels, coordinates, physics or rendering; the engine never decides educational content. See `game-ai-contract.md`.

## Data flow
1. `POST /api/jobs` with a file or text. A background job runs `pipeline._run`.
2. Ingest extracts text. The planner call returns title, concepts, chapters (mood, fight style, boss name).
3. Optional web research (Claude only) fills thin concepts.
4. For each chapter two calls write lessons and questions; a third call re-answers every question and drops any that disagree. Chapter 1 is published first so play can start.
5. `assemble_chapter` builds scenes deterministically in a fixed order, so the engine always receives a playable chapter.
6. The finished script is saved as `data/scripts/<id>.json`.
7. Students play; answers go to `POST /api/events`, progress to `POST /api/progress`. `db.apply_events` updates per-concept mastery in the same transaction. Before each chapter the game calls `GET /api/adapt` and applies the returned settings (hearts, boss ratio, rival skill, hints, practice questions). The dashboard reads `GET /api/roadmap`.

## Modules and ownership boundaries
| Module | Files | Rule |
|---|---|---|
| AI layer | `llm.py`, `pipeline.py`, `mockgen.py` | Never imports the game; outputs GameScript only |
| Platform | `api.py`, `db.py`, `config.py`, `server.py` | No AI logic in the database layer |
| Game engine | `arcana/game.js`, `fight.js`, `arcade.js`, `art-*.js` | Reads GameScript; reports events; no AI calls |
| UI | `arcana/ui.js`, `style.css`, `home.js`, `home.css` | Presentation and API calls only |

## Deliberate deviations from the master specification
- **Standard-library server and SQLite instead of FastAPI and PostgreSQL.** Zero install, easy to run for a solo developer and for a demo. The route table in `api.py` maps one-to-one to FastAPI routes if migration is needed. Required before any real scale.
- **No vector database yet.** The whole document goes to the model. This is the first thing to replace for long documents (see project-status.md).
- **Black and neon theme.** The spec asks to avoid excessive neon; the owner chose this theme to match the logo, so it stays.
- **Modular monolith.** One deployable service, as the spec recommends for the MVP.

## Security notes
Passwords: scrypt. Sessions: random token, HttpOnly SameSite=Lax cookie (Secure when hosted). Students: username and password only, no email. Every query is scoped to the logged-in user and games are private to their owner. POST bodies must be JSON (blocks cross-site form posts). Output from the server and from the AI is escaped before display. Spreadsheet exports neutralise formula injection. API keys live only in `.env` or the host's environment.
