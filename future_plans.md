# Future Plans (T8 roadmap)

Work we're planning or have agreed to build later on **plexT8**. Ordered roughly by priority. Remove items once done and move them into `history.md`.

## Farming (breaker — on hold, stable)
- ~~Pest trap clearing~~ — **shipped** (`PestTraps`, r29 live build).
- [ ] **Pest trap REFILL** — add the 2nd toggle in `Pest Traps` settings that refills traps (bait). The trap CLEAR is one toggle; refill is the extension. Depends on:
  - [ ] **Per-tick inventory quantity scanner util** — shared utility to track item quantities in inventory each tick (user rejected Aether's chat-receipt-based exact-count, wants a reusable scanner; also drives the refill feature).
- [ ] If the roof/floor "break" ever re-appears: we have the rewarp left-click guard as the mitigation; re-instrument to find the real key source before touching again.
- [ ] If return-to-farm ever feels slow again: timestamp the log and fix from evidence (last measured gap between last trap release and `Cleared` was a 9s stall — fixed).

## V5 standalone cleanup
- [ ] Strip the last 4 files that still reference the original V5 backend (`backend.rdbt.top`) for a fully self-contained build:
  - `gui/Dashboard.js`
  - `utils/NetworkUtils.js`
  - `gui/categories/CategoryManager.js`
  - `modules/other/Failsafes.js`
  (docs links, ban-log POST, and an authed `/api/me` call)

## NoamRework / Noamm-adjacent
- [ ] **WebSocket packet-security audit** (pending) — the review of incoming packet handling in the NoamRework codebase for security issues.
- Note: the Noam **anti-RAT / noamm.org blocking stays untouched** — it works by design. `QuietNetwork` only silences the console noise.

## Options / notes
- Aether parity: our pest-trap CLEAR merged into the rewarp loop as originally intended (already done as a loop task / phase). If Aether later adds auto-triggered trap behaviour we care about, evaluate then.
- Keep the readme of the loader/upstream tracking: after each upstream sync, re-check `history.md` and bump metadata.