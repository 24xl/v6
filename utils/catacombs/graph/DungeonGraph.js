import scanner, { DoorTile } from '../scanner/DungeonScanner';
import { on } from '../DungeonEvents';
import { RoomType } from '../scan/DungeonScanUtils';

class DungeonGraph {
    constructor() {
        this.clearCache();
    }

    clearCache() {
        this.splitsCache = null;
        this.bloodRushCache = null;
        this.fairyRoom = null;
        this.nextRoomAfterFairy = null;
        this.roomBeforeFairy = null;
    }

    isFairy(door) {
        const currentRoom = scanner.currentRoom;
        const lastRoom = scanner.lastKnownRoom;
        if (!currentRoom || !lastRoom) return false;

        this.getBloodRush();
        if (!this.fairyRoom || !this.roomBeforeFairy || !this.nextRoomAfterFairy) return false;
        if (this.roomBeforeFairy !== currentRoom && this.roomBeforeFairy !== lastRoom) return false;

        const rooms = door.roomTiles.map((tile) => tile.uniqueRoom).filter(Boolean);
        if (rooms.length !== 2) return false;

        const [r1, r2] = rooms;
        return (r1 === this.fairyRoom && r2 === this.nextRoomAfterFairy) || (r1 === this.nextRoomAfterFairy && r2 === this.fairyRoom);
    }

    getBloodRush() {
        if (this.bloodRushCache) return this.bloodRushCache;

        const graph = this.getSplits();
        const rooms = Array.from(graph.keys());
        const start = rooms.find((room) => room.data.type === RoomType.ENTRANCE);
        const target = rooms.find((room) => room.data.type === RoomType.BLOOD);
        if (!start || !target) return [];

        const queue = [start];
        const previous = new Map([[start, null]]);

        for (let head = 0; head < queue.length; head++) {
            const room = queue[head];
            if (room === target) break;

            for (const neighbor of graph.get(room) ?? []) {
                if (previous.has(neighbor)) continue;
                previous.set(neighbor, room);
                queue.push(neighbor);
            }
        }

        if (!previous.has(target)) return [];

        const path = [];
        for (let room = target; room; room = previous.get(room)) path.push(room);
        path.reverse();
        this.bloodRushCache = path;

        const fairyIndex = path.findIndex((room) => room.data.type === RoomType.FAIRY);
        if (fairyIndex > 0 && fairyIndex < path.length - 1) {
            this.roomBeforeFairy = path[fairyIndex - 1];
            this.fairyRoom = path[fairyIndex];
            this.nextRoomAfterFairy = path[fairyIndex + 1];
        }

        return path;
    }

    getSplits() {
        if (this.splitsCache) return this.splitsCache;

        const graph = new Map();
        for (const tile of scanner.dungeonList) {
            if (!(tile instanceof DoorTile)) continue;

            const rooms = tile.roomTiles.map((roomTile) => roomTile.uniqueRoom).filter(Boolean);
            if (rooms.length !== 2 || rooms[0] === rooms[1]) continue;

            if (!graph.has(rooms[0])) graph.set(rooms[0], new Set());
            if (!graph.has(rooms[1])) graph.set(rooms[1], new Set());
            graph.get(rooms[0]).add(rooms[1]);
            graph.get(rooms[1]).add(rooms[0]);
        }

        this.splitsCache = graph;
        return graph;
    }
}

const graph = new DungeonGraph();

// Cached paths go stale whenever the grid changes or resets, exactly like DungeonTree.clearCache in Noamm.
on('tileScanned', () => graph.clearCache());
on('reset', () => graph.clearCache());

export default graph;
