---
name: v5-debug
description: V5-specific debugging patterns and common error fixes. Helps the agent diagnose and fix ChatTriggers/V5 errors quickly.
use when: Debugging errors or issues in V5
do not use when: Writing new features (use v5-dev-rules instead)
opencode:
  autoinvoke: false
---

# V5 Debugging Patterns

**This skill provides debugging patterns for common V5/ChatTriggers errors.**

## Common Error Types and How to Fix Them

### Error: "Cannot read property 'X' of undefined"

**Likely causes:**
1. Object not initialized before use
2. Async code running before data is loaded
3. Packet handler firing before expected data arrives

**Debug steps:**
1. Quote the exact error line and file
2. Read the function where the error occurs
3. Check if the object is defined before accessing the property
4. Add null checks: `if (obj && obj.property) { ... }`
5. Check if the code is running in the correct context (ChatTriggers vs Node)

**Example fix:**
```javascript
// Before (error)
const value = obj.property

// After (fixed)
const value = obj?.property ?? defaultValue
```

### Error: "Packet not found" or "Packet constructor error"

**Likely causes:**
1. Wrong packet name from `utils/Packets.js`
2. Packet not registered in ChatTriggers
3. Packet signature mismatch

**Debug steps:**
1. Read `utils/Packets.js` to find the correct packet name
2. Check the packet constructor signature (number of arguments, types)
3. Verify the packet is being handled in the correct event (packetReceived vs packetSent)
4. Check if the packet is for the correct Minecraft version (26.3)

**Example:**
```javascript
// Check utils/Packets.js for the correct packet
import { C2SClickSlotPacket } from "../utils/Packets.js"

// Verify the constructor signature
const packet = new C2SClickSlotPacket(windowId, slotId, button, mode, stackIds)
```

### Error: "ChatTriggers API not available"

**Likely causes:**
1. Code running outside ChatTriggers context
2. Missing import from typings
3. Using wrong API function name

**Debug steps:**
1. Check if the code is in a module file (modules/), not a utility file
2. Verify the API function exists in `typings.d.ts`
3. Check if the module is loaded by ChatTriggers (run `/ct load` in-game)
4. Use the correct import pattern for the API

**Example:**
```javascript
// Correct ChatTriggers API usage
ChatLib.chat("message")
Player.getX()
World.getBlockAt(x, y, z)

// Not:
chat("message")  // Wrong
getPlayerX()     // Wrong
```

### Error: GUI not rendering or not clickable

**Likely causes:**
1. GUI component not added to the correct container
2. Component's visible property is false
3. Component is behind another GUI element
4. GUI not registered in the module's init function

**Debug steps:**
1. Check if the GUI component is added to the container: `container.add(component)`
2. Verify `component.visible = true`
3. Check the component's z-index/layer
4. Verify the GUI is registered: `register("guiRender", renderGUI)`
5. Check if the module is loaded: `/ct load`

**Example:**
```javascript
// In module init
export function load() {
  register("guiRender", (event) => {
    myComponent.draw()
  })
  register("guiMouseClick", (event) => {
    myComponent.click(event)
  })
}
```

### Error: Failsafe not triggering

**Likely causes:**
1. Failsafe condition not met
2. Failsafe not registered in FailsafeManager
3. Failsafe priority too low
4. Another failsafe triggered first

**Debug steps:**
1. Check the failsafe's condition logic
2. Verify the failsafe is registered: `FailsafeManager.register(failsafe)`
3. Check the failsafe priority
4. Add debug logging to the failsafe's check function
5. Verify the module is loaded

**Example:**
```javascript
export class MyFailsafe extends Failsafe {
  check() {
    // Add debug logging
    console.log("Checking failsafe condition:", this.condition)

    if (this.condition) {
      console.log("Triggering failsafe")
      this.trigger()
    }
  }
}
```

### Error: Module not loading or "/ct load" fails

**Likely causes:**
1. Syntax error in the module
2. Missing import
3. Circular dependency
4. File not in the correct location

**Debug steps:**
1. Run prettier to check for syntax errors
2. Check all imports are correct
3. Check for circular dependencies (A imports B, B imports A)
4. Verify the file is in the correct directory (modules/, utils/, etc.)
5. Check the ChatTriggers console with `/ct console`

**Example:**
```bash
# Run prettier
npx prettier --write modules/myfeature/

# Check console
/ct console
```

### Error: Performance issues (low FPS, lag)

**Likely causes:**
1. Heavy rendering logic in guiRender
2. Expensive calculations every tick
3. Not caching expensive operations
4. Too many event handlers

**Debug steps:**
1. Profile the code with performance logging
2. Cache expensive calculations
3. Reduce rendering frequency (don't render every tick if not needed)
4. Throttle event handlers
5. Check for infinite loops

**Example:**
```javascript
// Bad: recalculates every frame
const result = expensiveCalculation()

// Good: caches result
if (!cachedResult) {
  cachedResult = expensiveCalculation()
}
const result = cachedResult
```

## Debugging Workflow

1. **Quote the exact error** — Copy the verbatim error message and line number
2. **Read the code** — Open the file and read the function where the error occurs
3. **Check context** — Verify the code is running in the correct context (ChatTriggers, module, utility)
4. **Check imports** — Verify all imports are correct and files exist
5. **Add logging** — Add console.log statements to trace execution
6. **Test in isolation** — Create a minimal reproduction case
7. **Fix the root cause** — Don't just suppress the error; fix the underlying issue
8. **Verify the fix** — Re-run the test or reproduce the scenario to confirm the fix

## Common Debugging Commands

```javascript
// Log to ChatTriggers console
console.log("Debug message")

// Log to in-game chat
ChatLib.chat("Debug message")

// Log with context
console.log("Variable value:", variable)
console.log("Object:", JSON.stringify(object))

// Check if something is defined
console.log("Is defined:", variable !== undefined)
console.log("Type:", typeof variable)
```

## This Skill's Purpose

This skill provides debugging patterns. It does NOT replace reading the actual code or understanding the error. Always quote the exact error and read the relevant code before applying a fix.
