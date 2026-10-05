# Arcana AI: project status

Last updated: 2026-10-05. "Verified" means a test or a live run actually executed it. Nothing here is marked done without that.

## Summary
ARCANA is a **student-only, single-player** product. Content to game to events to mastery to adapted setup works: each student's answers update a per-topic mastery estimate, which sets difficulty, teaching style and a practice station for the next chapter, and feeds an interactive roadmap. Still **not built**: knowledge graph and prerequisites, retrieval (RAG), and a planner that generates new missions per student. Adaptation is rule-based and deterministic, not learned.

## Status against the master specification

| Area | Status | Notes |
|---|---|---|
| PDF / DOCX / PPTX / TXT / HTML ingestion | DONE, verified | `server/ingest.py`, `test_ingest.py` (fixtures built in code; not tried on real-world files) |
| Scanned PDF and image reading | NEEDS TESTING | Needs a Claude key (PDF) or Claude/Gemini/OpenAI (images). Never run live. |
| Cleaning / normalisation | PARTIAL | Whitespace and heading normalisation only |
| Semantic chunking | PARTIAL | The AI splits the text into chapters at topic boundaries. No page/section/chunk metadata is kept. |
| Embeddings, vector search, RAG | NOT STARTED | The whole document (up to a size limit) is sent to the model instead. Free plans cap this (Groq about 18k characters). |
| Concept extraction | DONE, verified live once | Flat list with importance and complexity. No relationships. |
| Knowledge graph / prerequisites | NOT STARTED | |
| Learning graph and learning path | PARTIAL | Roadmap shows the chapter path with status and mastery. Order is the AI's chapter order; no prerequisites. |
| Student model | DONE, verified | Per user and game: answers (correctness, difficulty, time, hints), progress, per-concept mastery, stored difficulty. `test_platform.py` |
| Mastery engine | DONE, verified | `server/mastery.py`: difficulty-weighted updates, hint penalty, streak bonus, forgetting toward 0.5. `test_mastery.py` (23 checks) |
| Difficulty adaptation | DONE, verified | Level 1-5, moves one step per 12 answers; sets hearts, bosses, rival, hints, explanations. Rule-based. Not yet play-tested by a real student. |
| Misconception / remediation | PARTIAL | A practice station replays recently missed questions of weak topics before the chapter boss. No misconception labels. |
| Planner (what next) | PARTIAL | Roadmap recommendations (continue, review, practise, upload). Does not generate new content per student. |
| Lessons, questions, missions, bosses | DONE, verified | AI-written, then re-answered by a second pass; invalid ones dropped. Live run: 1 document, 2 chapters. |
| Progressive hints | PARTIAL | One static hint per obstacle |
| Game specification contract | PARTIAL | `GameScript` v1 works but is not yet a formal JSON Schema in `shared/` |
| Game events contract | PARTIAL | Answer events carry difficulty, time and hints; chapter progress. No mission start/fail events. |
| Game engine | DONE, bot-tested | Movement, fights, arcade levels, five worlds. Physical keyboard and phones not hand-tested. |
| AI provider abstraction and fallback | DONE, verified | `server/llm.py`: Claude, Gemini, Groq, OpenRouter and others, cooldowns, failover. Tested with local stand-ins and one live run. |
| Retry / backoff | PARTIAL | Cooldown and failover exist; no exponential backoff per call |
| Structured output validation | DONE | Schema check, repair retry, then failover; question integrity checks |
| Frontend | DONE, browser-checked | Dashboard (login, stats, adaptive setup, roadmap, upload, games) and game. Keyboard and phone play not hand-tested. |
| Teacher portal | REMOVED | By design: students only; the game is the teacher |
| Backend | DONE, deviation | Standard-library HTTP server and SQLite, not FastAPI and PostgreSQL (see architecture.md) |
| Authentication | DONE, verified | Username and password (scrypt), 30-day HttpOnly session cookie, logout, delete account. No password reset (no email). |
| Observability | PARTIAL | Per-job logs and token tallies. No structured request logging. |
| Security | PARTIAL | Hashing, rate limits, JSON-only POSTs, escaped output, key in `.env`. No CORS (same origin only). |
| Tests | PARTIAL | 4 suites pass (mastery, platform incl. adaptation and roadmap, AI path, ingest). No CI; no automated browser test. |
| Deployment | DEPLOYED | GitHub + Render (`render.yaml`, `Dockerfile`, `server/deploy_render.py`). Free plan loses data on restart (see README). |
| Documentation | PARTIAL | README, this file, architecture.md, game-ai-contract.md |

## MVP checklist (spec section 65)
- [x] Upload PDF, extract, clean (basic), chunk (by chapter)
- [ ] Embed, retrieve, RAG
- [x] Extract concepts
- [ ] Build learning graph
- [x] Create student model, estimate mastery
- [x] Select next objective (roadmap recommendations)
- [x] Generate lesson, question, mission
- [x] Generate game specification, game consumes it
- [x] Player completes challenge, game sends event
- [x] Mastery updated from play (deterministic, not AI)
- [ ] AI chooses next experience (setup adapts per student; new content is not generated per student)

## Recommended order for the next work
1. **Persistent storage**: Render free plan wipes SQLite on restart. Move to managed Postgres or a paid disk before real users.
2. **Prerequisite edges** between concepts (model-proposed, validated acyclic) feeding the roadmap.
3. **Planner**: generate a short remedial mission for a weak concept instead of replaying old questions.
4. **Formal contracts** in `shared/schemas/` with validators used by both sides.
5. **Retrieval** (embeddings) so long documents work on small-context providers.
6. Password reset (needs email) and CI with a browser test.

## Blockers
- Render's free plan cannot keep the database between restarts.
