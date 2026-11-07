import { Vec3d } from '../../Constants';

let roomsJson = [];
try {
    const content = FileLib.read('catacombs', 'rooms-modern.json');
    if (content && content.trim()) {
        roomsJson = JSON.parse(content);
    }
} catch (e) {
    console.error('[DungeonScanUtils] Failed to load rooms-modern.json:', e);
}

const START_X = -185;
const START_Z = -185;
const ROOM_SIZE = 32;
const HALF_ROOM_SIZE = 15;

const IGNORED_CORE_BLOCKS = new Set([
    'minecraft:chest', 'minecraft:trapped_chest',
    'minecraft:piston_head', 'minecraft:moving_piston',
    'minecraft:water', 'minecraft:lava',
    'minecraft:fire', 'minecraft:soul_fire',
]);

const roomsByCore = new Map();
const roomsByName = new Map();
const secretMap = new Map();
const coreTokenCache = new Map();

(function initRoomMaps() {
    for (const room of roomsJson) {
        for (const core of room.cores) {
            roomsByCore.set(core, room);
        }
        roomsByName.set(room.name, room);
        if (room.secretCoords) {
            secretMap.set(room.name, room.secretCoords);
        }
    }
})();

function getBlockTokenHash(block) {
    if (coreTokenCache.has(block)) return coreTokenCache.get(block);
    const name = block.getRegistryName?.()?.toString?.() || block.toString();
    const token = IGNORED_CORE_BLOCKS.has(name) || name.endsWith('_planks')
        ? 'minecraft:air'
        : name;
    const hash = String(token).hashCode();
    coreTokenCache.set(block, hash);
    return hash;
}

export function getCore(x, z) {
    const world = World.getWorld();
    if (!world) return 1;
    const pos = new net.minecraft.core.BlockPos.MutableBlockPos(x, 0, z);
    let hash = 1;

    for (let y = 140; y >= 12; y--) {
        const state = world.getBlockState(pos.setY(y));
        if (!state) continue;
        const block = state.getBlock();
        const tokenHash = coreTokenCache.get(block) ?? getBlockTokenHash(block);
        hash = hash * 31 + tokenHash;
    }
    return hash;
}

export function getHighestY(x, z) {
    const world = World.getWorld();
    if (!world) return 0;
    const pos = new net.minecraft.core.BlockPos.MutableBlockPos(x, 0, z);
    for (let y = 256; y >= 0; y--) {
        const state = world.getBlockState(pos.setY(y));
        if (!state || state.isAir() || state.getBlock() === net.minecraft.world.level.block.Blocks.GOLD_BLOCK) continue;
        return y;
    }
    return 0;
}

export function getRoomGraf(vec) {
    const roomIndexX = Math.round((vec.x - START_X) / ROOM_SIZE);
    const roomIndexZ = Math.round((vec.z - START_Z) / ROOM_SIZE);
    const gridX = roomIndexX * 2;
    const gridZ = roomIndexZ * 2;
    return [Math.max(0, Math.min(10, gridX)), Math.max(0, Math.min(10, gridZ))];
}

export function getRoomFromPos(vec, dungeonList) {
    const [gx, gz] = getRoomGraf(vec);
    const idx = gz * 11 + gx;
    const tile = dungeonList[idx];
    return tile?.uniqueRoom ?? null;
}

export function getRoomData(hash) {
    return roomsByCore.get(hash) ?? null;
}

export function getRoomDataByName(name) {
    return roomsByName.get(name) ?? null;
}

export function getSecretCoords(roomName) {
    return secretMap.get(roomName) ?? null;
}

const CLAY_OFFSETS = [
    [-HALF_ROOM_SIZE, -HALF_ROOM_SIZE],
    [HALF_ROOM_SIZE, -HALF_ROOM_SIZE],
    [HALF_ROOM_SIZE, HALF_ROOM_SIZE],
    [-HALF_ROOM_SIZE, HALF_ROOM_SIZE],
];

export function getRelativeCoord(realPos, roomCorner, rotation) {
    const cx = roomCorner.x;
    const cz = roomCorner.z;
    const centeredX = realPos.x - cx;
    const centeredZ = realPos.z - cz;

    const deg = ((rotation % 360) + 360) % 360;
    let rx = centeredX;
    let rz = centeredZ;

    if (deg === 90) { rx = centeredZ; rz = -centeredX; }
    else if (deg === 180) { rx = -centeredX; rz = -centeredZ; }
    else if (deg === 270) { rx = -centeredZ; rz = centeredX; }

    return [rx, rz];
}

export function getRealCoord(pos, roomCenter, rotation) {
    const cx = roomCenter.x;
    const cz = roomCenter.z;

    const deg = ((rotation % 360) + 360) % 360;
    let rx = pos.x;
    let rz = pos.z;

    if (deg === 90) { rx = pos.z; rz = -pos.x; }
    else if (deg === 180) { rx = -pos.x; rz = -pos.z; }
    else if (deg === 270) { rx = -pos.z; rz = pos.x; }

    return { x: rx + cx, y: pos.y, z: rz + cz };
}

export const RoomType = {
    NORMAL: 'NORMAL',
    PUZZLE: 'PUZZLE',
    TRAP: 'TRAP',
    YELLOW: 'YELLOW',
    BLOOD: 'BLOOD',
    FAIRY: 'FAIRY',
    ENTRANCE: 'ENTRANCE',
    UNKNOWN: 'UNKNOWN',
};

export const DoorType = {
    NORMAL: 'NORMAL',
    WITHER: 'WITHER',
    BLOOD: 'BLOOD',
    ENTRANCE: 'ENTRANCE',
};

export const RoomState = {
    UNKNOWN: 'UNKNOWN',
    DISCOVERED: 'DISCOVERED',
    UNDISCOVERED: 'UNDISCOVERED',
};

export function isFairyRoom(room) {
    return room?.data?.type === RoomType.FAIRY;
}