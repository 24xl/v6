import { emit } from './DungeonEvents';

// Min/max corners copied from NoammAddons' LocationUtils.bossRoomBounds, indexed by floor - 1.
const BOSS_ROOM_BOUNDS = [
    [-14, 55, 49, -72, 146, -40],
    [-40, 99, -40, 24, 54, 59],
    [-40, 118, -40, 42, 64, 37],
    [-40, 112, -40, 50, 53, 47],
    [-40, 112, -8, 50, 53, 118],
    [-40, 51, -8, 22, 110, 134],
    [-8, 0, -8, 134, 254, 147],
].map(([x1, y1, z1, x2, y2, z2]) => ({
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
    minZ: Math.min(z1, z2),
    maxZ: Math.max(z1, z2),
}));

const CHECK_INTERVAL_TICKS = 10;

export const location = {
    inDungeon: false,
    floor: null,
    floorNumber: null,
    inBoss: false,
    bossEntryTime: null,
    startTime: null,
    get isMasterMode() {
        return this.floor?.startsWith('M') === true;
    },
};

let tickCounter = 0;

const stripFormatting = (value) => ChatLib.removeFormatting(String(value ?? ''));

function readScoreboardLines() {
    const lines = Scoreboard.getLines() || [];
    const out = [];
    for (const line of lines) out.push(stripFormatting(line?.getName?.() ?? line));
    return out;
}

function detectFloor() {
    for (const text of readScoreboardLines()) {
        if (!text.includes('The Catacombs (') || text.includes('Queue')) continue;
        const start = text.indexOf('The Catacombs (') + 'The Catacombs ('.length;
        const floor = text.substring(start, text.indexOf(')', start));
        const last = floor.charAt(floor.length - 1);
        const number = /^\d$/.test(last) ? parseInt(last, 10) : 0;
        return { floor, number };
    }
    return null;
}

export function isInBossRoom(x, y, z) {
    const floor = location.floorNumber;
    if (!floor || floor < 1 || floor > 7) return false;
    const b = BOSS_ROOM_BOUNDS[floor - 1];
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

export function resetLocation() {
    location.inDungeon = false;
    location.floor = null;
    location.floorNumber = null;
    location.inBoss = false;
    location.bossEntryTime = null;
    location.startTime = null;
}

export const isInDungeon = () => location.inDungeon;
export const isInBoss = () => location.inBoss;
export const getFloor = () => location.floor;
export const getFloorNumber = () => location.floorNumber ?? 0;

register('tick', () => {
    try {
        if (!location.inDungeon) {
            if (++tickCounter % CHECK_INTERVAL_TICKS !== 0) return;
            const found = detectFloor();
            if (!found) return;
            location.inDungeon = true;
            location.floor = found.floor;
            location.floorNumber = found.number;
            location.startTime = Date.now();
            emit('dungeonStart', { floor: found.floor, floorNumber: found.number });
            return;
        }

        const wasInBoss = location.inBoss;
        location.inBoss = isInBossRoom(Player.getX(), Player.getY(), Player.getZ());
        if (location.inBoss && !wasInBoss && location.bossEntryTime === null) {
            location.bossEntryTime = Date.now();
            emit('bossEnter', { floorNumber: location.floorNumber });
        }
    } catch (error) {
        console.error('[Catacombs] location tick failed: ' + error + (error?.stack ? '\n' + error.stack : ''));
    }
});

register('worldUnload', () => {
    tickCounter = 0;
    resetLocation();
});
