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

- [ ] **Dungeon Map** — GUI component for dungeon map display
  - Needs: GUI rendering, map data structure, real-time updates
  - Placeholder: `-DungeonMap` until implemented and tested

- [ ] **HUD Customizations** — enhanced HUD elements (overlays, custom indicators)
  - Needs: GUI component, overlay rendering, user settings
  - Placeholder: `-HUDCustomizer` until implemented and tested

- [ ] **Walker** — movement/pathfinding improvements
  - Needs: pathfinding integration, obstacle avoidance, click-order logic
  - Placeholder: `-Walker` until implemented and tested

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

- [ ] **GUI Improvements** — general GUI polish and missing components
  - Need: unified GUI framework, better component reusability
  - Reference: Noam's GUI patterns for settings popups, sliders, toggles
  - Tasks:
    - Consolidate duplicate GUI code across modules
    - Create reusable component library (Slider, ToggleButton, MultiToggle, etc.)
    - Improve GUI performance and responsiveness
    - Add GUI editor for positions (for visual elements like Dungeon Map)

## Low Priority / Ideas

- [ ] **Route Walkers** — unify OreMacro route editor + TunnelsMiner + Commission paths
- [ ] **Pathfinder rendering** — spline/look-point rendering toggles work but verbose
- [ ] **Developer Mode modules** — several commented imports (TreeESP, LivingMetalNuker)

## GUI Components Needed

For future GUI work, reference these component patterns:
- **ToggleButton** — simple on/off toggle
- **Slider** — numeric range input with step support
- **MultiToggle** — single-select from multiple options
- **Popup** — modal dialog for settings
- **Show/Hide logic** — component.visible = true/false based on other settings

See Noam's GUI implementation for exact patterns.
 
