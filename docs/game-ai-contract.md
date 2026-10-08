# Game / AI contract (GameScript v1)

The only thing that crosses from the AI side to the game engine. Produced by `server/pipeline.py`, consumed by `arcana/game.js`. Checked by `pipeline.check_script` before it is saved.

```jsonc
{
  "schemaVersion": 1,
  "schemaVersion": 2, "projectId": "…", "title": "…", "summary": "…",
  "audience": { "level": "school" },
  "chapters": [{
    "id": "ch1", "title": "…", "goal": "…",
    "theme": { "background": "ancient_forest | crystal_cave | ember_citadel | desert_canyon | aurora_peaks" },
    "concepts": [{ "id": "c1", "name": "…", "sources": [{ "title": "…", "url": "…" }] }],
    "scenes": [
      { "type": "npc",        "role": "intro|core|deep|recap", "npc": { "name": "…", "look": "lumen|thyla|ranger|sage" }, "dialogue": [{ "text": "…", "highlight": ["…"] }], "keyIdea": "…", "teacherNote": "…" },
      { "type": "tablet",     "tablet": { "title": "…", "points": ["…"], "example": "…", "mistake": "…", "terms": [["term", "meaning"]] } },
      { "type": "obstacle",   "question": Question, "hint": "…" },
      { "type": "match",      "opponent": { "name": "…", "skill": 0.6 }, "questions": [Question] },
      { "type": "mission",    "mission": { "kind": "order", "instruction": "…", "items": ["…"] } },
      { "type": "mission",    "mission": { "kind": "match_pairs", "instruction": "…", "pairs": [["term", "meaning"]] } },
      { "type": "maze | shooter", "title": "…", "questions": [Question] },
      { "type": "level_test", "questions": [Question], "passMark": 4 },
      { "type": "mini_boss",  "boss": { "name": "…", "kind": "enforcer|colossus", "fight": "martial|magic" }, "count": 6 }
    ]
  }],
  "finalBoss": { "title": "…", "boss": { "name": "…", "kind": "overlord", "fight": "magic" }, "count": 25, "passMarkRatio": 0.7 }
}
```
`Question` = `{ id, conceptId, prompt, options[2..4], correctIndex, explanation, difficulty 1..3 }`.

Rules the engine relies on: question ids are unique; `correctIndex` is in range; options are distinct; every chapter has a boss and at least 4 questions.

## Events from the game (student API)
`POST /api/events` `{ gameId, events: [{ qid, concept, correct, difficulty, ms, hints, kind, chapter }] }` (session cookie).
`GET /api/adapt?game=<id>` returns the student's current setup: `difficulty` 1-5, `style` guided|balanced|challenge, `maxHearts`, boss and rival tuning, `showHints`, `explainAlways`, `practice` question ids and a plain-language `why`.
`POST /api/progress` `{ gameId, chapterIdx, score, finished }`. Progress only moves forward.

## Not yet in the contract (planned, see project-status.md)
Selected answer, mission started/failed events, and a game specification generated per student by a planner (today the same chapters are played with per-student settings and a practice station).

## Chapter order (schemaVersion 2)
mentor (intro) > tablet > [ambush, added by the game] > mentor (core) > seal or arcade > tablet > mentor (deep dive) > rival match > mentor (recap) > mission > trial > [ambush] > mini-boss.
At least 60% of the stations teach. Questions are generated from the lesson text so they only test what was taught.

## Arc Search API
`GET /api/arc?game=<id>` history (and today's usage) · `POST /api/arc { message, gameId?, context? }` returns `{ answer (Markdown), notesUsed }` · `DELETE /api/arc?game=<id>` clears the chat.
`POST /api/games/<id>/rebuild` builds a new version of an existing game from its stored source with the current generator.
