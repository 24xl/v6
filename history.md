# Release History (Fork)

Private changelog. 🍴 = fork-only, ↑ = upstream sync.

## 102-r2 (current)
- Fork baseline from V5 5.2.1-r29
- Self-hosted: 24xl/v6 (scripts), 24xl/v6-loader (jar)
- Removed: Auth, Discord login, IRC, Telemetry, CT registry, Self-update kill path
- Kept: GitHub releases only
- Jar naming: `V5-Loader-DEV-<ver>.jar` skips self-update

## 101-r1
- Initial fork setup
- FreeLLMAPI integration for OpenCode
- Pest system: PestKiller, WalkPestKiller, ManualPestKiller, VisitorMacro, PhilipMacro
- Commission Macro (Dwarven)
- Glacite Commission Macro (dev mode)
- Ore Macro route editor
- Mining Bot precision miner
- Pathfinder: Swift + AOTE + recovery
- GUI: categories, search, transitions, overlays
- Failsafes: ChatMention, PlayerGrief, Rotation, SlotChange, Teleport, Velocity

## 102-r2 (2026-11-08) — Backend removal
- Removed 4 remaining backend.rdbt.top calls:
  - Dashboard.js: Discord auth fetch (`/api/me`) + auth button → replaced with disabled stub
  - NetworkUtils.js: `returnDiscord()` PFP download from `/api/me` → no-op
  - CategoryManager.js: Documentation button opening `rdbt.top/docs/...` → no-op
  - Failsafes.js: `postBanLog()` POST to `/api/logs/bans` → no-op
- All features fully self-contained, no external backend dependency

## 102-r2 (2026-11-08) — Walk pest killer removed
- Deleted `modules/farming/rewarp/WalkPestKiller.js` (~788 lines)
- Removed "Walk" from RewarpSettings pest killer mode (now only Fly, Manual)
- Updated RewarpHandler: removed walkPestKiller imports, task selection, loadout swap
- Manual + Fly now share roof-climb logic — consolidation pending