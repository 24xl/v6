# V5 Fork Release History (24xl/v6)

Legend:
- 🍴 = **fork-only** — made by us, does **not** exist in upstream V5-Client/V5
- ↑ = upstream sync / carried over from V5-Client

The fork is built on upstream V5-Client and tracks `upstream/main`. Every release below after `5.2.1-r29` contains our own work on top of the synced upstream.

---

## Upstream line (carried into the fork — no fork work)

**`5.2.0-r1` → `5.2.1-r29`** — upstream V5-Client releases (1 commit each). The fork was cut from this line, so the tags live in our history but contain **0** 24xl commits.

---

## Fork releases (our work starts here)

### `5.2.2-r2` — Fork baseline + Farm type selector
- 🍴 **Farm type selector introduced** (all five W/S farm types under one selector)
- ↑ Synced upstream through 5.2.2 (Structure ESP overhaul, ghost preset, combat/mining fixes)

### `5.2.2-r3` — 🍴 S-Shape farm types added to the Farm type selector
### `5.2.2-r4` — 🍴 Every farming macro now behind the Farm type selector
### `5.2.2-r5` — 🍴 Rewarp Style moved under the Farm type selector
### `5.2.2-r6` — 🍴 Each farm type gets its own settings key
### `5.2.2-r7` — 🍴 Empty Pest macro settings section created
### `5.2.2-r8` — 🍴 Pest settings moved into the Pest macro section
### `5.2.2-r9` — 🍴 **Sunset Pests**: sets garden time around plot teleports (Day before, Night on return)
### `5.2.2-r10` — 🍴 Sunset Pests toggle moved into the Pest macro section
### `5.2.2-r11` — 🍴 Sunset Pests slot fix (11/13) + unblock the night handback
### `5.2.2-r12` — 🍴 **Roof Etherwarp**: climb to the roof with AOTV instead of `tptoplot`
### `5.2.2-r13` — 🍴 `/v5 testroof` actually climbs
### `5.2.2-r14` — 🍴 Roof climb goals no longer start below the player
### `5.2.2-r15` — 🍴 Roof climb as aim + AOTV, no pathfinding
### `5.2.2-r16` — 🍴 Configurable Roof Etherwarp (toggle + pitch slider), debug commands dropped
### `5.2.2-r17` — 🍴 Roof path no longer re-runs; roof detection dropped
### `5.2.2-r18` — 🍴 Roof AOTV replicates Aether's aim-then-fire order
### `5.2.2-r19` — 🍴 Roof AOTV gated on the camera actually arriving
### `5.2.2-r20` — AutoExperiments: stop the infinite XP-bottle retry after a Bazaar reject (🍴 added, **reverted in r29**)
### `5.2.2-r21` — AutoExperiments: read the whole chat line (🍴 added, **reverted in r29**)
### `5.2.2-r22` — AutoExperiments: "Not enough coins!" message (🍴 added, **reverted in r29**)
### `5.2.2-r23` — 🍴 Roof: aim → sneak → cast order
### `5.2.2-r24` — 🍴 Roof left on the block check, not the clock
### `5.2.2-r25` — 🍴 Renew the attack key after a GUI; stop the roof being skipped
### `5.2.2-r26` — 🍴 `/v5 bbp` block-break-particle hide feature
### `5.2.2-r27` — 🍴 bbp rebuilt safely (then **reverted** same release)
### `5.2.2-r28` — 🍴 bbp `chat` import fix
### `5.2.2-r29` — bbp feature **fully reverted** (user decision — abandoned in favour of a resource-pack route)

---

## r29 live build (current release asset, head `269bd64`)

After the `5.2.2-r29` tag we shipped **42 more commits into the same release asset** (no new tag). Everything below is what is live right now:

### Pest traps (🍴 — our feature, not in upstream)
- **`PestTraps` module**: clears whatever traps are **full** (from the tab), one per pest-kill cycle
- Name-based stand matching (`trap #1`–`#3`, type-agnostic)
- Re-scan after each release (skips cleared); 8s gather only while targets remain → **no stall after the last trap**
- Walk **onto the target stand's block** before opening (works with tightly-clustered traps)
- **Held-vacuum release kill**: right-click opens while vacuum equipped; after release it aims at the **released pests** (never the trap hitbox) and holds right-click so no GUI re-opens
- Green hitbox highlight on the stands while clearing
- **Settings**: `Pest Trap Settings` popup (Enable + Trap Plot), relocated into the **Pest macro** section
- Settings read **live from the components** (persisted toggles skip callbacks — same pitfall Roof Etherwarp had)

### Farming loop (🍴)
- **Rewarp left-click guard**: never hold a break during rewarping (roof / traps / return) — nothing breaks unless it's hoe-farming
- **SunsetPests stranded-menu fix**: any time-menu failure closes the GUI before returning — farming can't stand still with the menu open
- GUI-rehold break (add then revert) — removed after it broke direction remembering

### Farming loop (🍴)
- **Pest trap first-try open**: 350ms settle after aim-lock before the first open click, 3 attempts at 500ms inside a 4.5s window, plus quiet open-failure console diagnostics (stripped once proven) - a full trap should open on the first stand visit.
- **Gated break re-click after GUI close**: after loadout / islandtime / NPC-sell GUIs close (and on any rewarper hand-back to farming), re-assert leftclick for 1s - but only at the about-to-farm point and only while a farming tool is held, so it never breaks the roof (pests) or the ground (trap clearing).
- **GUI-close lane shield**: while a GUI is open the movement tracker freezes, so standing still in it read as a row-end and the macro advanced lanes mid-row and walked without breaking. A GUI close now re-baselines position and shields the lane logic for 15 ticks, so farming resumes the same row and keeps breaking crops.

### Console / misc (🍴)
- **QuietNetwork**: silently swallows `Connect*` / connection-timeout stack traces from background threads (Noam/anti-RAT data downloads) — the blocker logic is untouched, it just stops printing. Loaded last in `loader.js`, IIFE-scoped (a top-level `var Thread` crashed Rhino load once).

### AutoExperiments
- **Upstream base + our coins system**: base is now upstream `main` at `208cd70` (Action Delay default 250ms, slider 50–500, upstream's lore-based `cannot afford this!` renewal handling).
- 🍴 **Our "Not enough coins" system restored on top**: chat catch of the Bazaar rejection (`cannot afford this!` full-line via `getUnformattedText`) → `xpPurchaseBlocked` → clean stop with **"Not enough coins!"** instead of the silent infinite bottle retry; upstream's `'Not enough bits!'` renamed to `'Not enough coins!'`. Proved innocent: the earlier experiments bug was server-side, not our code.

---

## Our fork-only feature list (summary, current live build)

| Feature | Where | What it does (not in upstream) |
|---|---|---|
| Farm type selector | `modules/farming/FarmType.js` + macros | All farm macros behind one picker |
| Sunset Pests | `modules/farming/SunsetPests.js` (edited) | Sets Day before plot teleports, Night when farming resumes |
| Roof Etherwarp | `modules/farming/rewarp/PestKiller.js` | Replaces plot teleport with an AOTV climb to the roof |
| Pest trap clearing | `modules/farming/rewarp/PestTraps.js` | Empties full traps after pest killing; held-vacuum kill |
| Pest macro settings section | `modules/farming/PestMacro.js` | Settings relocated into a single "Pest macro" row |
| Rewarp left-click guard | `modules/farming/FarmingMacro.js` | No stray breaking during roof/traps/return |
| Sunset menu close-on-failure | `modules/farming/SunsetPests.js` | Time menu can't strand farming |
| QuietNetwork | `modules/other/QuietNetwork.js` | Silences Connect-timeout console spam |

## Loader-level fork work (24xl/v6-loader — outside this repo)
Removed for standalone operation: auth/Discord login, IRC (no-op shells), telemetry/error reporting, hard kill path, ChatTriggers registry/updater, Discord RPC avatar. `DEV-` jar prefix keeps self-update disabled.