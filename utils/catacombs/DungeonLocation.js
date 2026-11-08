// Shared "where am I in a dungeon" state for Catacombs features.
//
//   import { isInDungeon, getFloorNumber, isInBoss, getF7Phase, onBossEnter } from '../../utils/catacombs/DungeonLocation';
//
// Everything is read from the scoreboard and the player position, so it needs no room scanner.
// Boss-room bounds, the F7 phase heights and the P3 sections are the values NoammAddons uses.

const CHECK_EVERY_TICKS = 10;

const makeBox = (x1, y1, z1, x2, y2, z2) => ({
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
    minZ: Math.min(z1, z2),
    maxZ: Math.max(z1, z2),
});

// Same rule as Minecraft's AABB.contains: the minimum edge is inside, the maximum edge is not.
const boxContains = (box, x, y, z) => x >= box.minX && x < box.maxX && y >= box.minY && y < box.maxY && z >= box.minZ && z < box.maxZ;

// Index is floor number - 1.
const BOSS_BOXES = [
    makeBox(-14, 55, 49, -72, 146, -40),
    makeBox(-40, 99, -40, 24, 54, 59),
    makeBox(-40, 118, -40, 42, 64, 37),
    makeBox(-40, 112, -40, 50, 53, 47),
    makeBox(-40, 112, -8, 50, 53, 118),
    makeBox(-40, 51, -8, 22, 110, 134),
    makeBox(-8, 0, -8, 134, 254, 147),
];

const P3_BOXES = [makeBox(90, 158, 123, 111, 105, 32), makeBox(16, 158, 122, 111, 105, 143), makeBox(19, 158, 48, -3, 106, 142), makeBox(91, 158, 50, -3, 106, 30)];

const FLOOR_MARKER = 'The Catacombs (';

const state = {
    inDungeon: false,
    floor: null,
    floorNumber: null,
    inBoss: false,
    f7Phase: null,
    p3Section: null,
    startTime: null,
    bossEntryTime: null,
};

const listeners = { dungeonStart: [], dungeonLeave: [], bossEnter: [], phaseChange: [] };

let tickCount = 0;

function emit(name, payload) {
    for (const callback of listeners[name].slice()) {
        try {
            callback(payload);
        } catch (error) {
            console.error('[DungeonLocation] "' + name + '" listener threw: ' + error);
        }
    }
}

function subscribe(name, callback) {
    listeners[name].push(callback);
    return () => {
        const index = listeners[name].indexOf(callback);
        if (index !== -1) listeners[name].splice(index, 1);
    };
}

function readScoreboardLines() {
    return (Scoreboard.getLines() || []).map((line) => ChatLib.removeFormatting(String(line?.getName?.() ?? line)));
}

function findFloor() {
    for (const text of readScoreboardLines()) {
        if (!text.includes(FLOOR_MARKER) || text.includes('Queue')) continue;
        const start = text.indexOf(FLOOR_MARKER) + FLOOR_MARKER.length;
        const floor = text.substring(start, text.indexOf(')', start));
        const last = floor.charAt(floor.length - 1);
        return { floor, number: /^\d$/.test(last) ? parseInt(last, 10) : 0 };
    }
    return null;
}

function computePhase(y) {
    if (state.floorNumber !== 7 || !state.inBoss) return null;
    if (y > 210) return 1;
    if (y > 155) return 2;
    if (y > 100) return 3;
    if (y > 45) return 4;
    return 5;
}

function computeP3Section(x, y, z) {
    if (state.f7Phase !== 3) return null;
    for (let i = 0; i < P3_BOXES.length; i++) {
        if (boxContains(P3_BOXES[i], x, y, z)) return i + 1;
    }
    return null;
}

function reset() {
    const wasInDungeon = state.inDungeon;
    state.inDungeon = false;
    state.floor = null;
    state.floorNumber = null;
    state.inBoss = false;
    state.f7Phase = null;
    state.p3Section = null;
    state.startTime = null;
    state.bossEntryTime = null;
    tickCount = 0;
    if (wasInDungeon) emit('dungeonLeave', null);
}

function updatePosition() {
    const x = Player.getX();
    const y = Player.getY();
    const z = Player.getZ();

    const wasInBoss = state.inBoss;
    const bossBox = BOSS_BOXES[(state.floorNumber ?? 0) - 1];
    state.inBoss = bossBox !== undefined && boxContains(bossBox, x, y, z);

    if (state.inBoss && !wasInBoss && state.bossEntryTime === null) {
        state.bossEntryTime = Date.now();
        emit('bossEnter', { floorNumber: state.floorNumber });
    }

    const previousPhase = state.f7Phase;
    state.f7Phase = computePhase(y);
    state.p3Section = computeP3Section(x, y, z);
    if (state.f7Phase !== previousPhase) emit('phaseChange', { phase: state.f7Phase, previous: previousPhase });
}

register('tick', () => {
    try {
        if (state.inDungeon) {
            updatePosition();
            return;
        }

        tickCount++;
        if (tickCount % CHECK_EVERY_TICKS !== 0) return;

        const found = findFloor();
        if (!found) return;

        state.inDungeon = true;
        state.floor = found.floor;
        state.floorNumber = found.number;
        state.startTime = Date.now();
        emit('dungeonStart', { floor: found.floor, floorNumber: found.number });
    } catch (error) {
        console.error('[DungeonLocation] tick failed: ' + error);
    }
});

register('worldUnload', () => reset());

export const isInDungeon = () => state.inDungeon;
export const getFloor = () => state.floor;
export const getFloorNumber = () => state.floorNumber ?? 0;
export const isMasterMode = () => state.floor !== null && state.floor.startsWith('M');
export const isFloor = (number) => state.inDungeon && state.floorNumber === number;
export const isInBoss = () => state.inBoss;
export const getF7Phase = () => state.f7Phase;
export const getP3Section = () => state.p3Section;
export const getDungeonStartTime = () => state.startTime;
export const getBossEntryTime = () => state.bossEntryTime;
export const getTimeInDungeon = () => (state.startTime === null ? 0 : Date.now() - state.startTime);
export const getTimeInBoss = () => (state.bossEntryTime === null ? 0 : Date.now() - state.bossEntryTime);

export const onDungeonStart = (callback) => subscribe('dungeonStart', callback);
export const onDungeonLeave = (callback) => subscribe('dungeonLeave', callback);
export const onBossEnter = (callback) => subscribe('bossEnter', callback);
export const onPhaseChange = (callback) => subscribe('phaseChange', callback);
