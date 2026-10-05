# Arcana AI — Product Blueprint

Turn any study file into a short arcade game. The student plays and studies at the same time.

---

## 1. System Architecture

```
 Browser (Next.js + Phaser)                      Backend (FastAPI / Node)
┌──────────────────────────┐   upload file    ┌──────────────────────────────┐
│ Upload UI                │ ───────────────▶ │ 1. Ingest: PDF/DOCX/PPT/img  │
│ Progress screen          │                  │    → clean text + structure  │
│ Game Player (Phaser)     │ ◀─ job status ── │ 2. Analyzer (LLM)            │
│  └ loads GameScript JSON │    (SSE/poll)    │    → topics, difficulty,gaps │
│ Score / XP / save        │                  │ 3. Research (LLM + web search│
└────────────▲─────────────┘                  │    tool) for gaps only       │
             │ GameScript JSON per chapter    │ 4. Chunker → 3-6 chapters    │
             │                                │ 5. Teacher (LLM) → lessons   │
┌────────────┴─────────────┐                  │ 6. Game Script Generator     │
│ DB: Postgres + object    │ ◀─────────────── │ 7. Validator (schema + fact  │
│ storage (files, scripts, │    store         │    check) → retry on fail    │
│ progress)                │                  └──────────────────────────────┘
└──────────────────────────┘                  Job queue (Redis/BullMQ/Celery)
```

Key rules:
- **Async pipeline.** Upload returns a `jobId`. The queue runs the steps. The UI shows live progress ("Reading… Researching… Building Chapter 1…").
- **Chapter 1 is generated first** and is playable while later chapters keep generating in the background, so the student never waits long.
- **The AI outputs data, never game code.** One fixed engine plays any script. This gives zero lag and no per-upload bugs.
- **Web search is gated.** A concept is researched only if the analyzer flags it as thin, ambiguous or outdated. This keeps cost and latency down.

---

## 2. Data Pipeline & Chunking Logic

### Step by step
1. **Ingest.** Extract text with headings, lists and tables preserved (pdfplumber/PyMuPDF; OCR for scans; python-docx/pptx).
2. **Analyze (LLM).** Output a concept map: `[{concept, importance 1-5, complexity 1-5, needs_research, source_span}]`.
3. **Research (only for flagged concepts).** The LLM calls a search tool (Tavily/Brave/Anthropic web search), reads the top results and writes a short grounded note with source URLs.
4. **Chunk by meaning, not line count.** "100 lines → 4 × 25" is a *target*:
   - Target 3–6 chapters, each about 4–8 concepts (roughly 15–25% of the content).
   - Split at heading or topic boundaries. Never cut mid-concept.
   - Merge tiny sections. Split sections that are too large.
   - Each chapter must have a one-line learning goal.
5. **Teach.** For each chapter, write short, simple, example-led lesson cards, each linked to a concept ID.
6. **Generate the game script** (schema below).
7. **Validate.** Check JSON schema, check every question has exactly 1 correct answer, and have a second LLM pass verify each answer against the source text and research notes. Regenerate failures (max 2 retries).

### Question budget per chapter
| Element | Count | Notes |
|---|---|---|
| NPC lessons | 3–4 | 2–4 short cards each |
| Obstacles | 3–4 | 1 question each |
| AI Match | 1 | 5 MCQs, 1 mark each, versus AI opponent |
| Mission | 1–2 | Task-style (order, match, fill the gap) |
| Level test | 5 | Gate to the boss |
| **Final boss (end of the whole file)** | **25** | Drawn from all chapters, weighted by importance |

Your spec has a boss per chapter covering the whole syllabus. Recommended: **a mini-boss at each chapter end (10 questions from that chapter only)** and **one Final Boss with 25 questions covering the entire upload**. This keeps each game short and still delivers your "whole syllabus" boss.

### Game Script JSON schema (v1)
```json
{
  "schemaVersion": 1,
  "projectId": "p_123",
  "title": "Photosynthesis",
  "chapters": [
    {
      "id": "ch1",
      "title": "Light Reactions",
      "goal": "Explain how light energy becomes chemical energy",
      "theme": { "background": "crystal_cave", "palette": "cyan", "music": "calm_1" },
      "concepts": [
        { "id": "c1", "name": "Chlorophyll", "summary": "...", "source": "doc|web", "refs": ["https://..."] }
      ],
      "scenes": [
        {
          "type": "npc",
          "id": "s1",
          "npc": { "name": "Professor Lumen", "sprite": "wizard_a" },
          "conceptIds": ["c1"],
          "dialogue": [
            { "text": "Chlorophyll is the green pigment that captures light.", "highlight": ["chlorophyll"] },
            { "text": "Think of it as a solar panel inside every leaf.", "highlight": [] }
          ]
        },
        {
          "type": "obstacle",
          "id": "s2",
          "conceptIds": ["c1"],
          "obstacleSprite": "stone_gate",
          "question": {
            "id": "q1",
            "prompt": "Which pigment absorbs light for photosynthesis?",
            "options": ["Chlorophyll", "Keratin", "Melanin", "Insulin"],
            "correctIndex": 0,
            "explanation": "Chlorophyll absorbs mainly red and blue light.",
            "difficulty": 1,
            "conceptId": "c1"
          },
          "onWrong": { "hint": "Re-read the NPC card", "retry": true, "damage": 1 }
        },
        {
          "type": "match",
          "id": "s3",
          "opponent": { "name": "Rival Bot", "skill": 0.6 },
          "questions": ["... 5 question objects ..."],
          "scoring": { "perCorrect": 1, "winCondition": "higher_score" }
        },
        {
          "type": "mission",
          "id": "s4",
          "mission": {
            "kind": "order|match_pairs|fill_gap|collect",
            "instruction": "Put the steps of the light reaction in order",
            "items": ["..."],
            "solution": ["..."]
          }
        },
        { "type": "level_test", "id": "s5", "questions": ["... 5 question objects ..."], "passMark": 4 },
        { "type": "mini_boss", "id": "s6", "boss": { "name": "...", "hp": 10, "sprite": "..." }, "questions": ["... 10 ..."] }
      ]
    }
  ],
  "finalBoss": {
    "boss": { "name": "The Archmage", "hp": 25, "sprite": "boss_final" },
    "questions": ["... 25 question objects, each tagged with chapterId ..."],
    "passMark": 18,
    "weakTopicReport": true
  }
}
```

Student progress is stored separately: `{userId, projectId, chapterId, sceneId, score, mistakes[], xp}`. Missed questions feed a **review loop**: wrong concepts reappear in later matches and in the Final Boss.

---

## 3. Game Mechanics Blueprint

One concept becomes five game elements:

| Concept (from source) | Game element | How the AI builds it |
|---|---|---|
| "Chlorophyll absorbs red and blue light" | **NPC dialogue** | 2–3 short lines, plain language, one analogy, key term highlighted, typed out on screen as a pop-up |
| Same concept | **Obstacle** | One MCQ with 3 plausible distractors; right answer opens the gate, wrong answer shows a hint and costs 1 HP |
| Group of 5 related concepts | **AI Match** | 5 MCQs, 1 mark each; the AI opponent has a skill level (e.g. 60%) so it is beatable but not trivial |
| A process or relationship | **Mission** | Task type chosen by content: sequences → ordering, definitions → pair matching, formulas → fill the gap |
| All concepts | **Level test and Boss** | Questions sampled across concepts; boss HP drops per correct answer, player loses HP per wrong answer |

Question-writing rules for the LLM:
- Exactly 1 correct answer. Distractors are plausible, made from common misconceptions.
- Mix difficulty (easy, medium, hard) with increasing difficulty through the chapter.
- Every question references a concept ID and a source span, so it can be verified.
- Explanations are shown after the answer. This is where much of the learning happens.

Engine design (fixed):
- Side-scrolling or top-down arcade runner in Phaser. The player auto-moves, meets scene triggers, and a pop-up panel handles all text and questions.
- One reusable scene per type (`NpcScene`, `ObstacleScene`, `MatchScene`, `MissionScene`, `BossScene`).
- Themes only swap the background, tint, music and sprites. Assets are a pre-made pack of about 8–10 themes, chosen by the AI from a list by chapter topic.
- Each chapter is about 5–8 minutes. The whole game (3–6 chapters plus the final boss) is about 30 minutes.

Game feel: XP, streaks, HP hearts, stars per chapter, and a weak-topic report after the Final Boss.

---

## 4. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (React) + TypeScript + Tailwind | Fast to build, simple routing and upload UI |
| Game engine | **Phaser 3** | Mature 2D arcade framework, great for sprites, scenes, tweens, audio |
| Backend | **FastAPI (Python)** | Best ecosystem for PDF/OCR; async; typed with Pydantic |
| Queue | Redis + Celery (or RQ) | Long AI jobs run in the background |
| AI | **Claude API** (Sonnet-class for generation, a cheaper tier for validation) with structured output / tool use for JSON | Reliable schema-bound output |
| Web search | Anthropic web search tool or Tavily/Brave API | Grounded research with citations |
| Parsing | PyMuPDF/pdfplumber, python-docx, python-pptx, Tesseract or a vision model for OCR | Covers "any file" |
| DB / storage | Postgres (Supabase) + S3-compatible object storage | Users, scripts, progress |
| Auth | Supabase Auth or Clerk | Save progress |
| Hosting | Vercel (frontend) + Railway/Render/Fly (API and worker) | Cheap and simple |
| Assets | Free/CC0 arcade packs (Kenney.nl, itch.io) for sprites, backgrounds, audio | Fast, no art bottleneck |

---

## 5. MVP Roadmap (built with AI dev tools)

**Phase 0 — Foundations (1–2 days)**
Repo, Next.js app, FastAPI service, Postgres, `.env`, CI. Lock the **GameScript JSON schema** (Pydantic + TypeScript types generated from it).

**Phase 1 — Game engine on fake data (3–5 days)** *(highest-value step)*
Build Phaser scenes for NPC, Obstacle, Match, Mission, Boss from a hand-written sample script. Add HP, score, pop-up UI, one theme. Done when one chapter plays end-to-end smoothly on a phone and a laptop.

**Phase 2 — Text → Script (3–5 days)**
Accept pasted text or TXT. Build analyzer → chunker → teacher → script generator → validator. Output valid JSON that the Phase 1 engine plays directly. No web search yet.

**Phase 3 — Real files (2–3 days)**
PDF and DOCX ingest, OCR fallback, upload UI, async jobs, progress screen. Chapter 1 playable while the rest generates.

**Phase 4 — Web research (2–3 days)**
Add the gap detector and search tool, with citations stored per concept. Test on topics where the file is thin.

**Phase 5 — Full loop (3–4 days)**
Multiple chapters, themes, mini-bosses, Final Boss (25 questions), weak-topic report, review loop, XP and streaks, accounts and saved progress.

**Phase 6 — Quality and launch (ongoing)**
- Question quality: sample 50 generated questions per subject and measure the wrong-answer rate. Target under 2%.
- Performance: aim for 60 FPS on a mid-range phone, assets under about 5 MB per theme, lazy-loaded.
- Safety: file size and type limits, virus scan, per-user rate limits and cost caps, copyright and privacy notice.
- Beta with 10–20 students and track completion rate and quiz scores.

**Main risks and fixes**
| Risk | Fix |
|---|---|
| Wrong or ambiguous questions | Second-pass verification against the source, plus an in-game "report this question" button |
| Long wait after upload | Generate chapter 1 first, stream the rest |
| High AI cost | Cache by file hash, use cheaper models for validation, search only on flagged gaps |
| Game gets repetitive | Several mission types, theme rotation, varied obstacle sprites |
| Huge or messy PDFs | Page and size limits, cleanup pass, ask the student to pick chapters |

---

## What I still need from you
1. The **game layout** you mentioned: reference game, sketch or screenshot (side-scroller, top-down RPG, runner?).
2. The **target students** (school, college, exams).
3. A **Claude API key** when we reach Phase 2.
