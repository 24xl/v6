import DungeonState from "./DungeonState";
import { Room } from "./Room";
import { Door } from "./Door";
import { RoomTypes } from "./RoomTypes";
import { Checkmark } from "./Checkmark";
import { DoorTypes } from "./DoorTypes";
import { ROOM_TYPE_FROM_MAP_COLOR } from "./RoomTypes";
import { CHECKMARK_FROM_CENTER_COLOR } from "./Checkmark";
import { DOOR_TYPE_FROM_COLOR } from "./DoorTypes";

const MAP_WIDTH = 128;
const MAP_HEIGHT = 128;
const DEFAULT_MAP_SIZE = [125, 125];

export function scanHotbarMap() {
  if (!DungeonDetector.isInDungeon()) return;

  try {
    const mapItem = findHotbarMap();
    if (!mapItem) return;

    const mapData = mapItem
      .getTag()
      ?.getCompound("display")
      ?.getIntArray("MapData")?.colors;
    if (!mapData || mapData.length < 16384) return;

    const constants = getMapConstants();
    if (!constants.mapCorner) return;

    scanRooms(mapData, constants);
    scanDoors(mapData, constants);

    DungeonState.lastScanTime = Date.now();
  } catch (e) {
    console.error("DungeonScanner error:", e);
  }
}

function findHotbarMap() {
  const player = Player.getPlayer();
  if (!player) return null;

  for (let i = 0; i < 9; i++) {
    const stack = player.inventory.getStackInSlot(i);
    if (stack && stack.getItem() === net.minecraft.item.Items.FILLED_MAP) {
      return stack;
    }
  }
  return null;
}

function getMapConstants() {
  const state = DungeonState;
  if (!state.mapCorner) {
    const player = Player.getPlayer();
    if (!player) return { mapCorner: null };

    const x = Math.floor(player.getX());
    const z = Math.floor(player.getZ());
    state.mapCorner = [x - 64, z - 64];
    state.mapRoomSize = 20;
    state.mapGapSize = 2;
  }
  return state;
}

function scanRooms(mapData, state) {
  const { mapCorner, mapRoomSize, mapGapSize } = state;
  if (!mapCorner) return;

  for (const room of state.rooms) {
    if (!room.components.length) continue;

    const [cx, cz] = room.components[0];
    const mapX = mapCorner[0] + Math.floor(mapRoomSize / 2) + mapGapSize * cx;
    const mapY =
      mapCorner[1] + Math.floor(mapRoomSize / 2) + 1 + mapGapSize * cz;
    const index = mapX + mapY * MAP_WIDTH;

    if (index < 0 || index >= mapData.length) continue;

    const centerColor = mapData[index];
    const roomColorIndex = index + 5 + MAP_WIDTH * 4;
    const roomColor =
      roomColorIndex < mapData.length ? mapData[roomColorIndex] : 0;

    if (roomColor === 0 || roomColor === 85) {
      room.explored = false;
      continue;
    }
    room.explored = true;

    if (room.type === RoomTypes.UNKNOWN && !room.corner) {
      room.loadFromRoomMapColor(roomColor);
    }

    let newCheckmark = Checkmark.NONE;

    if (centerColor === 30 && roomColor !== 30) {
      if (!room.checkmark) {
        state.handleRoomCleared(room);
      }
      newCheckmark = Checkmark.GREEN;
      room.foundSecrets = room.secrets;
    } else if (centerColor === 34) {
      if (!room.checkmark) {
        state.handleRoomCleared(room);
      }
      newCheckmark = Checkmark.WHITE;
    } else if (centerColor === 18 && roomColor !== 18) {
      newCheckmark = Checkmark.FAILED;
    } else if (room.checkmark === Checkmark.UNEXPLORED) {
      newCheckmark = Checkmark.NONE;
    }

    if (room.checkmark !== newCheckmark && newCheckmark !== Checkmark.NONE) {
      state.setCheckmarkedRoom(room);
    }

    if (room.type === RoomTypes.BLOOD && newCheckmark === Checkmark.NONE) {
      continue;
    }

    room.checkmark = newCheckmark;
    room.updateRenderVariables(
      DEFAULT_MAP_SIZE[0] / 128,
      DEFAULT_MAP_SIZE[1] / 128,
    );
  }

  loadNewRooms(mapData, state);
}

function loadNewRooms(mapData, state) {
  const { mapCorner, mapRoomSize, mapGapSize } = state;
  if (!mapCorner) return;

  for (let gx = 0; gx < 12; gx += 2) {
    for (let gz = 0; gz < 12; gz += 2) {
      const cx = gx / 2;
      const cz = gz / 2;

      const mapX = mapCorner[0] + Math.floor(mapRoomSize / 2) + mapGapSize * cx;
      const mapY =
        mapCorner[1] + Math.floor(mapRoomSize / 2) + 1 + mapGapSize * cz;
      const index = mapX + mapY * MAP_WIDTH;

      if (index < 0 || index >= mapData.length) continue;

      const color = mapData[index];
      if (!color || color === 85) continue;

      const existingRoom = state.getRoomWithComponent([cx, cz]);
      if (existingRoom) continue;

      const roomColorIndex = index + 5 + MAP_WIDTH * 4;
      const roomColor =
        roomColorIndex < mapData.length ? mapData[roomColorIndex] : 0;

      if (color === 119) {
        const room = new Room([[cx, cz]]);
        room.checkmark = Checkmark.UNEXPLORED;
        state.rooms.push(room);
        continue;
      }

      const components = findAllConnected(mapData, [mapX, mapY]);
      for (const component of components) {
        const existing = state.getRoomWithComponent(component);
        if (!existing) continue;
        existing.addComponents(components);
        break;
      }

      const newRoom = new Room(components);
      newRoom.loadFromRoomMapColor(roomColor);
      state.rooms.push(newRoom);
    }
  }
}

function scanDoors(mapData, state) {
  const { mapCorner, mapRoomSize, mapGapSize } = state;
  if (!mapCorner) return;

  for (const door of state.doors) {
    const mapX =
      mapCorner[0] +
      Math.floor(mapRoomSize / 2) +
      Math.floor(mapGapSize / 2) * door.gx;
    const mapY =
      mapCorner[1] +
      Math.floor(mapRoomSize / 2) +
      Math.floor(mapGapSize / 2) * door.gz;
    const index = mapX + mapY * MAP_WIDTH;

    if (index < 0 || index >= mapData.length) continue;

    const color = mapData[index];
    if (color === 0 || color === 85) {
      door.explored = false;
      continue;
    }
    door.explored = true;
    door.updateRenderVariables(
      DEFAULT_MAP_SIZE[0] / 128,
      DEFAULT_MAP_SIZE[1] / 128,
    );
  }

  loadNewDoors(mapData, state);
}

function loadNewDoors(mapData, state) {
  const { mapCorner, mapRoomSize, mapGapSize } = state;
  if (!mapCorner) return;

  for (let gx = 0; gx < 12; gx++) {
    for (let gz = 0; gz < 12; gz++) {
      if (gx % 2 === 0 && gz % 2 === 0) continue;

      const mapX =
        mapCorner[0] +
        Math.floor(mapRoomSize / 2) +
        Math.floor(mapGapSize / 2) * gx;
      const mapY =
        mapCorner[1] +
        Math.floor(mapRoomSize / 2) +
        Math.floor(mapGapSize / 2) * gz;
      const index = mapX + mapY * MAP_WIDTH;

      if (index < 0 || index >= mapData.length) continue;

      const color = mapData[index];
      if (!color) continue;

      const existingDoor = state.getDoorWithComponent([gx, gz]);
      if (existingDoor) continue;

      if (
        gx % 2 === 1 &&
        (getColor(mapData, index - MAP_WIDTH * 5) ||
          getColor(mapData, index + MAP_WIDTH * 3))
      )
        continue;
      if (
        gz % 2 === 1 &&
        (getColor(mapData, index - MAP_WIDTH - 4) ||
          getColor(mapData, index - MAP_WIDTH + 4))
      )
        continue;

      let doorType = DoorTypes.NORMAL;
      if (color === 85 || color === 63) doorType = DoorTypes.NORMAL;
      else if (color === 119) doorType = DoorTypes.WITHER;
      else if (color === 18) doorType = DoorTypes.BLOOD;

      const x =
        mapCorner[0] + mapRoomSize * (gx / 2) + (gx % 2 ? mapGapSize / 2 : 0);
      const z =
        mapCorner[1] + mapRoomSize * (gz / 2) + (gz % 2 ? mapGapSize / 2 : 0);

      const door = new Door(x, z, gx, gz, doorType);
      state.doors.push(door);
    }
  }
}

function getColor(mapData, index) {
  if (index < 0 || index >= mapData.length) return 0;
  return mapData[index];
}

function findAllConnected(mapData, start) {
  const [startX, startY] = start;
  const startIndex = startX + startY * MAP_WIDTH;
  const startColor = mapData[startIndex];
  if (!startColor || startColor === 85) return [];

  const visited = new Set();
  const queue = [startIndex];
  const components = [];

  while (queue.length) {
    const idx = queue.pop();
    if (visited.has(idx)) continue;
    visited.add(idx);

    const x = idx % MAP_WIDTH;
    const y = Math.floor(idx / MAP_WIDTH);

    if (mapData[idx] !== startColor) continue;

    const gx = Math.floor(
      (x - state.mapCorner[0] - Math.floor(state.mapRoomSize / 2)) /
        state.mapGapSize,
    );
    const gz = Math.floor(
      (y - state.mapCorner[1] - Math.floor(state.mapRoomSize / 2) - 1) /
        state.mapGapSize,
    );
    components.push([gx, gz]);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT) {
        const nIdx = nx + ny * MAP_WIDTH;
        if (!visited.has(nIdx) && mapData[nIdx] === startColor) {
          queue.push(nIdx);
        }
      }
    }
  }

  return components;
}
