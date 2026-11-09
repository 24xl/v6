---
name: v5-dev-rules
description: Enforces V5 development rules from AGENTS.md. Requires test-first development, isolated simulation for complex features, and evidence-based debugging. Points to useful skills and blocks destructive operations.
use when: Any code edit in the V5 project
do not use when: Pure documentation or configuration-only changes
opencode:
  autoinvoke: true
---

# V5 Development Rules - Enforced

**This skill enforces the rules in AGENTS.md for the V5 ChatTriggers project.**

## Required Reading

Before making ANY code change, the agent MUST read `/home/plex/Desktop/v6/AGENTS.md` and follow its rules.

## Rule 1 — Test First, Code Second

**DO NOT implement a feature without a test or simulation first.**

**For any feature implementation:**
1. Write a test or simulation that validates the expected behavior
2. Run the test and show it fails (red)
3. Implement the feature to make the test pass
4. Run the test again and show it passes (green)
5. Only then apply the change to the main codebase

**For Minecraft-specific features (terminal solvers, pathfinding, inventory logic):**
1. Create an isolated simulation file in a temporary location
2. Mock the V5 runtime APIs (ChatTriggers packet handling, inventory reading, etc.)
3. Run the simulation and verify the output matches expected behavior
4. Only integrate into V5 after simulation passes
5. Quote the simulation output when reporting success

## Rule 2 — Evidence-Based Debugging

**Never guess the root cause.**

**Required practice:**
- Quote the **verbatim** error/crash/log line, not a paraphrase
- Trace to the exact file, function, and line, and **read** it
- Where multiple causes could fit, **isolate them with a test** before acting
- Separate what is **evidenced** from what is **inferred**, and label which is which
- If a test cannot decide it, say the diagnosis is unconfirmed

**Corollary:** A fix with no test proving it is a guess. Add the test, even for one-line changes.

## Rule 3 — Independent Verification

**Never substitute reading code for testing behavior.**

When reporting a fix:
- **Re-run the test that would have caught the original failure** and show the output
- **Verify with a method independent of the one that gave you confidence**
- **Prove the fix fixes the cause, not just that the symptom moved**
- Prefer before/after measurements ("X failures, now 0") over claims

## Rule 4 — No Destructive Operations Without Confirmation

Block these operations without explicit user confirmation:
- `rm -rf`, file deletions, format operations
- Large-scale refactors without backup
- Changes to core loader files without verification

**Use the `code-guard` skill to enforce this automatically.**

## Skills to Use

The agent SHOULD invoke these skills when relevant:

- `force-testing` — Enforces test-first development (auto-invokes)
- `lint-and-validate` — Automatic quality control, syntax checks, CTJS validation
- `code-guard` — Blocks destructive operations, requires reasoning explanation
- `simplify` — Refactoring after tests pass
- `jest-skill` — For writing unit tests if you create a Jest setup

## Project Structure Reference

**Where code belongs:**
- Feature code: `modules/` (mining/, farming/, combat/, foraging/, skills/, visuals/, other/)
- Shared code: `utils/`
- UI code: `gui/`
- Failsafe implementations: `failsafes/impl/`
- Assets: `assets/`

**Do NOT:**
- Put feature code in utils/
- Put UI code in modules/
- Mix failsafe logic with feature code

## Placeholder Features

An unfinished feature is labelled with a leading `-` (e.g., `-Walk`). Remove the `-` only once the feature is actually implemented and fully tested by the user. No full test → leave the `-` on.

## Reporting Requirements

When reporting work completed:
- State plainly when something is unverified or only locally tested
- Quote actual test/simulation output, not "it should work"
- Own mistakes directly and briefly
- Distinguish what is evidenced from what is inferred

## Code Style

- DO NOT write "// ponytail:" comments
- Comments should describe WHY the code is there, not WHAT it does
- Comments should be rare (once every few hundred lines)
- Run prettier formatting before completion

## Enforcement

This skill auto-invokes on any code edit in the V5 project. When it detects a violation:
1. Stop the edit
2. Require the agent to follow the rule (write a test, read the error, etc.)
3. Do not proceed until the rule is followed

## Example Workflows

**Good:**
```
I'll write a simulation for the Numbers solver first, run it to verify the logic, then integrate it into V5.
```

**Bad:**
```
I'll implement the Numbers solver directly in modules/catacombs/terminals/. (BLOCKED - no simulation)
```

**Good:**
```
The error is "Cannot read property 'slotId' of undefined" at line 45 in TerminalListener.js. I'll read that function, trace the cause, and write a test to verify the fix.
```

**Bad:**
```
I think the issue is with the slot ID handling. I'll fix it. (BLOCKED - guessing without reading the error)
```
