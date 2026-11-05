import { subArea } from "../Utils";
import DungeonState from "./DungeonState";

export function isInDungeon() {
  const sub = subArea();
  return sub && sub.startsWith("The Catacombs");
}

export function getDungeonFloor() {
  const sub = subArea();
  if (!sub || !sub.startsWith("The Catacombs")) return 0;

  const match = sub.match(/\(f(\d+)\)/i);
  if (match) return parseInt(match[1], 10);

  const matchM = sub.match(/\(m(\d+)\)/i);
  if (matchM) return parseInt(matchM[1], 10);

  return 0;
}

export function getDungeonMode() {
  const sub = subArea();
  if (!sub || !sub.startsWith("The Catacombs")) return "normal";

  if (sub.includes("(m")) return "master";
  return "normal";
}

export function getDungeonScoreboardData() {
  const lines = Scoreboard.getLines() || [];
  const data = {
    secretsFound: 0,
    totalSecrets: 0,
    crypts: 0,
    mimicKilled: false,
    bossEntry: false,
    deathPenalty: 0,
    score: 0,
    floorNumber: 0,
    isPaul: false,
  };

  for (const line of lines) {
    const text = ChatLib.removeFormatting(
      String(line?.getName?.() ?? line),
    ).trim();

    if (text.includes("Secrets")) {
      const match = text.match(/(\d+)\/(\d+)/);
      if (match) {
        data.secretsFound = parseInt(match[1], 10);
        data.totalSecrets = parseInt(match[2], 10);
      }
    }

    if (text.includes("Crypts")) {
      const match = text.match(/Crypts[:\s]*(\d+)/i);
      if (match) data.crypts = parseInt(match[1], 10);
    }

    if (text.includes("Mimic")) {
      data.mimicKilled =
        text.includes("✔") || text.includes("Dead") || text.includes("Killed");
    }

    if (text.includes("Boss") || text.includes("Entry")) {
      data.bossEntry = true;
    }

    if (text.includes("Death") || text.includes("Penalty")) {
      const match = text.match(/(-?\d+)/);
      if (match) data.deathPenalty = parseInt(match[1], 10);
    }

    if (text.includes("Score")) {
      const match = text.match(/Score[:\s]*(\d+)/i);
      if (match) data.score = parseInt(match[1], 10);
    }

    if (text.includes("Floor")) {
      const match = text.match(/Floor[:\s]*(\d+)/i);
      if (match) data.floorNumber = parseInt(match[1], 10);
    }

    if (text.includes("Paul") || text.includes("★")) {
      data.isPaul = true;
    }
  }

  return data;
}

export function updateDungeonStateFromScoreboard() {
  const data = getDungeonScoreboardData();
  const state = DungeonState;
  state.secretsFound = data.secretsFound;
  state.totalSecrets = data.totalSecrets;
  state.crypts = data.crypts;
  state.mimicKilled = data.mimicKilled;
  state.bossEntry = data.bossEntry;
  state.deathPenalty = data.deathPenalty;
  state.score = data.score;
  state.floorNumber = data.floorNumber || getDungeonFloor();
  state.isPaul = data.isPaul;
  state.minSecrets = Math.ceil(
    state.secrets * (state.isPaul ? 0.75 : 1.0) -
      (state.mimicKilled ? 2 : 0) -
      (state.crypts > 5 ? 5 : state.crypts) +
      state.deathPenalty,
  );
}

export function getMapConstants() {
  return {
    mapCorner: [0, 0],
    mapRoomSize: 20,
    mapGapSize: 2,
    defaultMapSize: [125, 125],
  };
}
