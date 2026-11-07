import scanner from '../scanner/DungeonScanner';
import { RoomType, DoorType } from '../scan/DungeonScanUtils';

class DungeonGraph {
    constructor() {
        this.splitsCache = null;
        this.bloodRushCache = null;
        this.fairyRoom = null;
        this.nextRoomAfterFairy = null;
        this.roomBeforeFairy = null;
    }

    clearCache() {
        this.splitsCache = null;
        this.bloodRushCache = null;
        this.fairyRoom = null;
        this.nextRoomAfterFairy = null;
        this.roomBeforeFairy = null;
    }

    getSplits() {
        if (this.splitsCache) return this.splitsCache;

        const graph = new Map();

        for (const tile of scanner.dungeonList) {
            if (!(tile instanceof DoorTile)) continue;
            const rooms = tile.roomTiles.map(t => t.uniqueRoom).filter(Boolean);
            if (rooms.length !== 2 || rooms[0] === rooms[1]) continue;

            if (!graph.has(rooms[0])) graph.set(rooms[0], new Set());
            if (!graph.has(rooms[1])) graph.set(rooms[1], new Set());
            graph.get(rooms[0]).add(rooms[1]);
            graph.get(rooms[1]).add(rooms[0]);
        }

        this.splitsCache = graph;
        return graph;
    }

    getBloodRush() {
        if (this.bloodRushCache) return this.bloodRushCache;

        const graph = this.getSplits();
        const start = [...graph.keys()].find(r => r.data.type === RoomType.ENTRANCE);
        const target = [...graph.keys()].find(r => r.data.type === RoomType.BLOOD);
        if (!start || !target) return [];

        const queue = [start];
        const previous = new Map();
        previous.set(start, null);

        while (queue.length) {
            const room = queue.shift();
            if (room === target) break;

            const neighbors = graph.get(room);
            if (!neighbors) continue;

            for (const neighbor of neighbors) {
                if (!previous.has(neighbor)) {
                    previous.set(neighbor, room);
                    queue.push(neighbor);
                }
            }
        }

        if (!previous.has(target)) return [];

        const path = [];
        let room = target;
        while (room) {
            path.push(room);
            room = previous.get(room);
        }
        path.reverse();

        this.bloodRushCache = path;

        const fairyIndex = path.findIndex(r => r.data.type === RoomType.FAIRY);
        if (fairyIndex > 0 && fairyIndex < path.length - 1) {
            this.roomBeforeFairy = path[fairyIndex - 1];
            this.fairyRoom = path[fairyIndex];
            this.nextRoomAfterFairy = path[fairyIndex + 1];
        }

        return path;
    }

    isFairyDoor(door) {
        const currentRoom = scanner.currentRoom;
        const lastRoom = scanner.lastKnownRoom;
        if (!currentRoom || !lastRoom) return false;

        this.getBloodRush();
        if (!this.fairyRoom) return false;

        const prev = this.roomBeforeFairy;
        const next = this.nextRoomAfterFairy;
        if (!prev || !next) return false;

        if (![currentRoom, lastRoom].includes(prev)) return false;

        const rooms = door.roomTiles.map(t => t.uniqueRoom).filter(Boolean);
        if (rooms.length !== 2) return false;
        const [r1, r2] = rooms;

        return (r1 === this.fairyRoom && r2 === next) || (r1 === next && r2 === this.fairyRoom);
    }

    getCurrentRoom() {
        return scanner.currentRoom;
    }

    getLastKnownRoom() {
        return scanner.lastKnownRoom;
    }

    getMimicRoom() {
        return scanner.mimicRoom;
    }
}

class DoorTile {
    constructor(x, z, type) {
        this.x = x;
        this.z = z;
        this.doorType = type;
        this.roomTiles = [];
    }

    get uniqueRoom() {
        return this.roomTiles[0]?.uniqueRoom ?? null;
    }
}

const graph = new DungeonGraph();
export default graph;