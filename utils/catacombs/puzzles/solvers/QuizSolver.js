// Quiz puzzle. Ported from NoammAddons' QuizSolver.kt.
// Reads Oruo's question from chat, looks the answer up in assets/quizSolutions.json and highlights its block.
// The on-screen countdown (a HUD element in Noam's mod) is not ported yet.

import { puzzleSettings } from '../PuzzleSettings';
import { drawBlock } from '../PuzzleRender';
import { loadAsset } from '../PuzzleData';
import { manhattan } from '../PuzzleUtils';
import { chat } from '../../../Chat';
import { getRealCoord } from '../../scan/DungeonScanUtils';

const OPTION_A = '\u24D0';
const OPTION_B = '\u24D1';
const OPTION_C = '\u24D2';

// "What SkyBlock year is it?" has no fixed answer. Same formula as Noam: one SkyBlock year = 446400 real seconds.
export const skyblockYear = (nowMs) => Math.floor((Math.floor(nowMs / 1000) - 1560276000) / 446400) + 1;

export function findAnswers(message, solutions, nowMs) {
    if (message.trim() === 'What SkyBlock year is it?') return ['Year ' + skyblockYear(nowMs)];
    if (solutions === null) return null;

    for (const key of Object.keys(solutions)) {
        if (message.includes(key)) return solutions[key];
    }
    return null;
}

export const QuizSolver = {
    name: 'Quiz',
    enabled: () => puzzleSettings.quiz,

    options: [
        { pos: { x: 0, y: 0, z: 0 }, correct: false },
        { pos: { x: 0, y: 0, z: 0 }, correct: false },
        { pos: { x: 0, y: 0, z: 0 }, correct: false },
    ],
    answers: null,
    correctAnswer: null,
    inQuiz: false,
    room: null,

    onRoomEnter(room) {
        if (room.name !== 'Quiz') return;
        if (this.inQuiz) return;
        this.room = room;
        this.trySetup();
    },

    onTick() {
        if (this.room !== null && !this.inQuiz) this.trySetup();
    },

    trySetup() {
        if (this.room === null || this.room.rotation === null) return;
        this.inQuiz = true;

        const center = this.room.centerPos;
        const rotation = 360 - this.room.rotation;
        this.options[0].pos = getRealCoord({ x: 5, y: 70, z: -9 }, center, rotation);
        this.options[1].pos = getRealCoord({ x: 0, y: 70, z: -6 }, center, rotation);
        this.options[2].pos = getRealCoord({ x: -5, y: 70, z: -9 }, center, rotation);
    },

    clearCorrect() {
        for (const option of this.options) option.correct = false;
    },

    onChat(message) {
        const trimmed = message.trim();

        if (message.includes('I am Oruo the Omniscient. I have lived many lives.')) {
            this.clearCorrect();
            this.answers = null;
            this.correctAnswer = null;
            return;
        }

        if (message.includes('2 questions left... Then you will have proven your worth to me!')) {
            this.clearCorrect();
            return;
        }

        if (message.includes('One more question!')) {
            this.clearCorrect();
            return;
        }

        if (message.startsWith('[STATUE] Oruo the Omniscient: ') && message.includes('answered the final question') && message.endsWith('correctly!')) {
            this.reset();
            return;
        }

        const first = trimmed.charAt(0);
        if (first === OPTION_A || first === OPTION_B || first === OPTION_C) {
            const matched = this.answers === null ? undefined : this.answers.find((answer) => message.endsWith(answer));
            if (matched !== undefined) {
                this.correctAnswer = first + ' ' + matched;
                const index = first === OPTION_A ? 0 : first === OPTION_B ? 1 : 2;
                this.options[index].correct = true;

                const text = this.correctAnswer;
                Client.scheduleTask(2, () => chat('&dQuizSolver &f> &aCorrect answer is: &b' + text));
            }
            return;
        }

        const found = findAnswers(message, loadAsset('quizSolutions.json'), Date.now());
        if (found !== null) this.answers = found;
    },

    onInteract(pos, cancel) {
        if (!this.inQuiz || !puzzleSettings.quizBlockWrongClicks) return;
        const player = Player.getPlayer();
        if (player !== null && player !== undefined && player.isCrouching()) return;

        const clicked = this.options.find((option) => manhattan(option.pos, pos) <= 1);
        if (clicked === undefined) return;
        if (!this.options.some((option) => option.correct)) return;
        if (!clicked.correct) cancel();
    },

    onRender() {
        if (!this.inQuiz || this.answers === null) return;
        for (const option of this.options) {
            if (option.correct) drawBlock(option.pos.x, option.pos.y, option.pos.z, puzzleSettings.answerColor, true);
        }
    },

    reset() {
        this.inQuiz = false;
        this.room = null;
        this.clearCorrect();
        this.answers = null;
        this.correctAnswer = null;
    },
};
