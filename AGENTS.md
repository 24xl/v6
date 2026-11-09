# Repository Guidelines

**CRITICAL: This file enforces Claude-style test-driven development with simulation. Read it before making ANY code changes.**

Note: DO NOT WRITE "// ponytail:" COMMENTS. IF YOU WRITE A COMMENT (which should be a rare once every few hundred lines occurance), IT SHOULD DESCRIBE WHY THE CODE IS THERE, NOT WHAT IT DOES. NO EXCEPTIONS. DO NOT EVER WRITE "PONYTAIL" IN THE CODEBASE.

## Rule 1 — Never Guess. Evidence-Based Debugging Only

When debugging, do not propose a fix until you have read the actual error and traced it to a specific cause.

**Required practice:**
- Quote the **verbatim** error/crash/log line, not a paraphrase
- Trace to the exact file, function, and line, and **read** it
- Where multiple causes could produce the same symptom, **isolate them with a test** before acting
- Separate what is **evidenced** from what is **inferred**, and label which is which
- If a test cannot decide it, say the diagnosis is unconfirmed
- Distinguish "this is broken" from "this is not broken" — check before reporting

**Corollary:** A fix with no test proving it is a guess. Add the test, even for one-line changes.

## Rule 2 — Test First, Code Second

Before implementing any feature:
1. Write a test or simulation that validates the expected behavior
2. Run the test and show it fails (red)
3. Implement the feature to make the test pass
4. Run the test again and show it passes (green)
5. Only then apply the change to the main codebase

**For Minecraft features:**
- Build a simulation/test harness first (e.g., terminal solver simulator)
- Verify the logic works in isolation before integrating into V5
- Quote simulation output (not just "it should work")

## Rule 3 — No Destructive Operations Without Confirmation

Block these operations without explicit user confirmation:
- `rm -rf`, file deletions, format operations
- Large-scale refactors without backup
- Changes to core loader files without verification

Use the `code-guard` skill to enforce this automatically.

## Rule 4 — Independent Verification

Never substitute reading code for testing behavior:
- **Re-run the test that would have caught the original failure** and show the output
- **Verify with a method independent of the one that gave you confidence**
- **Prove the fix fixes the cause, not just that the symptom moved**
- Prefer before/after measurements ("X failures, now 0") over claims

## Rule 5 — Stay in the Working Directory

Do not create, modify, move, or delete files outside the project folder unless explicitly asked. Read-only inspection outside is fine; writing is not without permission.

## Project Structure & Module Organization

V5 is a ChatTriggers JavaScript module. It runs on the [V5 ChatTriggers engine](https://github.com/V5-Client/V5Loader).
[`loader.js`](loader.js) boots core services, GUI, failsafes, and [`modules/loader.js`](modules/loader.js).
Feature code exists in the matching `modules/` category. (`mining/`, `farming/`, `combat/`, `foraging/`, `skills/`, `visuals/`, or `other/`)
Shared code belongs in `utils/`;
UI code lives in `gui/`;
failsafe implementations live in `failsafes/impl/`.
Keep images, SVGs, and bundled data in `assets/`.

Refer to `typings.d.ts` for the available runtime APIs. This is an extremely large file so do not attempt to read it all at once. Use searching methods to determin what you want.

## Build, Test, and Development Process

**This project has NO automated test runner.** However, you MUST still follow test-driven development:

1. **Write a test/simulation first** for the behavior you want to implement
2. **Run the simulation** and verify the expected output
3. **Implement the feature** based on the simulation
4. **Run prettier formatting** before completion
5. **The user will provide feedback on the results**

**Skills to use:**
- `force-testing` — Enforces test-first development (auto-invokes)
- `jest-skill` — For writing unit tests if you create a Jest setup
- `lint-and-validate` — Automatic quality control, syntax checks
- `code-guard` — Blocks destructive operations, requires reasoning
- `simplify` — Refactoring after tests pass

**Do NOT:**
- Implement features without testing them first
- Guess at fixes without reading the actual error
- Modify code without understanding the full context
- Skip prettier formatting

## Simulation Requirements

For complex features (especially terminal solvers, pathfinding, inventory logic):

1. **Create an isolated simulation file** in a temporary location or test directory
2. **Mock the V5 runtime APIs** (ChatTriggers packet handling, inventory reading, etc.)
3. **Run the simulation** and verify the output matches expected behavior
4. **Only integrate into V5 after simulation passes**
5. **Quote the simulation output** when reporting success

Example: For terminal solvers, create a simulator that generates test cases, runs the solver logic, and validates the solution matches expected clicks.

## Documentation / Markdown files

Where the `.md` files live and how to treat them:

- `README.md`, `changelog.md`, `AGENTS.md` (repo root) — public repo docs, dev-side only.
- `modules/**/*.md` (e.g. `modules/farming/TODO.MD`) — dev notes, never client-facing.
- `history.md`, `future_plans.md` — **PRIVATE notes, T8-local only, gitignored**. Never commit,
  push, or reference them from any repo file. Update them during release work but leave them
  uncommitted on T8 disk.
- The released `V5-Mojmap.zip` must contain **ZERO `.md` files**. Always verify `md files inside: 0`
  (excluding any `*.md` recursively during the zip build) before uploading to the release.

## Reporting Requirements

When reporting work completed:
- State plainly when something is unverified or only locally tested
- Quote actual test/simulation output, not "it should work"
- Own mistakes directly and briefly
- Distinguish what is evidenced from what is inferred

## Placeholder Features

An unfinished feature is labelled with a leading `-` (e.g., `-Walk`). Remove the `-` only once the feature is actually implemented and fully tested by the user. No full test → leave the `-` on.
