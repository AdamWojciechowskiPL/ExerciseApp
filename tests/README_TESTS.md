# ExerciseApp – test suite v2 (node:test)

## Why v2
This suite is written to:
- match the **current spec discussed in the conversation** (weight tuning v1 + 3A + US-11 null-safe attributes),
- cover **the working areas** (clinical filters, pacing, phases, fatigue, prescription),
- remove brittle ad-hoc runners (structured output via `node --test`).

## How to install into repo
1) Copy all files from this folder into your repo root (or keep them in `tests/`).
2) Ensure Node >= 18.
3) Run:
   - `node run_tests.v2.js`
   - optional: `node run_tests.v2.js --verbose`

## Expected behavior
- Some tests are **spec-enforcing** (US-11, weight tuning v1, 3A).  
  They will FAIL until the corresponding production code is aligned.
- Optional tests (`_pain-taxonomy.js`, `_tempo-validator.js`, Netlify `handler`) are auto-skipped if those modules are not present in your repo.
