// Live Puzzle Solvers settings. The Legit "Puzzle Solvers" popup writes here;
// individual solver modules will read from here when they are implemented.
//
// Values reset to these defaults on every launch, the same as AutoTerminalSettings.

import { Color } from "../../Constants";

const C = (r, g, b, a = 255) => new Color(r / 255, g / 255, b / 255, a / 255);

export const puzzleSettings = {
  // Blaze
  blaze: false,
  blazeDoneMessage: true,
  blazeCount: 3,
  firstBlazeColor: C(0, 255, 0),
  secondBlazeColor: C(255, 255, 0),
  thirdBlazeColor: C(255, 0, 0),
  lineColor: C(255, 255, 255),

  // Boulder
  boulder: false,
  showAll: false,
  boxColor: C(0, 0, 255, 100),
  clickColor: C(255, 0, 0, 100),

  // Creeper Beam
  creeper: false,
  renderLines: true,
  phase: true,

  // Quiz
  quiz: false,
  answerColor: C(0, 255, 255, 128),
  quizTimer: true,
  quizBlockWrongClicks: true,

  // Teleport Maze
  tpmaze: false,
  correctTpPadColor: C(0, 255, 0),
  wrongTpPadColor: C(255, 0, 0),

  // Three Weirdos
  weirdos: false,
  removeChests: true,
  colorCorrect: C(0, 255, 0),
  colorWrong: C(255, 0, 0),

  // TicTacToe
  ttt: false,
  preventMissClick: true,
  color: C(0, 255, 0),
  prediction: false,
  predictionColor: C(255, 165, 0),

  // Water Board
  water: false,
  currentClickColor: C(0, 255, 0),
  nextColor: C(255, 255, 0),

  // Ice Fill
  icefill: false,
  icefillColor: C(0, 255, 0),

  // Ice Path
  icepath: false,
  icePathFirstColor: C(0, 255, 0),
  icePathColor: C(255, 0, 0),
};

export const isPuzzleEnabled = (key) => !!puzzleSettings[key];
