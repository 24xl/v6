// Water Board puzzle. Ported from NoammAddons' WaterBoardSolver.kt.
// Works out which gates are closed, looks the pattern up in assets/waterSolutions.json and shows
// which lever to pull next, with timers for the rest.

import { puzzleSettings } from '../PuzzleSettings';
import { drawLine, drawText, drawTracer } from '../PuzzleRender';
import { loadAsset } from '../PuzzleData';
import { getDungeonTicks } from '../PuzzleClock';
import { chat } from '../../../Chat';
import { getBlockNameAt, getRealCoord } from '../../scan/DungeonScanUtils';

const GATES = [
    { name: 'PURPLE', offset: { x: 0, y: 56, z: 4 } },
    { name: 'ORANGE', offset: { x: 0, y: 56, z: 3 } },
    { name: 'BLUE', offset: { x: 0, y: 56, z: 2 } },
    { name: 'GREEN', offset: { x: 0, y: 56, z: 1 } },
    { name: 'RED', offset: { x: 0, y: 56, z: 0 } },
];

const LEVERS = {
    QUARTZ: { offset: { x: 5, y: 61, z: 5 } },
    GOLD: { offset: { x: 5, y: 61, z: 0 } },
    COAL: { offset: { x: 5, y: 61, z: -5 } },
    DIAMOND: { offset: { x: -5, y: 61, z: 5 } },
    EMERALD: { offset: { x: -5, y: 61, z: 0 } },
    CLAY: { offset: { x: -5, y: 61, z: -5 } },
    WATER: { offset: { x: 0, y: 60, z: -10 } },
};

const LEVER_BY_KEY = {
    diamond_block: 'DIAMOND',
    emerald_block: 'EMERALD',
    hardened_clay: 'CLAY',
    quartz_block: 'QUARTZ',
    gold_block: 'GOLD',
    coal_block: 'COAL',
    water: 'WATER',
};

// Kotlin prints doubles like 8.7 and 10.0; plain JS would print 10.
const kotlinDouble = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

const colorFor = (seconds) => (seconds < 2 ? '&c' : seconds < 6 ? '&e' : '&a');

// Every remaining click as { lever, time }, soonest first (the water lever wins exact ties, like Noam's +0.01).
export function remainingClicks(solution, clickCounts) {
    const clicks = [];
    for (const lever of Object.keys(solution)) {
        const times = solution[lever];
        for (let i = clickCounts[lever] || 0; i < times.length; i++) clicks.push({ lever, time: times[i], order: clicks.length });
    }
    return clicks.sort((a, b) => a.time + (a.lever === 'WATER' ? 0.01 : 0) - (b.time + (b.lever === 'WATER' ? 0.01 : 0)) || a.order - b.order);
}

export function timerText(timeSeconds, waterLeverTick, now) {
    const timeInTicks = Math.trunc(timeSeconds * 20);
    if (waterLeverTick === -1) {
        if (timeInTicks === 0) return '&a&lCLICK';
        return colorFor(timeSeconds) + kotlinDouble(timeSeconds) + 's';
    }

    const remainingTicks = waterLeverTick + timeInTicks - now;
    if (remainingTicks > 0) {
        const remaining = remainingTicks / 20.0;
        return colorFor(remaining) + remaining.toFixed(1) + 's';
    }
    return '&a&lCLICK';
}

const PATTERN_CHECKS = [
    { id: 0, offset: { x: -1, y: 77, z: 12 }, block: 'minecraft:terracotta' },
    { id: 1, offset: { x: 1, y: 78, z: 12 }, block: 'minecraft:emerald_block' },
    { id: 2, offset: { x: -1, y: 78, z: 12 }, block: 'minecraft:diamond_block' },
    { id: 3, offset: { x: -1, y: 78, z: 12 }, block: 'minecraft:quartz_block' },
];

const newCounts = () => ({ QUARTZ: 0, GOLD: 0, COAL: 0, DIAMOND: 0, EMERALD: 0, CLAY: 0, WATER: 0 });

export const WaterBoardSolver = {
    name: 'Water Board',
    enabled: () => puzzleSettings.water,

    solution: {},
    clickCounts: newCounts(),
    patternId: -1,
    waterLeverTick: -1,
    center: null,
    rotation: null,
    room: null,
    lastAttempt: 0,
    errorShown: false,

    onRoomEnter(room) {
        if (room.name !== 'Water Board') return;
        if (this.patternId !== -1) return;
        this.room = room;
        this.center = room.centerPos;
        this.rotation = null;
    },

    onRoomExit() {
        this.reset();
    },

    // Noam retries solve() every 500 ms until a pattern is found.
    onTick() {
        if (this.room === null || this.patternId !== -1) return;
        if (this.rotation === null && this.room.rotation !== null) this.rotation = 360 - this.room.rotation;
        if (this.rotation === null) return;
        if (Date.now() - this.lastAttempt < 500) return;
        this.lastAttempt = Date.now();
        this.solve();
    },

    isGateClosed(gate) {
        const pos = getRealCoord(gate.offset, this.center, this.rotation);
        return getBlockNameAt(pos.x, pos.y, pos.z).endsWith('_wool');
    },

    checkBlock(offset, expected) {
        const pos = getRealCoord(offset, this.center, this.rotation);
        return getBlockNameAt(pos.x, pos.y, pos.z) === expected;
    },

    leverPos(name) {
        return getRealCoord(LEVERS[name].offset, this.center, this.rotation);
    },

    solve() {
        let gates = '';
        GATES.forEach((gate, ordinal) => {
            if (this.isGateClosed(gate)) gates += String(ordinal);
        });
        if (gates.length !== 3) return;

        let pattern = -1;
        for (const check of PATTERN_CHECKS) {
            if (this.checkBlock(check.offset, check.block)) {
                pattern = check.id;
                break;
            }
        }
        if (pattern === -1) {
            if (!this.errorShown) chat('&cWater Solver: Unknown Pattern.');
            this.errorShown = true;
            return;
        }
        this.patternId = pattern;

        this.solution = {};
        const data = loadAsset('waterSolutions.json');
        const entry = data !== null && data[String(pattern)] !== undefined ? data[String(pattern)][gates] : undefined;
        if (entry === undefined) return;

        for (const key of Object.keys(entry)) {
            const lever = LEVER_BY_KEY[key];
            if (lever !== undefined) this.solution[lever] = entry[key];
        }
    },

    onRender() {
        if (this.patternId === -1 || Object.keys(this.solution).length === 0) return;

        const clicks = remainingClicks(this.solution, this.clickCounts);
        if (clicks.length === 0) return;

        const next = this.leverPos(clicks[0].lever);
        drawTracer(next.x + 0.5, next.y + 0.5, next.z + 0.5, puzzleSettings.currentClickColor, 2.5);

        if (clicks.length > 1 && clicks[1].lever !== clicks[0].lever) {
            const second = this.leverPos(clicks[1].lever);
            drawLine(next.x + 0.5, next.y + 0.5, next.z + 0.5, second.x + 0.5, second.y + 0.5, second.z + 0.5, puzzleSettings.nextColor, 1.5);
        }

        for (const lever of Object.keys(this.solution)) {
            const times = this.solution[lever];
            const done = this.clickCounts[lever] || 0;
            const pos = this.leverPos(lever);
            for (let i = 0; i < times.length - done; i++) {
                const text = timerText(times[done + i], this.waterLeverTick, getDungeonTicks());
                drawText(text, pos.x + 0.5, pos.y + (i + done) * 0.5 + 1.5, pos.z + 0.5, 1.35, true);
            }
        }
    },

    onInteract(pos) {
        if (this.patternId === -1 || Object.keys(this.solution).length === 0) return;
        if (this.center === null || this.rotation === null) return;

        const name = getBlockNameAt(pos.x, pos.y, pos.z);

        for (const lever of Object.keys(LEVERS)) {
            const leverPos = this.leverPos(lever);
            if (leverPos.x === pos.x && leverPos.y === pos.y && leverPos.z === pos.z) {
                if (lever === 'WATER' && this.waterLeverTick === -1) this.waterLeverTick = getDungeonTicks();
                this.clickCounts[lever]++;
                break;
            }
        }

        if (name === 'minecraft:chest' || name === 'minecraft:trapped_chest') {
            if (GATES.some((gate) => this.isGateClosed(gate))) return;
            this.reset();
        }
    },

    reset() {
        this.clickCounts = newCounts();
        this.patternId = -1;
        this.solution = {};
        this.waterLeverTick = -1;
        this.center = null;
        this.rotation = null;
        this.room = null;
        this.errorShown = false;
    },
};
