# V5 Project — Start Here

**Read this file first to understand the project.**

## Project Location
- Path: `/home/plex/Desktop/v6`
- This is a ChatTriggers JavaScript module for Minecraft (V5 fork)

## First Things to Read

1. **AGENTS.md** — Project rules, development process, testing requirements
2. **V5_WORKFLOW.md** — Step-by-step workflow for any task
3. **future_plans.md** — Roadmap and pending features

## Skills Available

The project has custom skills in `.opencode/skills/`:
- **v5-dev-rules** (auto-invokes) — Enforces test-first development, evidence-based debugging
- **v5-quickref** (auto-invokes) — Quick reference for project structure, patterns, APIs
- **v5-debug** (manual) — Debugging patterns for common errors

Plus global skills:
- **force-testing** (auto-invokes) — Requires tests before code changes
- **lint-and-validate** (auto-invokes) — Syntax checks and quality control
- **code-guard** (auto-invokes) — Blocks destructive operations

## Model Selection

Use the Plex Router:
- **plex/auto** — For simple tasks (default)
- **plex/qwen3.8-max** — For complex reasoning tasks
- **plex/glm-5.3** — Good balance of intelligence and speed
- **plex/gemini-3.8-flash** — Fast with good tool use

## Critical Rules

1. **Test first, code second** — Write a test/simulation before implementing features
2. **Never guess** — Quote verbatim errors, trace to exact lines, read the code
3. **No destructive ops without confirmation** — code-guard blocks them
4. **Stay in project directory** — Don't modify files outside /home/plex/Desktop/v6
5. **Quote test output** — Don't claim "it works" without evidence

## Project Structure

```
V5/
├── modules/           # Feature code (mining/, farming/, combat/, etc.)
├── utils/             # Shared utilities (Packets.js, Pathfinding.js, etc.)
├── gui/               # UI components
├── failsafes/impl/    # Failsafe implementations
└── assets/            # Images, SVGs, bundled data
```

## Quick Reference

- **Packets**: `utils/Packets.js`
- **Pathfinding**: `utils/Pathfinding.js`
- **Rendering**: `utils/RenderUtils.js`
- **Failsafes**: `failsafes/impl/`
- **GUI examples**: Look at existing GUI files in `gui/`

## When Stuck

1. Read the relevant module code to understand the pattern
2. Check for similar existing features
3. Use v5-quickref to find API usage
4. Use v5-debug if you hit an error
5. Follow V5_WORKFLOW.md step-by-step

## Ready?

Now tell the agent what you want to do. The skills will auto-invoke to guide the process.
