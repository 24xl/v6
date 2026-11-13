import { ModuleBase } from "../../../utils/ModuleBase";
import { Vec3d } from "../../../utils/Constants";
import { puzzleSettings } from "../../../utils/catacombs/puzzles/PuzzleSettings";
import {
  onRoomEnter,
  onRoomExit,
  getRealCoord,
} from "../../../utils/catacombs/RoomScanner";
import { loadPuzzleData } from "../../../utils/catacombs/puzzles/PuzzleData";

// Quiz: highlight the correct answer among 3 options, block wrong clicks,
// and show a countdown timer. Ported from NoammAddons' QuizSolver.kt.
//
// Reads quizSolutions.json from assets/. The 3 answer positions are fixed
// relative to the room center; we map them to world space using the room's
// center + rotation (rotation 0 assumed for now).

const OPTION_OFFSETS = [
  [5, 70, -9],
  [0, 70, -6],
  [-5, 70, -9],
];

const SKYBLOCK_YEAR_EPOCH = 1560276000;
const SKYBLOCK_YEAR_SECONDS = 446400;

class QuizSolver extends ModuleBase {
  constructor() {
    super({
      name: "Quiz Solver",
      subcategory: "Catacombs",
      description:
        "Highlights the correct quiz answer and blocks wrong clicks.",
      tooltip: "Highlights the correct quiz answer and blocks wrong clicks.",
      showEnabledToggle: false,
    });

    this.options = OPTION_OFFSETS.map(() => ({ pos: null, isCorrect: false }));
    this.triviaAnswers = null;
    this.correctAnswer = null;
    this.inQuiz = false;
    this.questionsStarted = false;
    this.answerTime = 0;
    this.stage = 0;
    this.roomCenter = null;
    this.rotation = 0;

    this.on("tick", () => {
      if (this.enabled !== puzzleSettings.quiz)
        this.toggle(puzzleSettings.quiz);
    });
    this.on("chat", (event) => this.onChat(event));
    this.when(
      () => this.enabled,
      "postRenderWorld",
      () => this.onRenderWorld(),
    );

    onRoomEnter((name) => {
      if (name !== "Quiz") return;
      if (this.inQuiz) return;
      this.inQuiz = true;
      this.roomCenter = this.estimateRoomCenter();
      this.rotation = 0;
      for (let i = 0; i < 3; i++) {
        this.options[i].pos = getRealCoord(
          OPTION_OFFSETS[i][0],
          OPTION_OFFSETS[i][1],
          OPTION_OFFSETS[i][2],
          this.roomCenter.x,
          this.roomCenter.y,
          this.roomCenter.z,
          this.rotation,
        );
        this.options[i].isCorrect = false;
      }
    });
    onRoomExit((name) => {
      if (name !== "Quiz") return;
      this.reset();
    });
  }

  onEnable() {
    this.options = OPTION_OFFSETS.map(() => ({ pos: null, isCorrect: false }));
    this.triviaAnswers = null;
    this.correctAnswer = null;
    this.inQuiz = false;
    this.questionsStarted = false;
    this.answerTime = 0;
    this.stage = 0;
  }

  onDisable() {
    this.reset();
  }

  reset() {
    this.inQuiz = false;
    this.options.forEach((o) => (o.isCorrect = false));
    this.triviaAnswers = null;
    this.correctAnswer = null;
    this.answerTime = 0;
    this.stage = 0;
  }

  estimateRoomCenter() {
    const px = Math.floor(Player.getX());
    const pz = Math.floor(Player.getZ());
    return {
      x: Math.floor(px / 32) * 32 + 16,
      y: 70,
      z: Math.floor(pz / 32) * 32 + 16,
    };
  }

  getQuizSolutions() {
    return loadPuzzleData("quizSolutions.json");
  }

  onChat(event) {
    if (!this.enabled || !this.inQuiz) return;

    const raw =
      event?.message?.getUnformattedText?.() ??
      event?.message?.unformattedText ??
      "";
    const text = ChatLib.removeFormatting(String(raw));
    const trimmed = text.trim();

    if (text.includes("I am Oruo the Omniscient. I have lived many lives.")) {
      this.options.forEach((o) => (o.isCorrect = false));
      this.triviaAnswers = null;
      this.correctAnswer = null;
      this.questionsStarted = true;
      this.stage = 1;
      this.answerTime = Date.now() + 220 * 50;
      return;
    }

    if (
      text.includes(
        "2 questions left... Then you will have proven your worth to me!",
      )
    ) {
      this.stage = 2;
      this.answerTime = Date.now() + 100 * 50;
      this.options.forEach((o) => (o.isCorrect = false));
      return;
    }

    if (text.includes("One more question!")) {
      this.stage = 3;
      this.answerTime = Date.now() + 100 * 50;
      this.options.forEach((o) => (o.isCorrect = false));
      return;
    }

    if (
      text.startsWith("[STATUE] Oruo the Omniscient: ") &&
      text.includes("answered the final question") &&
      text.endsWith("correctly!")
    ) {
      this.questionsStarted = false;
      this.reset();
      return;
    }

    if (
      trimmed.startsWith("\u24d0") ||
      trimmed.startsWith("\u24d1") ||
      trimmed.startsWith("\u24d2")
    ) {
      const optionChar = trimmed[0];
      if (this.triviaAnswers) {
        const matched = this.triviaAnswers.find((a) => text.endsWith(a));
        if (matched) {
          this.correctAnswer = optionChar + " " + matched;
          switch (optionChar) {
            case "\u24d0":
              this.options[0].isCorrect = true;
              break;
            case "\u24d1":
              this.options[1].isCorrect = true;
              break;
            case "\u24d2":
              this.options[2].isCorrect = true;
              break;
          }
        }
      }
      return;
    }

    let newAnswers = null;
    if (trimmed === "What SkyBlock year is it?") {
      const year =
        Math.floor(
          (Date.now() / 1000 - SKYBLOCK_YEAR_EPOCH) / SKYBLOCK_YEAR_SECONDS,
        ) + 1;
      newAnswers = ["Year " + year];
    } else {
      const solutions = this.getQuizSolutions();
      if (solutions) {
        for (const [key, answers] of Object.entries(solutions)) {
          if (text.includes(key)) {
            newAnswers = answers;
            break;
          }
        }
      }
    }

    if (newAnswers !== null) this.triviaAnswers = newAnswers;
  }

  onRenderWorld() {
    if (!this.enabled || !this.inQuiz || this.triviaAnswers === null) return;

    const color = new RenderColor(
      puzzleSettings.answerColor.getRed(),
      puzzleSettings.answerColor.getGreen(),
      puzzleSettings.answerColor.getBlue(),
      puzzleSettings.answerColor.getAlpha(),
    );

    for (const option of this.options) {
      if (!option.isCorrect || !option.pos) continue;
      Render3D.drawFilledBox(
        new Vec3d(option.pos.x, option.pos.y, option.pos.z),
        color,
      );
    }
  }
}

new QuizSolver();
