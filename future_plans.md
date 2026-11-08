# Future Plans

Private roadmap notes. Never committed.

## High Priority

- [ ] **Pest Walker** — ✅ Walk mode removed (2026-11-08)
  - WalkPestKiller.js deleted — only Fly (PestKiller) and Manual remain
  - Remaining: Fly + Manual share roof-climb logic — consolidate later

- [ ] **Trap Refill** — pest trap clearing after pest killer finishes
  - RewarpSettings has `pestTraps` + `trapPlot` but no implementation
  - Need: detect full traps → teleport to plot → release → return to farm

- [ ] **Inventory Scanner** — read chest/inventory contents for auto-sell, auto-sort

- [ ] **Visitors Rework** — VisitorMacro uses skin matching (fragile), blacklist hardcoded

## Medium Priority

- [ ] **Slayers** — including BlazeBot 
  - Needs: Blaze, Tiered slayer, auto-gear swap

- [ ] **Security / RAT notes** — audit remaining backend calls ✅ DONE (2026-11-08)
  - 4 files hit `backend.rdbt.top` — all removed:
    - `Dashboard.js`: Discord auth fetch (`/api/me`) → disabled stub
    - `NetworkUtils.js`: `returnDiscord()` PFP download from `/api/me` → no-op
    - `CategoryManager.js`: Documentation button opening `rdbt.top/docs/...` → no-op
    - `Failsafes.js`: `postBanLog()` POST to `/api/logs/bans` → no-op
  - All features fully self-contained, no external backend dependency 

## Low Priority / Ideas

- [ ] **Route Walkers** — unify OreMacro route editor + TunnelsMiner + Commission paths 
- [ ] **Pathfinder rendering** — spline/look-point rendering toggles work but verbose
- [ ] **Developer Mode modules** — several commented imports (TreeESP, LivingMetalNuker)
 
