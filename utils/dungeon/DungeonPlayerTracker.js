import DungeonState from "./DungeonState";
import { DungeonPlayer } from "./DungeonPlayer";

export function updatePlayers() {
  if (!DungeonDetector.isInDungeon()) return;

  const state = DungeonState;
  const infoMap = Player.getPlayer()?.func_71174_a?.func_175106_d?.();
  if (!infoMap) return;

  const constants = getMapConstants();
  if (!constants.mapCorner) return;

  const { mapCorner, mapRoomSize } = constants;
  const scaleX = 125 / 128;
  const scaleY = 125 / 128;

  for (let entry of infoMap) {
    const line = entry.func_178854_k?.();
    if (!line) continue;

    const unformatted = line.func_150260_c?.().replace(/§./g, "") || "";
    const match = unformatted.match(
      /^\[(\d+)\] (?:\[\w+\] )*(\w+) (?:.)*?\((\w+)(?: (\w+))*\)$/,
    );
    if (!match) continue;

    const [_, sbLevel, name, clazz, level] = match;

    let existing = state.players.find((p) => p.player === name);
    if (!existing) {
      existing = new DungeonPlayer(name);
      state.players.push(existing);
    }

    existing.skinTexture = entry.func_178837_g?.();
  }

  for (const player of state.players) {
    const mcPlayer = World.getPlayerByName(player.player);
    if (!mcPlayer) {
      player.inRender = false;
      continue;
    }

    if (mcPlayer.getPing() === -1 && !state.runEnded) continue;

    const x = mcPlayer.getX();
    const z = mcPlayer.getZ();

    if (!isBetween(x, -200, -10) || !isBetween(z, -200, -10)) {
      player.inRender = false;
      continue;
    }

    player.inRender = true;
    player.realX = x;
    player.realZ = z;
    player.iconX = Math.floor(clampAndMap(x, -200, -10, 0, 125) * scaleX);
    player.iconY = Math.floor(clampAndMap(z, -200, -10, 0, 125) * scaleY);
    player.rotation = mcPlayer.getYaw() + 180;

    player.currentRoom = state.getRoomAt(x, z);
  }
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

function isBetween(value, min, max) {
  return value >= min && value <= max;
}

function clampAndMap(value, inMin, inMax, outMin, outMax) {
  const clamped = Math.max(inMin, Math.min(inMax, value));
  return ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}
