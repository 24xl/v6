import { ModuleBase } from "../../utils/ModuleBase";
import "./PuzzleSolvers";
import "./puzzles/BlazeSolver";
import "./puzzles/ThreeWeirdosSolver";
import "./puzzles/CreeperBeamSolver";
import "./puzzles/QuizSolver";
import "./puzzles/BoulderSolver";

class Legit extends ModuleBase {
  constructor() {
    super({
      name: "Legit",
      subcategory: "Catacombs",
      description: "Catacombs legit features.",
      tooltip: "Catacombs legit features.",
      showEnabledToggle: false,
    });
  }
}

new Legit();
