import { getCore, getHighestY, getRoomData, RoomType, DoorType, RoomState } from '../scan/DungeonScanUtils';

const START_X = -185;
const START_Z = -185;
const ROOM_SIZE = 32;
const HALF_ROOM_SIZE = 16;

class DungeonTile {
    constructor(x, z) {
        this.x = x;
        this.z = z;
    }
}

class UnknownTile extends DungeonTile {
    constructor(x, z) {
        super(x, z);
        this.type = 'UNKNOWN';
    }
}

class RoomTile extends DungeonTile {
    constructor(x, z, data, isSeparator = false) {
        super(x, z);
        this.type = 'ROOM';
        this.data = data;
        this.isSeparator = isSeparator;
        this.uniqueRoom = null;
        this.highestBlock = 0;
        this.rotation = null;
    }

    addToUnique(row, col, dungeonScanner) {
        const key = `${this.data.name}_${row}_${col}`;
        if (!dungeonScanner.uniqueRooms.has(key)) {
            const room = {
                data: this.data,
                components: [[row >> 1, col >> 1]],
                highestBlock: this.highestBlock,
                rotation: null,
                corner: null,
                trappedChestPositions: [],
                hasMimic: false,
            };
            dungeonScanner.uniqueRooms.set(key, room);
            this.uniqueRoom = room;
        } else {
            const existing = dungeonScanner.uniqueRooms.get(key);
            existing.components.push([row >> 1, col >> 1]);
            this.uniqueRoom = existing;
        }
    }
}

export class DoorTile extends DungeonTile {
    constructor(x, z, type) {
        super(x, z);
        this.type = 'DOOR';
        this.doorType = type;
        this.opened = false;
        this.roomTiles = [];
    }

    get uniqueRoom() {
        return this.roomTiles[0]?.uniqueRoom ?? null;
    }
}

class DungeonScanner {
    constructor() {
        this.dungeonList = new Array(121).fill(null).map((_, i) => new UnknownTile(i % 11, Math.floor(i / 11)));
        this.uniqueRooms = new Map();
        this.mimicRoom = null;
        this.witherDoors = 0;
        this.cryptCount = 0;
        this.secretCount = 0;
        this.hasScanned = false;
        this.lastScanTime = 0;
        this.currentRoom = null;
        this.lastKnownRoom = null;
    }

    reset() {
        this.dungeonList = new Array(121).fill(null).map((_, i) => new UnknownTile(i % 11, Math.floor(i / 11)));
        this.uniqueRooms.clear();
        this.mimicRoom = null;
        this.witherDoors = 0;
        this.cryptCount = 0;
        this.secretCount = 0;
        this.hasScanned = false;
        this.currentRoom = null;
        this.lastKnownRoom = null;
    }

    tick() {
        if (!this.isInDungeon() || this.isInBoss()) return;

        if (Date.now() - this.lastScanTime >= 250) {
            this.scan();
        }

        if (this.mimicKilled()) return;
        if (this.mimicRoom) return;
        if (this.getFloor() < 6) return;

        this.findMimicRoom();
    }

    scan() {
        let allChunksLoaded = true;

        if (!this.hasScanned) {
            for (let x = 0; x <= 10; x++) {
                for (let z = 0; z <= 10; z++) {
                    const wX = START_X + x * (ROOM_SIZE / 2);
                    const wZ = START_Z + z * (ROOM_SIZE / 2);

                    if (!this.isChunkLoaded(wX, wZ)) {
                        allChunksLoaded = false;
                        continue;
                    }

                    const idx = z * 11 + x;
                    const existing = this.dungeonList[idx];
                    if (existing instanceof RoomTile && !existing.data.isUnknown?.()) continue;

                    const roofHeight = getHighestY(wX, wZ);
                    if (roofHeight <= 0) continue;

                    const tile = this.scanTile(wX, wZ, z, x, roofHeight);
                    if (tile) {
                        this.dungeonList[idx] = tile;
                    }
                }
            }
        }

        this.lastScanTime = Date.now();
        for (const room of this.uniqueRooms.values()) {
            this.findRotation(room);
        }
        if (allChunksLoaded) this.hasScanned = true;
    }

    scanTile(x, z, row, col, roofHeight) {
        const rowEven = (row & 1) === 0;
        const colEven = (col & 1) === 0;

        if (rowEven && colEven) {
            const core = getCore(x, z);
            const roomData = getRoomData(core);
            if (!roomData) return null;

            const tile = new RoomTile(x, z, roomData);
            tile.highestBlock = roofHeight;
            tile.addToUnique(row, col, this);
            return tile;
        }

        if (!rowEven && !colEven) {
            const idx = (row - 1) * 11 + (col - 1);
            const existing = this.dungeonList[idx];
            if (existing instanceof RoomTile) {
                const tile = new RoomTile(x, z, existing.data, true);
                tile.addToUnique(row, col, this);
                return tile;
            }
            return null;
        }

        const doorHeight = roofHeight;
        if (doorHeight === 73 || doorHeight === 74 || doorHeight === 81 || doorHeight === 82) {
            const block = World.getBlockAt(x, 69, z);
            const blockName = block.getRegistryName?.()?.toString?.() || '';
            let type = DoorType.NORMAL;
            if (blockName.includes('monster_egg')) type = DoorType.ENTRANCE;
            else if (blockName.includes('wither_skeleton_skull') || blockName === 'minecraft:wither_skeleton_skull') type = DoorType.WITHER;
            else if (blockName.includes('redstone') || blockName.includes('blood')) type = DoorType.BLOOD;
            if (type === DoorType.WITHER) this.witherDoors++;
            return new DoorTile(x, z, type);
        }

        const sourceIdx = rowEven ? row * 11 + col - 1 : (row - 1) * 11 + col;
        const source = this.dungeonList[sourceIdx];
        if (source instanceof RoomTile) {
            if (source.data.type === RoomType.ENTRANCE) {
                return new DoorTile(x, z, DoorType.ENTRANCE);
            }
            const tile = new RoomTile(x, z, source.data, true);
            tile.addToUnique(row, col, this);
            return tile;
        }
        return null;
    }

    findRotation(room) {
        if (!room.highestBlock) return;
        if (room.data.type === RoomType.FAIRY) {
            room.rotation = 0;
            const comp = room.components[0];
            room.corner = { x: comp[0] * ROOM_SIZE + START_X - HALF_ROOM_SIZE + 0.5, z: comp[1] * ROOM_SIZE + START_Z - HALF_ROOM_SIZE + 0.5 };
            return;
        }

        for (const comp of room.components) {
            const x = comp[0] * ROOM_SIZE + START_X;
            const z = comp[1] * ROOM_SIZE + START_Z;
            for (let i = 0; i < 4; i++) {
                const dx = CLAY_OFFSETS[i][0];
                const dz = CLAY_OFFSETS[i][1];
                const nx = x + dx;
                const nz = z + dz;
                if (!this.isChunkLoaded(nx, nz)) return;
                const block = World.getBlockAt(nx, room.highestBlock, nz);
                if (block.getRegistryName?.() === 'minecraft:clay' && block.getMetadata?.() === 11) {
                    room.rotation = i * 90;
                    room.corner = { x: nx + 0.5, z: nz + 0.5 };
                    return;
                }
            }
        }
    }

    findMimicRoom() {
        const roomChests = new Map();
        const entities = World.getAllEntities?.() || [];
        for (const e of entities) {
            const blockState = e.getBlockState?.();
            if (!blockState?.is?.(net.minecraft.world.level.block.Blocks.TRAPPED_CHEST)) continue;
            const blockEntity = e.getBlockEntity?.();
            if (!blockEntity) continue;

            const pos = e.getBlockPos();
            const room = this.getRoomFromPos({ x: pos.x, y: pos.y, z: pos.z });
            if (!room) continue;

            const chests = roomChests.get(room) ?? [];
            chests.push({ x: pos.x, y: pos.y, z: pos.z });
            roomChests.set(room, chests);

            const expected = room.data.trappedChests ?? 0;
            if (chests.length > expected) {
                room.trappedChestPositions = chests;
                room.hasMimic = true;
                this.mimicRoom = room;
            }
        }
    }

    getRoomFromPos(vec) {
        const [gx, gz] = getRoomGraf(vec);
        const idx = gz * 11 + gx;
        const tile = this.dungeonList[idx];
        return tile?.uniqueRoom ?? null;
    }

    isInDungeon() {
        const lines = Scoreboard.getLines?.() || [];
        for (const line of lines) {
            const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
            if (text.includes('The Catacombs')) return true;
        }
        return false;
    }

    isInBoss() {
        const lines = Scoreboard.getLines?.() || [];
        for (const line of lines) {
            const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
            if (text.includes('[BOSS]') || text.includes('The Watcher')) return true;
        }
        return false;
    }

    getFloor() {
        const lines = Scoreboard.getLines?.() || [];
        for (const line of lines) {
            const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
            const m = text.match(/\(([FM])(\d)\)/i);
            if (m) return parseInt(m[2]);
        }
        return 0;
    }

    isChunkLoaded(x, z) {
        const world = World.getWorld();
        if (!world) return false;
        return world.isChunkLoaded(Math.floor(x / 16), Math.floor(z / 16));
    }

    mimicKilled() {
        return this.mimicRoom?.hasMimic === false;
    }
}

const CLAY_OFFSETS = [
    [-15, -15],
    [15, -15],
    [15, 15],
    [-15, 15],
];

const scanner = new DungeonScanner();
export default scanner;