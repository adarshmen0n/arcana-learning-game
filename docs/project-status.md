# Arcana AI: project status

Last updated: 2026-10-05. "Verified" means a test or a live run actually executed it. Nothing here is marked done without that.

## Summary
The **content to game to events** half of the closed loop works. The **adaptive** half (knowledge graph, student model, mastery, planner, next-experience) is **not built yet**. Today every student plays the same chapters in the same order; their answers are recorded and shown to the teacher, but they do not change what the game does next.

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
| Learning graph and learning path | NOT STARTED | Chapter order is the order the AI planned. |
| Student model | PARTIAL | Per-student answers and progress are stored. No model beyond raw counts. |
| Mastery engine | NOT STARTED | The teacher report shows per-concept accuracy, which is not a mastery estimate. |
| Difficulty adaptation | NOT STARTED | Questions carry a 1-3 difficulty; nothing adapts to it. |
| Misconception / remediation | NOT STARTED | After the game, missed questions are shown for revision. No live remediation. |
| Planner (what next) | NOT STARTED | |
| Lessons, questions, missions, bosses | DONE, verified | AI-written, then re-answered by a second pass; invalid ones dropped. Live run: 1 document, 2 chapters. |
| Progressive hints | PARTIAL | One static hint per obstacle |
| Game specification contract | PARTIAL | `GameScript` v1 works but is not yet a formal JSON Schema in `shared/` |
| Game events contract | PARTIAL | Only answer events and chapter progress are sent |
| Game engine | DONE, bot-tested | Movement, fights, arcade levels, five worlds. Physical keyboard and phones not hand-tested. |
| AI provider abstraction and fallback | DONE, verified | `server/llm.py`: Claude, Gemini, Groq, OpenRouter and others, cooldowns, failover. Tested with local stand-ins and one live run. |
| Retry / backoff | PARTIAL | Cooldown and failover exist; no exponential backoff per call |
| Structured output validation | DONE | Schema check, repair retry, then failover; question integrity checks |
| Frontend (game UI) | DONE | Title, character select, HUD, panels. No learner dashboard (mastery, path). |
| Teacher portal | DONE, verified | Accounts, classes, join codes, assignments, reports (`test_platform.py`, browser check) |
| Backend | DONE, deviation | Standard-library HTTP server and SQLite, not FastAPI and PostgreSQL (see architecture.md) |
| Authentication | DONE, verified | Teachers: scrypt passwords, session cookie. Students: nickname plus random token. |
| Observability | PARTIAL | Per-job logs and token tallies. No structured request logging. |
| Security | PARTIAL | Hashing, rate limits, JSON-only POSTs, escaped output, key in `.env`. No CORS (same origin only). |
| Tests | PARTIAL | 3 suites pass. No CI and no end-to-end test of the adaptive loop (it does not exist yet). |
| Deployment | PREPARED, NOT DEPLOYED | `render.yaml`, `Dockerfile`. Free plan loses data on restart (see README). |
| Documentation | PARTIAL | README, this file, architecture.md, game-ai-contract.md |

## MVP checklist (spec section 65)
- [x] Upload PDF, extract, clean (basic), chunk (by chapter)
- [ ] Embed, retrieve, RAG
- [x] Extract concepts
- [ ] Build learning graph
- [ ] Create student model, estimate mastery
- [ ] Select next objective
- [x] Generate lesson, question, mission
- [x] Generate game specification, game consumes it
- [x] Player completes challenge, game sends event
- [ ] AI updates mastery
- [ ] AI chooses next experience

## Recommended order for the next work
1. **Mastery engine** (deterministic, fully testable): per-student, per-concept mastery from the events already stored (correctness, difficulty, recency, hints). Pure Python, unit-tested.
2. **Prerequisite edges**: ask the model for `prerequisite_of` between the extracted concepts, validate it is acyclic, store it as the knowledge graph.
3. **Planner**: from mastery plus graph, choose the next concept and difficulty; generate a short remedial or practice mission for a weak concept and play it before moving on.
4. **Formal contracts** in `shared/schemas/` (GameScript, GameEvent, Mission) with validators used by both sides.
5. **Retrieval** (embeddings behind a provider interface) so long documents work on small-context providers.

## Blockers
- Deployment and publishing need the owner's GitHub and Render logins (not available to the assistant).
- Render's free plan cannot keep the database between restarts.
