import { ModuleBase } from "../../utils/ModuleBase";
import { ToggleButton } from "../../gui/components/Toggle";
import { Slider } from "../../gui/components/Slider";
import { ColorPicker } from "../../gui/components/ColorPicker";
import { Separator } from "../../gui/components/Separator";
import { puzzleSettings } from "../../utils/catacombs/puzzles/PuzzleSettings";

// Puzzle Solvers: container shell. Each solver is its own popup here, and the
// toggles write to puzzleSettings which the individual solver modules read.
// This mirrors how Cheats.js hosts the "Auto Terminal" popup and writes to
// autoTerminalSettings.
//
// The solver logic modules (BlazeSolver, BoulderSolver, etc.) are imported
// below so they register their own tick/render hooks and listen to
// puzzleSettings.<key>.

class PuzzleSolvers extends ModuleBase {
  constructor() {
    super({
      name: "Puzzle Solvers",
      subcategory: "Catacombs",
      description: "Catacombs puzzle solvers.",
      tooltip: "Catacombs puzzle solvers.",
      showEnabledToggle: false,
    });

    const s = puzzleSettings;
    const popup = this.addPopup(
      "Puzzle Solvers",
      null,
      "Catacombs puzzle solvers.",
    );

    const addToggle = (title, key, desc, def = false) => {
      const c = new ToggleButton(
        title,
        0,
        0,
        undefined,
        undefined,
        (v) => (s[key] = !!v),
        def,
      );
      popup.addComponent(c, desc);
      return c;
    };

    const addSlider = (title, min, max, key, def, desc) => {
      const c = new Slider(
        title,
        min,
        max,
        0,
        0,
        undefined,
        undefined,
        def,
        (v) => (s[key] = Math.round(v)),
      );
      popup.addComponent(c, desc);
      return c;
    };

    const addColor = (title, key, desc) => {
      const c = new ColorPicker(
        title,
        0,
        0,
        s[key],
        (color) => (s[key] = color),
      );
      popup.addComponent(c, desc);
      return c;
    };

    // ---- Blaze ----
    popup.addComponent(new Separator("Blaze", true));
    addToggle("Enabled", "blaze", "Blaze puzzle solver.");
    addToggle(
      "Blaze Done Message",
      "blazeDoneMessage",
      "Sends a party message when you finish the Blaze puzzle.",
      true,
    );
    addSlider(
      "Blazes to Highlight",
      1,
      10,
      "blazeCount",
      3,
      "How many blazes to highlight.",
    );
    addColor("First Blaze", "firstBlazeColor", "Color of the first blaze.");
    addColor("Second Blaze", "secondBlazeColor", "Color of the second blaze.");
    addColor(
      "Other Blazes",
      "thirdBlazeColor",
      "Color of all other highlighted blazes.",
    );
    addColor("Line Color", "lineColor", "Color of the connecting lines.");

    // ---- Boulder ----
    popup.addComponent(new Separator("Boulder", true));
    addToggle("Enabled", "boulder", "Boulder puzzle solver.");
    addToggle(
      "Show All Moves",
      "showAll",
      "Show all boulder moves instead of just the first.",
      false,
    );
    addColor(
      "Boulder Box Color",
      "boxColor",
      "Color of the boulder box highlight.",
    );
    addColor("Click Color", "clickColor", "Color of the click target.");

    // ---- Creeper Beam ----
    popup.addComponent(new Separator("Creeper Beam", true));
    addToggle("Enabled", "creeper", "Creeper Beam puzzle solver.");
    addToggle(
      "Render Lines",
      "renderLines",
      "Draw lines between beam pairs.",
      true,
    );
    addToggle(
      "Phase Through Walls",
      "phase",
      "Render beams through walls.",
      true,
    );

    // ---- Quiz ----
    popup.addComponent(new Separator("Quiz", true));
    addToggle("Enabled", "quiz", "Quiz puzzle solver.");
    addColor(
      "Answer Color",
      "answerColor",
      "Color of the correct answer highlight.",
    );
    addToggle("Quiz Timer", "quizTimer", "Show a quiz countdown timer.", true);
    addToggle(
      "Block Wrong Clicks",
      "quizBlockWrongClicks",
      "Prevents clicking a wrong quiz answer. Sneak to override.",
      true,
    );

    // ---- Teleport Maze ----
    popup.addComponent(new Separator("Teleport Maze", true));
    addToggle("Enabled", "tpmaze", "Teleport Maze puzzle solver.");
    addColor(
      "Correct Pad Color",
      "correctTpPadColor",
      "Color of the correct teleport pad.",
    );
    addColor(
      "Wrong Pad Color",
      "wrongTpPadColor",
      "Color of eliminated teleport pads.",
    );

    // ---- Three Weirdos ----
    popup.addComponent(new Separator("Three Weirdos", true));
    addToggle("Enabled", "weirdos", "Three Weirdos puzzle solver.");
    addToggle(
      "Hide Wrong Chests",
      "removeChests",
      "Removes wrong chests from the world.",
      true,
    );
    addColor(
      "Correct Chest Color",
      "colorCorrect",
      "Color of the correct chest highlight.",
    );
    addColor(
      "Wrong Chest Color",
      "colorWrong",
      "Color of wrong chest highlights.",
    );

    // ---- Tic Tac Toe ----
    popup.addComponent(new Separator("Tic Tac Toe", true));
    addToggle("Enabled", "ttt", "Tic Tac Toe puzzle solver.");
    addToggle(
      "Prevent Miss Click",
      "preventMissClick",
      "Prevents clicking a non-optimal TTT square.",
      true,
    );
    addColor("Highlight Color", "color", "Color of best move highlights.");
    addToggle(
      "Prediction",
      "prediction",
      "Predict and show the AI response.",
      false,
    );
    addColor(
      "Prediction Color",
      "predictionColor",
      "Color of predicted AI move highlights.",
    );

    // ---- Water Board ----
    popup.addComponent(new Separator("Water Board", true));
    addToggle("Enabled", "water", "Water Board puzzle solver.");
    addColor(
      "Click Color",
      "currentClickColor",
      "Color of the next click target.",
    );
    addColor(
      "Next Click Color",
      "nextColor",
      "Color of the second upcoming click.",
    );

    // ---- Ice Fill ----
    popup.addComponent(new Separator("Ice Fill", true));
    addToggle("Enabled", "icefill", "Ice Fill puzzle solver.");
    addColor("Line Color", "icefillColor", "Color of the ice fill path lines.");

    // ---- Ice Path ----
    popup.addComponent(new Separator("Ice Path", true));
    addToggle("Enabled", "icepath", "Ice Path puzzle solver.");
    addColor(
      "Next Segment Color",
      "icePathFirstColor",
      "Color of the next ice path segment.",
    );
    addColor(
      "Segments Color",
      "icePathColor",
      "Color of all other ice path segments.",
    );
  }
}

new PuzzleSolvers();
