---
name: v5-quickref
description: Quick reference for V5 project structure, common patterns, and API usage. Helps the agent find code patterns without searching the entire codebase.
use when: Any code edit or feature implementation in V5
do not use when: Pure documentation or configuration-only changes
opencode:
  autoinvoke: true
---

# V5 Quick Reference

**This skill provides quick lookup for V5 project patterns.**

## Project Structure

```
V5/
├── loader.js                 # Entry point, boots core services
├── modules/
│   ├── mining/              # Mining features (OreMacro, MiningBot, PowderNuker)
│   ├── farming/             # Farming features (FarmHelper, VisitorMacro, PestKiller)
│   ├── combat/              # Combat features
│   ├── foraging/            # Foraging features
│   ├── skills/              # Skill-related features
│   ├── visuals/             # Visual effects and rendering
│   └── other/               # Other features
├── utils/
│   ├── Packets.js           # Packet constructors and handlers
│   ├── Pathfinding.js       # Pathfinding logic
│   ├── RenderUtils.js       # Rendering utilities
│   └── [other utilities]
├── gui/
│   └── [GUI components]
├── failsafes/
│   └── impl/                # Failsafe implementations
└── assets/                  # Images, SVGs, bundled data
```

## Common Imports

```javascript
// Packet handling
import { MyPacket } from "../utils/Packets.js"

// Rendering
import { RenderUtils } from "../utils/RenderUtils.js"

// Pathfinding
import { Pathfinder } from "../utils/Pathfinding.js"

// Failsafes
import { FailsafeManager } from "../failsafes/FailsafeManager.js"
```

## Common ChatTriggers APIs

```javascript
// Register event handlers
register("packetReceived", (packet) => { /* ... */ })
register("packetSent", (packet) => { /* ... */ })
register("guiRender", (event) => { /* ... */ })
register("worldRender", (event) => { /* ... */ })
register("command", (args) => { /* ... */ }).setName("mycommand")

// Chat messages
ChatLib.chat("message")
ChatLib.command("command")
ChatLib.say("message")

// Player/World
Player.getX(), Player.getY(), Player.getZ()
World.getBlockAt(x, y, z)
World.getDimension()

// Inventory
Player.getInventory()
Player.getContainer()

// Timing
Client.scheduleTask(delay, callback)
setTimeout(callback, delay)
setInterval(callback, interval)
```

## Common Patterns

### Module Initialization
```javascript
export function load() {
  // Register event handlers
  register("packetReceived", handlePacket)
  register("command", handleCommand).setName("mycommand")

  // Initialize GUI
  initGUI()

  // Initialize failsafes
  initFailsafes()
}
```

### Settings Pattern
```javascript
// In settings file
export const settings = {
  mySetting: new BooleanSetting(true),
  myNumber: new NumberSetting(100, 0, 1000, 10),
  myText: new TextSetting("default")
}

// In GUI
new ToggleButton("My Setting", settings.mySetting)
new Slider("My Number", settings.myNumber)
```

### Packet Handling
```javascript
register("packetReceived", (packet) => {
  if (packet instanceof C2SPacket) {
    // Handle client-to-server packet
  } else if (packet instanceof S2CPacket) {
    // Handle server-to-client packet
  }
})
```

### GUI Component
```javascript
export class MyComponent extends GuiComponent {
  constructor(x, y, width, height) {
    super(x, y, width, height)
  }

  draw() {
    // Rendering logic
  }

  click() {
    // Click handling
  }
}
```

### Failsafe Implementation
```javascript
export class MyFailsafe extends Failsafe {
  check() {
    // Check condition
    if (condition) {
      this.trigger()
    }
  }

  trigger() {
    // Failsafe action
    cancel(event)
  }
}
```

## File Locations for Common Tasks

- **Add a new setting**: `modules/<category>/<Module>Settings.js`
- **Add a GUI component**: `gui/<Component>.js` or module's GUI file
- **Add a packet handler**: Check `utils/Packets.js` for packet, register in module
- **Add a failsafe**: `failsafes/impl/<Failsafe>.js`
- **Add a command**: Register in module's init function
- **Add a utility**: `utils/<Utility>.js`

## Before Making Changes

1. Read the relevant module code to understand the pattern
2. Check for similar existing features
3. Read `AGENTS.md` for the rules
4. Write a test or simulation if the feature is complex
5. Use the v5-dev-rules skill to enforce the rules

## Quick Lookups

- **Packets**: `utils/Packets.js`
- **Pathfinding**: `utils/Pathfinding.js`
- **Rendering**: `utils/RenderUtils.js`
- **Failsafes**: `failsafes/impl/`
- **GUI examples**: Look at existing GUI files in `gui/`
- **Module examples**: Look at similar modules in `modules/`

## This Skill's Purpose

This skill is a quick reference. It does NOT replace reading the actual code. Always read the relevant files before making changes. This skill just helps you find the right files and patterns faster.
