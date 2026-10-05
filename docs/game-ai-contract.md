# Game / AI contract (GameScript v1)

The only thing that crosses from the AI side to the game engine. Produced by `server/pipeline.py`, consumed by `arcana/game.js`. Checked by `pipeline.check_script` before it is saved.

```jsonc
{
  "schemaVersion": 1,
  "projectId": "…", "title": "…", "summary": "…",
  "audience": { "level": "school", "modes": ["student", "teacher"] },
  "chapters": [{
    "id": "ch1", "title": "…", "goal": "…",
    "theme": { "background": "ancient_forest | crystal_cave | ember_citadel | desert_canyon | aurora_peaks" },
    "concepts": [{ "id": "c1", "name": "…", "sources": [{ "title": "…", "url": "…" }] }],
    "scenes": [
      { "type": "npc",        "npc": { "name": "…", "look": "lumen|thyla|ranger|sage" }, "dialogue": [{ "text": "…", "highlight": ["…"] }], "teacherNote": "…" },
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
`POST /api/events` `{ gameId, events: [{ qid, concept, correct, kind, chapter }] }` with header `X-Student-Token`.
`POST /api/progress` `{ gameId, chapterIdx, score, finished }`. Progress only moves forward.

## Not yet in the contract (planned, see project-status.md)
Hints used, response time, selected answer, mission started/failed events, and a game specification generated per student by a planner.
