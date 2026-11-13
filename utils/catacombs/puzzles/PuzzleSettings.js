// Live puzzle-solver settings. The Legit popup writes here and the solvers read from here.
// Defaults are NoammAddons' defaults. Values reset to these on every launch, like the other popups.
//
// Colours are plain { r, g, b, a } so nothing here depends on Minecraft.

export const rgba = (r, g, b, a = 255) => ({ r, g, b, a });

// java.awt.Color constants, as Noam's Kotlin code uses them.
const GREEN = rgba(0, 255, 0);
const RED = rgba(255, 0, 0);
const BLUE = rgba(0, 0, 255);
const YELLOW = rgba(255, 255, 0);
const CYAN = rgba(0, 255, 255);
const ORANGE = rgba(255, 200, 0);
const WHITE = rgba(255, 255, 255);

export const puzzleSettings = {
    blaze: false,
    blazeDoneMessage: true,
    blazeCount: 3,
    firstBlazeColor: GREEN,
    secondBlazeColor: YELLOW,
    thirdBlazeColor: RED,
    lineColor: WHITE,

    boulder: false,
    showAll: false,
    boxColor: rgba(BLUE.r, BLUE.g, BLUE.b, 100),
    clickColor: rgba(RED.r, RED.g, RED.b, 100),

    creeper: false,
    renderLines: true,
    phase: true,

    quiz: false,
    answerColor: rgba(CYAN.r, CYAN.g, CYAN.b, 128),
    quizBlockWrongClicks: true,

    tpmaze: false,
    correctTpPadColor: GREEN,
    wrongTpPadColor: RED,

    weirdos: false,
    removeChests: true,
    colorCorrect: GREEN,
    colorWrong: RED,

    ttt: false,
    preventMissClick: true,
    tttColor: GREEN,
    prediction: false,
    predictionColor: ORANGE,

    water: false,
    currentClickColor: GREEN,
    nextColor: YELLOW,

    icefill: false,
    icefillColor: GREEN,

    icepath: false,
    icePathFirstColor: GREEN,
    icePathColor: RED,
};

export const lividSettings = {
    enabled: false,
    showHp: true,
    tracer: true,
    invulnerabilityTimer: false,
    iceSprayTitle: true,
    // Noam's favoriteColor.
    highlightColor: rgba(0, 134, 255),
    tracerColor: rgba(0, 134, 255),
};
