# V5 Development Workflow for OpenCode

**This guide tells OpenCode how to work on the V5 project effectively.**

## How to Approach Any Task

### Step 1: Understand the Context
1. Read the relevant module code in `modules/` (e.g., `modules/farming/`, `modules/mining/`)
2. Check for shared utilities in `utils/` that might help
3. Look at similar existing features to understand the pattern
4. Read `AGENTS.md` for the project rules

### Step 2: Plan the Implementation
1. Identify which files need to be modified
2. Check if GUI components are needed (look at `gui/` for patterns)
3. Check if packet handling is needed (look at `utils/Packets.js`)
4. Check if failsafes are needed (look at `failsafes/impl/`)

### Step 3: Write a Test or Simulation
1. Create a simulation file for the logic (especially for pathfinding, inventory, terminal solvers)
2. Mock the V5 runtime APIs (ChatTriggers packet handling, inventory reading)
3. Run the simulation and verify the output
4. Quote the simulation output

### Step 4: Implement the Feature
1. Write the code following the pattern from similar features
2. Use the force-testing skill to ensure tests pass
3. Use lint-and-validate to check for syntax errors
4. Run prettier formatting

### Step 5: Verify
1. Quote the test output showing it passes
2. If possible, verify with an independent method
3. State clearly if something is unverified

## Common Patterns

### Adding a New GUI Setting
1. Find the module's settings file (usually in `modules/<category>/<Module>Settings.js`)
2. Add the setting to the settings object
3. Add the GUI component in the module's GUI file
4. Use existing components: ToggleButton, Slider, MultiToggle
5. Example:
```javascript
// In settings
mySetting: new BooleanSetting(true)

// In GUI
new ToggleButton("My Setting", settings.mySetting)
```

### Adding a New Packet Handler
1. Check `utils/Packets.js` for the packet constructor
2. Register the handler in the module's init function
3. Example:
```javascript
register("packetReceived", (packet) => {
  if (packet instanceof MyPacket) {
    // handle packet
  }
})
```

### Adding a New Failsafe
1. Create the failsafe implementation in `failsafes/impl/`
2. Register it in the module's init function
3. Ensure it triggers the appropriate failsafe action

### Adding a New Command
1. Register the command in the module's init function
2. Parse arguments and call the appropriate function
3. Example:
```javascript
register("command", (args) => {
  if (args[0] === "enable") {
    // enable feature
  }
}).setName("mycommand")
```

## Common Errors and How to Fix Them

### "Cannot read property X of undefined"
- Read the exact line where the error occurs
- Check if the object is actually initialized
- Add null checks if necessary
- Quote the verbatim error and the line number

### "Packet not found"
- Check `utils/Packets.js` for the correct packet name
- Ensure the packet is registered correctly
- Check the packet constructor signature

### "ChatTriggers API not available"
- Ensure the code is running in the ChatTriggers context
- Check if the API is imported correctly from the typings
- Use the correct API function from the V5 runtime

### GUI not rendering
- Check if the GUI component is added to the correct container
- Verify the component's visible property is true
- Check if the GUI is registered in the module's init function

## When to Use Which Skill

- **force-testing** — ALWAYS use for code edits (auto-invokes)
- **lint-and-validate** — Use after any code edit to check syntax
- **code-guard** — Use for destructive operations or risky changes
- **simplify** — Use after tests pass to refactor messy code
- **jest-skill** — Use if you set up Jest for unit tests
- **v5-dev-rules** — ALWAYS use for V5 project (auto-invokes)

## Model Selection

For this project, prefer:
- `plex/qwen3.8-max` — Highest intelligence, best for complex reasoning
- `plex/glm-5.3` — Good balance of intelligence and speed
- `plex/gemini-3.8-flash` — Fast with good tool use

Avoid mid-tier models for complex tasks. Use auto for simple tasks.

## What NOT to Do

- Do NOT implement features without testing/simulation first
- Do NOT guess at fixes without reading the actual error
- Do NOT modify code without understanding the full context
- Do NOT skip prettier formatting
- Do NOT write "// ponytail:" comments
- Do NOT write comments that describe WHAT the code does (only WHY)
- Do NOT put feature code in utils/ (only shared utilities)
- Do NOT put UI code in modules/ (only in gui/)

## Verification Checklist

Before reporting a task as complete:
- [ ] Test/simulation output quoted
- [ ] Prettier formatting run
- [ ] No "// ponytail:" comments
- [ ] Code follows project structure (modules/, utils/, gui/, failsafes/)
- [ ] Destructive operations confirmed by user
- [ ] Unverified work stated as unverified
