import { BP } from '../../Constants';
import { emit } from '../DungeonEvents';
import { location } from '../DungeonLocation';
import {
    DoorType,
    GRID_START_X,
    GRID_START_Z,
    HALF_ROOM_SIZE,
    ROOM_SHAPE_TILE_COUNT,
    ROOM_SIZE,
    RoomState,
    RoomType,
    SecretType,
    coord,
    getBlockNameAt,
    getCore,
    getHighestY,
    getRealCoord,
    getRoomData,
    getRoomGraf,
    getWorld,
    isChunkLoaded,
} from '../scan/DungeonScanUtils';

const GRID_SIZE = 11;
const SCAN_INTERVAL_MS = 250;
const DOOR_Y = 69;

const CLAY_BLOCK_CORNERS = [
    [-HALF_ROOM_SIZE, -HALF_ROOM_SIZE],
    [HALF_ROOM_SIZE, -HALF_ROOM_SIZE],
    [HALF_ROOM_SIZE, HALF_ROOM_SIZE],
    [-HALF_ROOM_SIZE, HALF_ROOM_SIZE],
];

const DOOR_BLOCKS = {
    'minecraft:red_terracotta': DoorType.BLOOD,
    'minecraft:coal_block': DoorType.WITHER,
    'minecraft:infested_chiseled_stone_bricks': DoorType.ENTRANCE,
};

const SECRET_COORD_KEYS = [
    ['redstoneKey', SecretType.REDSTONE_KEY],
    ['wither', SecretType.WITHER_ESSENCE],
    ['bat', SecretType.BAT],
    ['item', SecretType.ITEM],
    ['chest', SecretType.CHEST],
    ['lever', SecretType.LEVER],
];

let scanner = null;

function gridPosOf(x, z) {
    const half = ROOM_SIZE >> 1;
    return [(z - GRID_START_Z) / half, (x - GRID_START_X) / half];
}

export class UnknownTile {
    constructor(x = 0, z = 0) {
        this.x = x;
        this.z = z;
        this.state = RoomState.UNDISCOVERED;
        this.kind = 'unknown';
    }

    getGridPos() {
        return gridPosOf(this.x, this.z);
    }
}

export class RoomTile {
    constructor(x, z, data) {
        this.x = x;
        this.z = z;
        this.data = data;
        this.uniqueRoom = null;
        this.isSeparator = false;
        this.kind = 'room';
        this.state = RoomState.UNDISCOVERED;
    }

    setState(next) {
        const previous = this.state;
        this.state = next;
        if (this.uniqueRoom?.mainRoom !== this) return;
        if (previous === next) return;
        if (this.data.name === 'Unknown') return;
        if (next === RoomState.GREEN) this.uniqueRoom.foundSecrets = this.uniqueRoom.data.secrets;
        emit('roomStateChange', { room: this.uniqueRoom, oldState: previous, newState: next });
    }

    getGridPos() {
        return gridPosOf(this.x, this.z);
    }

    addToUnique(row, column, roomName = this.data.name) {
        const existing = scanner.uniqueRooms.get(roomName);
        if (!existing) {
            const created = new UniqueRoom(column, row, this);
            scanner.uniqueRooms.set(this.data.name, created);
            this.uniqueRoom = created;
        } else {
            existing.addTile(column, row, this);
            this.uniqueRoom = existing;
        }
    }
}

export class DoorTile {
    constructor(x, z, type, grid) {
        this.x = x;
        this.z = z;
        this.type = type;
        this.grid = grid;
        this.state = RoomState.UNDISCOVERED;
        this.opened = false;
        this.kind = 'door';
        this.aabb = { minX: x - 1, minY: DOOR_Y, minZ: z - 1, maxX: x + 2, maxY: 73, maxZ: z + 2 };

        const [row, column] = this.getGridPos();
        const indices = [];
        if ((row & 1) === 0) {
            if (column - 1 >= 0) indices.push(row * GRID_SIZE + column - 1);
            if (column + 1 <= 10) indices.push(row * GRID_SIZE + column + 1);
        } else {
            if (row - 1 >= 0) indices.push((row - 1) * GRID_SIZE + column);
            if (row + 1 <= 10) indices.push((row + 1) * GRID_SIZE + column);
        }
        this.roomTileIndices = indices;
    }

    get roomTiles() {
        const tiles = [];
        for (const index of this.roomTileIndices) {
            const tile = this.grid[index];
            if (tile instanceof RoomTile) tiles.push(tile);
        }
        return tiles;
    }

    getGridPos() {
        return gridPosOf(this.x, this.z);
    }
}

function groupByKey(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    // Insertion index breaks ties so ordering never depends on the engine's sort stability.
    return Array.from(groups.entries())
        .map(([key, value], index) => ({ key, value, index }))
        .sort((a, b) => b.value.length - a.value.length || a.index - b.index);
}

export class UniqueRoom {
    constructor(column, row, roomTile) {
        this.topLeft = [column, row];
        this.center = [column, row];
        this.tiles = [roomTile];
        this.mainRoom = roomTile;
        this.data = roomTile.data;
        this.name = roomTile.data.name;
        this.centerPos = { x: roomTile.x, y: 0, z: roomTile.z };
        this.highestBlock = null;
        this.clayPos = null;
        this.rotation = null;
        this.hasMimic = false;
        this.trappedChestPositions = [];
        this.foundSecrets = 0;
        this.secretCoords = new Map();

        scanner.cryptCount += roomTile.data.crypts;
        scanner.secretCount += roomTile.data.secrets;
    }

    addTile(column, row, tile) {
        this.tiles = this.tiles.filter((t) => !(t.x === tile.x && t.z === tile.z));
        this.tiles.push(tile);

        if (column < this.topLeft[0] || (column === this.topLeft[0] && row < this.topLeft[1])) {
            this.topLeft = [column, row];
            this.mainRoom = tile;
        }

        if (this.tiles.length === 1) {
            this.center = [column, row];
            return;
        }

        const roomCells = [];
        for (const t of this.tiles) if (!t.isSeparator) roomCells.push(t.getGridPos());
        if (!roomCells.length) return;

        const xRooms = groupByKey(roomCells, (cell) => cell[1]);
        const zRooms = groupByKey(roomCells, (cell) => cell[0]);
        const sumKeys = (groups) => groups.reduce((sum, group) => sum + group.key, 0);

        if (zRooms.length === 1 || zRooms[0].value.length !== zRooms[1].value.length) {
            this.center = [Math.trunc(sumKeys(xRooms) / xRooms.length), zRooms[0].key];
        } else if (xRooms.length === 1 || xRooms[0].value.length !== xRooms[1].value.length) {
            this.center = [xRooms[0].key, Math.trunc(sumKeys(zRooms) / zRooms.length)];
        } else {
            this.center = [Math.trunc((xRooms[0].key + xRooms[1].key) / 2), Math.trunc((zRooms[0].key + zRooms[1].key) / 2)];
        }
    }

    findRotation() {
        if (this.rotation !== null || this.clayPos !== null) return;

        if (this.mainRoom.data.type === RoomType.FAIRY) {
            this.setRotationAndCorner(0, { x: this.mainRoom.x - 15, z: this.mainRoom.z - 15 });
            return;
        }

        const roomTiles = this.tiles.filter((t) => !t.isSeparator);
        if (roomTiles.length < (ROOM_SHAPE_TILE_COUNT[this.data.shape] ?? 0)) return;

        if (this.highestBlock === null) {
            const height = getHighestY(this.mainRoom.x, this.mainRoom.z);
            if (height <= 0) return;
            this.highestBlock = height;
        }
        const y = this.highestBlock;

        if (this.data.shape !== 'L') {
            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const t of roomTiles) {
                if (t.x < minX) minX = t.x;
                if (t.x > maxX) maxX = t.x;
                if (t.z < minZ) minZ = t.z;
                if (t.z > maxZ) maxZ = t.z;
            }

            const h = HALF_ROOM_SIZE;
            const cornersX = [minX - h, maxX + h, maxX + h, minX - h];
            const cornersZ = [minZ - h, minZ - h, maxZ + h, maxZ + h];

            for (let i = 0; i < 4; i++) {
                if (!isChunkLoaded(cornersX[i], cornersZ[i])) continue;
                if (getBlockNameAt(cornersX[i], y, cornersZ[i]) === 'minecraft:blue_terracotta') {
                    this.setRotationAndCorner(i, { x: cornersX[i], z: cornersZ[i] });
                    return;
                }
            }
            return;
        }

        for (const t of roomTiles) {
            for (let i = 0; i < CLAY_BLOCK_CORNERS.length; i++) {
                const x = t.x + CLAY_BLOCK_CORNERS[i][0];
                const z = t.z + CLAY_BLOCK_CORNERS[i][1];
                if (!isChunkLoaded(x, z)) return;
                if (getBlockNameAt(x, y, z) === 'minecraft:blue_terracotta') {
                    this.setRotationAndCorner(i, { x, z });
                    return;
                }
            }
        }
    }

    setRotationAndCorner(index, pos) {
        this.clayPos = { x: pos.x, y: 0, z: pos.z };
        this.rotation = index * 90;

        if (this.data.secrets > 0) {
            for (const [key, type] of SECRET_COORD_KEYS) {
                const list = this.data.secretCoords[key];
                if (!list.length) continue;
                const real = list.map((relative) => getRealCoord(relative, this.clayPos, 360 - this.rotation));
                this.secretCoords.set(type, (this.secretCoords.get(type) ?? []).concat(real));
            }
        }

        emit('rotationFound', { room: this, rotation: this.rotation, clayPos: this.clayPos });
    }
}

class DungeonScanner {
    constructor() {
        this.dungeonList = [];
        this.doorTiles = [];
        this.uniqueRooms = new Map();
        this.mimicRoom = null;
        this.mimicKilled = false;
        this.mimicDetectionEnabled = false;
        this.witherDoors = 0;
        this.cryptCount = 0;
        this.secretCount = 0;
        this.hasScanned = false;
        this.currentRoom = null;
        this.lastKnownRoom = null;
        this.lastScanTime = 0;
        this.mimicFailed = false;
        this.errorLogged = false;
        this.fillUnknown();
    }

    fillUnknown() {
        this.dungeonList = [];
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) this.dungeonList.push(new UnknownTile(0, 0));
    }

    reset() {
        this.fillUnknown();
        this.doorTiles = [];
        this.uniqueRooms.clear();
        this.mimicRoom = null;
        this.mimicKilled = false;
        this.hasScanned = false;
        this.witherDoors = 0;
        this.cryptCount = 0;
        this.secretCount = 0;
        this.currentRoom = null;
        this.lastKnownRoom = null;
        this.lastScanTime = 0;
        this.mimicFailed = false;
        this.errorLogged = false;
        emit('reset', null);
    }

    isInDungeon() {
        return location.inDungeon;
    }

    isInBoss() {
        return location.inBoss;
    }

    tick() {
        if (!location.inDungeon) return;

        try {
            this.updateCurrentRoom();
            if (location.inBoss) return;

            if (Date.now() - this.lastScanTime >= SCAN_INTERVAL_MS) this.scan();
            this.updateDoors();

            if (this.mimicKilled || this.mimicRoom || !this.mimicDetectionEnabled || this.mimicFailed) return;
            if ((location.floorNumber ?? 0) < 6) return;
            this.findMimicRoom();
        } catch (error) {
            if (this.errorLogged) return;
            this.errorLogged = true;
            console.error('[Catacombs] scanner tick failed: ' + error + (error?.stack ? '\n' + error.stack : ''));
        }
    }

    updateCurrentRoom() {
        const room = this.getRoomFromPos({ x: Player.getX(), y: Player.getY(), z: Player.getZ() });
        if (room === this.currentRoom) return;

        this.lastKnownRoom = this.currentRoom;
        this.currentRoom = room;
        if (this.lastKnownRoom) emit('roomExit', { room: this.lastKnownRoom });
        if (this.currentRoom) emit('roomEnter', { room: this.currentRoom });
    }

    scan() {
        let allChunksLoaded = true;

        if (!this.hasScanned) {
            for (let x = 0; x <= 10; x++) {
                for (let z = 0; z <= 10; z++) {
                    const worldX = GRID_START_X + x * (ROOM_SIZE >> 1);
                    const worldZ = GRID_START_Z + z * (ROOM_SIZE >> 1);

                    if (!isChunkLoaded(worldX, worldZ)) {
                        allChunksLoaded = false;
                        continue;
                    }

                    const inGrid = this.dungeonList[x + z * GRID_SIZE];
                    const placeholder = inGrid instanceof UnknownTile || (inGrid instanceof RoomTile && inGrid.data.isUnknown());
                    if (!placeholder) continue;

                    const roofHeight = getHighestY(worldX, worldZ);
                    if (roofHeight <= 0) continue;

                    const tile = this.scanTile(worldX, worldZ, z, x, roofHeight);
                    if (tile) this.setTile(z * GRID_SIZE + x, tile);
                }
            }
        }

        this.lastScanTime = Date.now();
        for (const room of this.uniqueRooms.values()) room.findRotation();
        if (allChunksLoaded) this.hasScanned = true;
    }

    setTile(index, tile) {
        const old = this.dungeonList[index];
        if (old instanceof DoorTile) this.doorTiles = this.doorTiles.filter((door) => door !== old);
        this.dungeonList[index] = tile;
        if (tile instanceof DoorTile) this.doorTiles.push(tile);
        emit('tileScanned', { tile, index });
    }

    scanTile(x, z, row, column, roofHeight) {
        const rowEven = (row & 1) === 0;
        const columnEven = (column & 1) === 0;

        if (rowEven && columnEven) {
            const data = getRoomData(getCore(x, z));
            if (!data) return null;

            const tile = new RoomTile(x, z, data);
            tile.addToUnique(row, column);
            if (tile.uniqueRoom) tile.uniqueRoom.highestBlock = roofHeight;
            return tile;
        }

        if (!rowEven && !columnEven) {
            const source = this.dungeonList[column - 1 + (row - 1) * GRID_SIZE];
            if (!(source instanceof RoomTile)) return null;

            const tile = new RoomTile(x, z, source.data);
            tile.isSeparator = true;
            tile.addToUnique(row, column);
            return tile;
        }

        if (roofHeight === 73 || roofHeight === 74 || roofHeight === 81 || roofHeight === 82) {
            const type = DOOR_BLOCKS[getBlockNameAt(x, DOOR_Y, z)] ?? DoorType.NORMAL;
            if (type === DoorType.WITHER) this.witherDoors++;
            return new DoorTile(x, z, type, this.dungeonList);
        }

        const source = this.dungeonList[rowEven ? row * GRID_SIZE + column - 1 : (row - 1) * GRID_SIZE + column];
        if (!(source instanceof RoomTile)) return null;
        if (source.data.type === RoomType.ENTRANCE) return new DoorTile(x, z, DoorType.ENTRANCE, this.dungeonList);

        const tile = new RoomTile(x, z, source.data);
        tile.isSeparator = true;
        tile.addToUnique(row, column);
        return tile;
    }

    updateDoors() {
        for (const door of this.doorTiles) {
            if (door.opened) continue;
            if (door.type !== DoorType.WITHER && door.type !== DoorType.BLOOD && door.type !== DoorType.ENTRANCE) continue;
            if (!isChunkLoaded(door.x, door.z)) continue;

            const name = getBlockNameAt(door.x, DOOR_Y, door.z);
            if (name === 'minecraft:air' || name === 'minecraft:barrier') door.opened = true;
        }
    }

    findMimicRoom() {
        try {
            const world = getWorld();
            if (!world) return;

            const renderDistance = Client.getMinecraft().options.renderDistance().get();
            const chunkX = Math.floor(Player.getX() / 16);
            const chunkZ = Math.floor(Player.getZ() / 16);
            const roomChests = new Map();

            for (let cx = chunkX - renderDistance; cx <= chunkX + renderDistance; cx++) {
                for (let cz = chunkZ - renderDistance; cz <= chunkZ + renderDistance; cz++) {
                    if (!world.hasChunkAt(new BP(cx * 16, 64, cz * 16))) continue;

                    const positions = world.getChunk(cx, cz).getBlockEntitiesPos();
                    const iterator = positions.iterator();
                    while (iterator.hasNext()) {
                        const pos = iterator.next();
                        const x = Number(pos.getX());
                        const y = Number(pos.getY());
                        const z = Number(pos.getZ());
                        if (getBlockNameAt(x, y, z) !== 'minecraft:trapped_chest') continue;

                        const room = this.getRoomFromPos({ x, y, z });
                        if (!room) continue;

                        if (!roomChests.has(room)) roomChests.set(room, []);
                        const chests = roomChests.get(room);
                        chests.push({ x, y, z });

                        if (chests.length > room.data.trappedChests) {
                            room.trappedChestPositions = chests;
                            room.hasMimic = true;
                            this.mimicRoom = room;
                        }
                    }
                }
            }
        } catch (error) {
            this.mimicFailed = true;
            console.error('[Catacombs] mimic detection disabled after error: ' + error + (error?.stack ? '\n' + error.stack : ''));
        }
    }

    getRoomFromPos(pos) {
        const [gx, gz] = getRoomGraf(coord(pos));
        const tile = this.dungeonList[gz * GRID_SIZE + gx];
        return tile instanceof RoomTile ? tile.uniqueRoom : null;
    }
}

scanner = new DungeonScanner();

export const getRoomFromPos = (pos) => scanner.getRoomFromPos(pos);

export default scanner;
