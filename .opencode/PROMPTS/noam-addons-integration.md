# Enhanced Prompt: Noam Addons Integration

**Copy this prompt when asking the V5 bot to integrate Noam's code.**

---

## Task: Integrate Noam's Terminal Solver Code

I imported terminal solver code from Noam's addons (located in `/home/plex/Desktop/files (1)/`) into the V5 codebase at `/home/plex/Desktop/v6/`. When I ran the game and opened a terminal, nothing happened.

**Your task:**
1. Investigate the original Noam code
2. Investigate the integrated code in V5
3. Find out why it's not working
4. Fix the integration
5. Write tests/simulations to verify it works

## Investigation Steps

**Step 1: Read the original Noam code**
- Location: `/home/plex/Desktop/files (1)/`
- Find the terminal solver files (likely in a `terminals/` or `catacombs/` directory)
- Read the solver logic, packet handling, and GUI code
- Understand how it works in the original context

**Step 2: Read the integrated code in V5**
- Location: `/home/plex/Desktop/v6/`
- Find where the code was added (likely `modules/catacombs/terminals/` or similar)
- Check if the files are in the correct location
- Check if the imports are correct
- Check if the event handlers are registered

**Step 3: Compare and identify issues**
- Compare the original vs integrated code
- Look for:
  - Missing imports
  - Wrong file locations
  - Missing event registrations
  - Wrong packet handlers
  - GUI not registered
  - API mismatches (Noam's code might use different ChatTriggers APIs)
  - Missing dependencies (utils, packets, etc.)

**Step 4: Quote the specific issues**
- Do NOT guess
- Quote the exact lines that are wrong
- Quote the error messages (if any)
- Trace the execution path to find where it fails

## Implementation Steps

**Step 5: Write a simulation/test**
- Create an isolated simulation file for the terminal solver logic
- Mock the V5 runtime APIs (ChatTriggers packet handling, inventory reading)
- Test the solver logic with sample terminal data
- Run the simulation and quote the output

**Step 6: Fix the integration**
- Based on your investigation, fix the issues
- Follow the V5 project structure (modules/, utils/, gui/, failsafes/)
- Ensure all imports are correct
- Ensure event handlers are registered
- Ensure GUI components are added

**Step 7: Verify the fix**
- Run the simulation again and quote the output
- If possible, test in-game (user will run `/ct load` and test)
- Quote the test output showing it works

## Expected Output

When you report the fix, include:
1. **Investigation findings** — What was wrong? Quote the specific code lines.
2. **Simulation/test output** — Show the simulation running and passing.
3. **Files modified** — List all files you changed.
4. **How to test** — Instructions for in-game testing (e.g., "Open a Numbers terminal in Catacombs").

## Rules to Follow

- Read AGENTS.md before starting
- Follow the test-first development workflow
- Do NOT guess — quote verbatim errors and code
- Write a simulation before implementing fixes
- Quote test output, don't claim "it works"
- Run prettier formatting before completion
- No destructive operations without confirmation

## Skills to Use

- v5-dev-rules (auto-invokes) — Follows the rules
- v5-quickref (auto-invokes) — Look up patterns/APIs
- v5-debug (manual) — If you hit errors
- force-testing (auto-invokes) — Requires tests before code
- lint-and-validate (auto-invokes) — Syntax checks

## Model Selection

Use `plex/qwen3.8-max` for this task — it requires complex reasoning to compare codebases and identify integration issues.

---

**Start with:**
```
I need to integrate Noam's terminal solver code into V5. Read /home/plex/Desktop/v6/.opencode/START_HERE.md first, then follow the investigation and implementation steps in /home/plex/Desktop/v6/.opencode/PROMPTS/noam-addons-integration.md
```
