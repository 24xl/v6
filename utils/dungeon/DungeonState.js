import { Room } from "./Room";
import { Door } from "./Door";
import { DungeonPlayer } from "./DungeonPlayer";
import { RoomTypes } from "./RoomTypes";
import { Checkmark } from "./Checkmark";
import { DoorTypes } from "./DoorTypes";

class DungeonState {
  constructor() {
    this.reset();
  }

  reset() {
    this.rooms = [];
    this.doors = [];
    this.players = [];
    this.fullyScanned = false;
    this.secrets = 0;
    this.secretsFound = 0;
    this.crypts = 0;
    this.mimicKilled = false;
    this.mimicRoom = null;
    this.bossEntry = false;
    this.runEnded = false;
    this.floorNumber = 0;
    this.isPaul = false;
    this.deathPenalty = 0;
    this.score = 0;
    this.totalSecrets = 0;
    this.minSecrets = 0;
    this.mapCorner = null;
    this.mapRoomSize = 0;
    this.mapGapSize = 0;
    this.lastScanTime = 0;
    this.scanCoords = new Map();
    this.checkmarkedRooms = [];
    this.mapLine1 = "&cDungeon not fully";
    this.mapLine2 = "&cscanned!";
    this.witherKeys = 0;
    this.bloodKey = false;
    this.lastRoomEntered = null;
  }

  addRoom(components, type = RoomTypes.UNKNOWN) {
    const existing = this.getRoomWithComponent(components[0]);
    if (existing) {
      existing.addComponents(components);
      return existing;
    }
    const room = new Room(components, type);
    this.rooms.push(room);
    return room;
  }

  getRoomWithComponent(component) {
    const [cx, cz] = component;
    for (const room of this.rooms) {
      for (const c of room.components) {
        if (c[0] === cx && c[1] === cz) return room;
      }
    }
    return null;
  }

  getDoorWithComponent(component) {
    const [gx, gz] = component;
    for (const door of this.doors) {
      if (door.gx === gx && door.gz === gz) return door;
    }
    return null;
  }

  getRoomAt(x, z, mustBeFullyLoaded = false) {
    if (!this.mapCorner || !this.mapRoomSize) return null;

    const gx = Math.floor((x - this.mapCorner[0]) / this.mapRoomSize);
    const gz = Math.floor((z - this.mapCorner[1]) / this.mapRoomSize);
    const cx = Math.floor(gx / 2);
    const cz = Math.floor(gz / 2);

    if (cx < 0 || cz < 0 || cx >= 6 || cz >= 6) return null;

    const room = this.getRoomWithComponent([cx, cz]);
    if (!room) return null;
    if (mustBeFullyLoaded && (!room.corner || room.rotation == null))
      return null;
    return room;
  }

  getRoomFromName(name) {
    return this.rooms.find((r) => r.name === name) || null;
  }

  getDoorBetweenRooms(childRoom, parentRoom) {
    if (!childRoom || !parentRoom) return null;
    for (const door of this.doors) {
      const childGx = childRoom.components[0][0] * 2;
      const childGz = childRoom.components[0][1] * 2;
      if (
        (door.gx === childGx && door.gz === childGz) ||
        (door.gx === childGx + 1 && door.gz === childGz) ||
        (door.gx === childGx - 1 && door.gz === childGz) ||
        (door.gx === childGx && door.gz === childGz + 1) ||
        (door.gx === childGx && door.gz === childGz - 1)
      ) {
        return door;
      }
    }
    return null;
  }

  getPlayersInRoom(room) {
    return this.players.filter((p) => p.currentRoom === room);
  }

  getRoomsTo(startRoom, endRoom, includeDoors = false) {
    if (!startRoom || !endRoom) return [];
    // Simple BFS pathfinding through doors
    const visited = new Set();
    const queue = [{ room: startRoom, path: [] }];
    visited.add(startRoom);

    while (queue.length) {
      const { room, path } = queue.shift();
      if (room === endRoom) {
        const result = [startRoom, ...path.map((p) => p.room)];
        if (includeDoors) {
          const withDoors = [];
          for (let i = 0; i < result.length - 1; i++) {
            withDoors.push(result[i]);
            const door = this.getDoorBetweenRooms(result[i + 1], result[i]);
            if (door) withDoors.push(door);
          }
          withDoors.push(endRoom);
          return withDoors;
        }
        return result;
      }

      for (const door of this.doors) {
        let nextRoom = null;
        if (door.gx % 2 === 0 && door.gz % 2 === 0) continue;

        if (door.gx % 2 === 1) {
          const rx = (door.gx - 1) / 2;
          const rz = door.gz / 2;
          const r1 = this.getRoomWithComponent([rx, rz]);
          const r2 = this.getRoomWithComponent([rx + 1, rz]);
          if (r1 === room) nextRoom = r2;
          else if (r2 === room) nextRoom = r1;
        } else {
          const rx = door.gx / 2;
          const rz = (door.gz - 1) / 2;
          const r1 = this.getRoomWithComponent([rx, rz]);
          const r2 = this.getRoomWithComponent([rx, rz + 1]);
          if (r1 === room) nextRoom = r2;
          else if (r2 === room) nextRoom = r1;
        }

        if (nextRoom && !visited.has(nextRoom)) {
          visited.add(nextRoom);
          queue.push({
            room: nextRoom,
            path: [...path, { room: nextRoom, door }],
          });
        }
      }
    }
    return [];
  }

  setCheckmarkedRoom(room) {
    if (!this.checkmarkedRooms.includes(room)) {
      this.checkmarkedRooms.push(room);
    }
  }

  handleRoomCleared(room) {
    const players = this.getPlayersInRoom(room);
    for (const player of players) {
      if (players.length === 1) player.clearedRooms.solo++;
      else player.clearedRooms.stacked++;
    }
  }

  checkDoorsOpened() {
    for (const door of this.doors) {
      if (door.type === DoorTypes.WITHER && this.witherKeys > 0) {
        this.witherKeys--;
      }
      if (door.type === DoorTypes.BLOOD && this.bloodKey) {
        this.bloodKey = false;
      }
    }
  }

  checkRoomRotations() {
    for (const room of this.rooms) {
      if (room.shape === "1x1" && room.rotation == null) {
        // Could save door data for 1x1 rooms
      }
    }
  }
}

const instance = new DungeonState();
export default instance;
