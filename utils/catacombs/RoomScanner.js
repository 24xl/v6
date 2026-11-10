// Shared "which dungeon room am I in" detector for puzzle solvers.
//
//   import { isInRoom, getRoomName, onRoomEnter, onRoomExit } from '../../utils/catacombs/RoomScanner';
//
// NoamAddons' room scanner (ScanUtils/DungeonScanner) maps a block-column core
// hash to a room name via a downloaded rooms-modern.json. That data file is not
// available here, so instead each room is detected by its unique in-world
// signature (a distinctive entity or block layout scanned around the player).
// This keeps the same contract the solvers rely on: isInRoom(name), enter/exit
// events, and a per-room rotation via the blue-terracotta corner method.

import { ArmorStandEntity } from "../Constants";
import { isInDungeon } from "./DungeonLocation";

const CHECK_EVERY_TICKS = 4;
const SCAN_RADIUS = 24;
const BLAZE = Java.type("net.minecraft.world.entity.monster.Blaze");
const SILVERFISH = Java.type("net.minecraft.world.entity.monster.Silverfish");
const ITEM_FRAME = Java.type("net.minecraft.world.entity.decoration.ItemFrame");

const state = { name: null };
const listeners = { enter: [], exit: [] };
let tickCount = 0;

function emit(name, payload) {
  for (const callback of listeners[name].slice()) {
    try {
      callback(payload);
    } catch (error) {
      console.error('[RoomScanner] "' + name + '" listener threw: ' + error);
    }
  }
}

function boxAroundPlayer() {
  const x = Math.floor(Player.getX());
  const y = Math.floor(Player.getY());
  const z = Math.floor(Player.getZ());
  return [
    x - SCAN_RADIUS,
    y - 10,
    z - SCAN_RADIUS,
    x + SCAN_RADIUS,
    y + 10,
    z + SCAN_RADIUS,
  ];
}

function blocksInBox() {
  const [x1, y1, z1, x2, y2, z2] = boxAroundPlayer();
  try {
    return World.getBlocksInBox(x1, y1, z1, x2, y2, z2) || [];
  } catch (e) {
    return [];
  }
}

function registry(block) {
  return String(block?.type?.getRegistryName?.() ?? "");
}

function countBlock(blocks, name) {
  let count = 0;
  for (const block of blocks) if (registry(block) === name) count++;
  return count;
}

function entitiesOfType(cls) {
  try {
    return World.getAllEntitiesOfType(cls) || [];
  } catch (e) {
    return [];
  }
}

function armorStandNames() {
  const names = [];
  for (const stand of entitiesOfType(ArmorStandEntity)) {
    const name = String(stand.getName?.() ?? "").trim();
    if (name) names.push(name);
  }
  return names;
}

// Each detector returns true when its room's signature is present. Order matters:
// first match wins, so put the most specific/least-ambiguous rooms earlier.
const DETECTORS = [
  {
    name: "Teleport Maze",
    test: (blocks) => countBlock(blocks, "minecraft:end_portal_frame") >= 32,
  },
  {
    name: "Quiz",
    test: (blocks, stands) => stands.some((n) => n.includes("Oruo")),
  },
  {
    name: "Three Weirdos",
    test: (blocks, stands) =>
      stands.filter((n) => n.startsWith("[NPC]")).length >= 3,
  },
  {
    name: "Tic Tac Toe",
    test: () => entitiesOfType(ITEM_FRAME).length >= 8,
  },
  {
    name: "Ice Path",
    test: () => entitiesOfType(SILVERFISH).length >= 1,
  },
  {
    name: "Ice Fill",
    test: (blocks) =>
      countBlock(blocks, "minecraft:ice") +
        countBlock(blocks, "minecraft:packed_ice") >=
      40,
  },
  {
    name: "Creeper Beams",
    test: (blocks) =>
      countBlock(blocks, "minecraft:sea_lantern") +
        countBlock(blocks, "minecraft:prismarine") >=
      8,
  },
  {
    name: "Water Board",
    test: (blocks) =>
      countBlock(blocks, "minecraft:wool") >= 5 &&
      countBlock(blocks, "minecraft:lever") >= 6,
  },
  {
    name: "Boulder",
    test: (blocks) =>
      countBlock(blocks, "minecraft:lever") >= 4 &&
      countBlock(blocks, "minecraft:chest") >= 1,
  },
  {
    name: "Blaze",
    test: () => entitiesOfType(BLAZE).length >= 1,
  },
];

function detect() {
  if (!isInDungeon()) {
    if (state.name !== null) {
      const prev = state.name;
      state.name = null;
      emit("exit", prev);
    }
    return;
  }

  const blocks = blocksInBox();
  const stands = armorStandNames();

  let found = null;
  for (const detector of DETECTORS) {
    try {
      if (detector.test(blocks, stands)) {
        found = detector.name;
        break;
      }
    } catch (e) {
      // a failed detector just means "not this room"
    }
  }

  if (found === state.name) return;

  const prev = state.name;
  state.name = found;
  if (prev !== null) emit("exit", prev);
  if (found !== null) emit("enter", found);
}

function reset() {
  const prev = state.name;
  state.name = null;
  tickCount = 0;
  if (prev !== null) emit("exit", prev);
}

register("tick", () => {
  tickCount++;
  if (tickCount % CHECK_EVERY_TICKS !== 0) return;
  if (!World.isLoaded()) return;
  try {
    detect();
  } catch (error) {
    console.error("[RoomScanner] detect failed: " + error);
  }
});

register("worldUnload", () => reset());

export const rotatePos = (x, y, z, degree) => {
  const norm = ((degree % 360) + 360) % 360;
  switch (norm) {
    case 0:
      return { x, y, z };
    case 90:
      return { x: z, y, z: -x };
    case 180:
      return { x: -x, y, z: -z };
    case 270:
      return { x: -z, y, z: x };
    default:
      return { x, y, z };
  }
};

export const getRealCoord = (
  relX,
  relY,
  relZ,
  centerX,
  centerY,
  centerZ,
  rotation,
) => {
  const rot = rotatePos(relX, relY, relZ, rotation);
  return { x: rot.x + centerX, y: rot.y + centerY, z: rot.z + centerZ };
};

export const getRoomName = () => state.name;
export const isInRoom = (name) => state.name === name;
export const onRoomEnter = (callback) => {
  listeners.enter.push(callback);
  return () => {
    const index = listeners.enter.indexOf(callback);
    if (index !== -1) listeners.enter.splice(index, 1);
  };
};
export const onRoomExit = (callback) => {
  listeners.exit.push(callback);
  return () => {
    const index = listeners.exit.indexOf(callback);
    if (index !== -1) listeners.exit.splice(index, 1);
  };
};
