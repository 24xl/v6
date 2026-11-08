import { BP } from '../../Constants';

export const RoomType = Object.freeze({
    BLOOD: 'BLOOD',
    FAIRY: 'FAIRY',
    RARE: 'RARE',
    CHAMPION: 'CHAMPION',
    PUZZLE: 'PUZZLE',
    TRAP: 'TRAP',
    NORMAL: 'NORMAL',
    ENTRANCE: 'ENTRANCE',
});

export const DoorType = Object.freeze({
    BLOOD: 'BLOOD',
    WITHER: 'WITHER',
    NORMAL: 'NORMAL',
    ENTRANCE: 'ENTRANCE',
});

// Numeric on purpose: a room's state only moves "forward" in this order.
export const RoomState = Object.freeze({
    GREEN: 0,
    CLEARED: 1,
    DISCOVERED: 2,
    FAILED: 3,
    UNOPENED: 4,
    UNDISCOVERED: 5,
});

export const SecretType = Object.freeze({
    CHEST: 'CHEST',
    ITEM: 'ITEM',
    BAT: 'BAT',
    LEVER: 'LEVER',
    REDSTONE_KEY: 'REDSTONE_KEY',
    WITHER_ESSENCE: 'WITHER_ESSENCE',
});

export const GRID_START_X = -185;
export const GRID_START_Z = -185;
export const ROOM_SIZE = 32;
export const HALF_ROOM_SIZE = 15;

const ROOMS_JSON_MODULE = 'V5';
const ROOMS_JSON_PATH = 'utils/catacombs/rooms/rooms-modern.json';

const SECRET_KEYS = ['redstoneKey', 'wither', 'bat', 'item', 'chest', 'lever'];

const IGNORED_CORE_BLOCKS = new Set([
    'minecraft:chest',
    'minecraft:trapped_chest',
    'minecraft:piston_head',
    'minecraft:moving_piston',
    'minecraft:water',
    'minecraft:lava',
    'minecraft:fire',
    'minecraft:soul_fire',
]);

let BLOCK_REGISTRY = null;
try {
    BLOCK_REGISTRY = net.minecraft.core.registries.BuiltInRegistries.BLOCK;
} catch (error) {
    console.error('[Catacombs] block registry unavailable, using description ids: ' + error);
}
let registryWorks = BLOCK_REGISTRY !== null;

function normalizeRoom(raw) {
    const coords = raw.secretCoords || {};
    const secretCoords = {};
    for (const key of SECRET_KEYS) secretCoords[key] = Array.isArray(coords[key]) ? coords[key] : [];

    return {
        name: raw.name,
        type: raw.type,
        shape: raw.shape,
        cores: raw.cores || [],
        secretCoords,
        trappedChests: raw.trappedChests || 0,
        reviveStones: raw.reviveStones || 0,
        secrets: raw.secrets || 0,
        crypts: raw.crypts || 0,
        isUnknown() {
            return this.name === 'Unknown' && this.shape === 'Unknown';
        },
    };
}

export function createUnknownRoomData(type) {
    return normalizeRoom({ name: 'Unknown', type, shape: 'Unknown', cores: [] });
}

export const ROOM_SHAPE_TILE_COUNT = Object.freeze({
    Unknown: 0,
    L: 3,
    '1x1': 1,
    '1x2': 2,
    '1x3': 3,
    '1x4': 4,
    '2x2': 4,
});

const roomsByCore = new Map();
const roomsByName = new Map();

(function loadRooms() {
    const raw = FileLib.read(ROOMS_JSON_MODULE, ROOMS_JSON_PATH);
    if (!raw || !raw.trim()) {
        console.error('[Catacombs] could not read ' + ROOMS_JSON_MODULE + '/' + ROOMS_JSON_PATH + ' - room detection is disabled');
        return;
    }

    let list;
    try {
        list = JSON.parse(raw);
    } catch (error) {
        console.error('[Catacombs] rooms-modern.json is not valid JSON: ' + error);
        return;
    }

    for (const entry of list) {
        const room = normalizeRoom(entry);
        roomsByName.set(room.name, room);
        for (const core of room.cores) roomsByCore.set(core, room);
    }
})();

export const getRoomCount = () => roomsByName.size;
export const getRoomData = (hash) => roomsByCore.get(hash) ?? null;
export const getRoomDataByName = (name) => roomsByName.get(name) ?? null;
export const getAllRoomData = () => Array.from(roomsByName.values());

export function coord(value) {
    if (value == null) return { x: 0, y: 0, z: 0 };
    if (typeof value.x === 'number') return { x: value.x, y: typeof value.y === 'number' ? value.y : 0, z: value.z };
    return { x: Number(value.getX()), y: Number(value.getY()), z: Number(value.getZ()) };
}

// Same result as Java's String.hashCode(): the room cores in rooms-modern.json were built with it.
export function javaStringHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return hash;
}

const blockNameCache = {};
const coreTokenCache = {};

// hash * 31 stays below 2^53, so "| 0" wraps to int32 exactly like Java without needing Math.imul.
function describeBlock(block) {
    if (registryWorks) {
        try {
            const id = BLOCK_REGISTRY.getId(block);
            let name = blockNameCache[id];
            if (name === undefined) {
                name = String(BLOCK_REGISTRY.getKey(block).toString());
                blockNameCache[id] = name;
            }
            return { key: id, name };
        } catch (error) {
            registryWorks = false;
            console.error('[Catacombs] block registry lookup failed, falling back to description ids: ' + error);
        }
    }

    // "block.minecraft.stone" -> "minecraft:stone"
    const description = String(block.getDescriptionId());
    const name = description.replace(/^block\./, '').replace('.', ':');
    return { key: 'n:' + name, name };
}

function coreToken(block) {
    const { key, name } = describeBlock(block);
    let token = coreTokenCache[key];
    if (token === undefined) {
        token = javaStringHash(IGNORED_CORE_BLOCKS.has(name) || name.endsWith('_planks') ? 'minecraft:air' : name);
        coreTokenCache[key] = token;
    }
    return token;
}

export function getWorld() {
    return World.getWorld();
}

export function isChunkLoaded(x, z) {
    const world = getWorld();
    if (!world) return false;
    return !!world.hasChunkAt(new BP(Math.floor(x), 64, Math.floor(z)));
}

export function getStateAt(x, y, z) {
    const world = getWorld();
    if (!world) return null;
    return world.getBlockState(new BP(Math.floor(x), Math.floor(y), Math.floor(z)));
}

export function getBlockNameAt(x, y, z) {
    const state = getStateAt(x, y, z);
    return state ? describeBlock(state.getBlock()).name : 'minecraft:air';
}

export function getCore(x, z) {
    const world = getWorld();
    if (!world) return 1;

    let hash = 1;
    for (let y = 140; y >= 12; y--) {
        const block = world.getBlockState(new BP(x, y, z)).getBlock();
        hash = (hash * 31 + coreToken(block)) | 0;
    }
    return hash;
}

export function getHighestY(x, z) {
    const world = getWorld();
    if (!world) return 0;

    for (let y = 256; y >= 0; y--) {
        const state = world.getBlockState(new BP(x, y, z));
        if (state.isAir()) continue;
        if (describeBlock(state.getBlock()).name === 'minecraft:gold_block') continue;
        return y;
    }
    return 0;
}

export function getRoomGraf(pos) {
    const p = coord(pos);
    const gridX = Math.round((p.x - GRID_START_X) / ROOM_SIZE) * 2;
    const gridZ = Math.round((p.z - GRID_START_Z) / ROOM_SIZE) * 2;
    return [Math.min(10, Math.max(0, gridX)), Math.min(10, Math.max(0, gridZ))];
}

export function rotate(pos, degree) {
    const p = coord(pos);
    switch (((degree % 360) + 360) % 360) {
        case 90:
            return { x: p.z, y: p.y, z: -p.x };
        case 180:
            return { x: -p.x, y: p.y, z: -p.z };
        case 270:
            return { x: -p.z, y: p.y, z: p.x };
        default:
            return { x: p.x, y: p.y, z: p.z };
    }
}

export function getRealCoord(pos, roomCenter, rotation) {
    const c = coord(roomCenter);
    const r = rotate(pos, rotation);
    return { x: r.x + c.x, y: r.y, z: r.z + c.z };
}

export function getRelativeCoord(realPos, roomCorner, rotation) {
    const c = coord(roomCorner);
    const p = coord(realPos);
    return rotate({ x: p.x - c.x, y: p.y, z: p.z - c.z }, -rotation);
}
