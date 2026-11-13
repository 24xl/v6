import { ModuleBase } from "../../../utils/ModuleBase";
import { Vec3d } from "../../../utils/Constants";
import { puzzleSettings } from "../../../utils/catacombs/puzzles/PuzzleSettings";
import {
  onRoomEnter,
  onRoomExit,
  getRealCoord,
} from "../../../utils/catacombs/RoomScanner";
import { loadPuzzleData } from "../../../utils/catacombs/puzzles/PuzzleData";

// Creeper Beams: pairs up prismarine/sea-lantern blocks with a connecting line.
// Ported from NoammAddons' CreeperBeamSolver.kt.
//
// Reads creeperBeamSolutions.json from assets/. Each entry is
// [[x,y,z],[x,y,z]] in room-local coordinates, mapped to world space using
// the room's center + rotation. Pairs are only rendered when both ends are
// actually prismarine/sea-lantern in the current world state.

const isBeamBlock = (registryName) =>
  registryName === "minecraft:prismarine" ||
  registryName === "minecraft:sea_lantern";

const COLOR_POOL = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [0, 255, 255],
  [255, 165, 0],
  [255, 255, 255],
  [255, 0, 255],
];

class CreeperBeamSolver extends ModuleBase {
  constructor() {
    super({
      name: "Creeper Beam Solver",
      subcategory: "Catacombs",
      description:
        "Highlights matching beam endpoints in the Creeper Beams room.",
      tooltip: "Highlights matching beam endpoints in the Creeper Beams room.",
      showEnabledToggle: false,
    });

    this.currentSolve = [];
    this.inCreeperBeams = false;
    this.roomCenter = null;
    this.rotation = 0;

    this.on("tick", () => {
      if (this.enabled !== puzzleSettings.creeper)
        this.toggle(puzzleSettings.creeper);
    });
    this.when(
      () => this.enabled,
      "postRenderWorld",
      () => this.onRenderWorld(),
    );

    onRoomEnter((name) => {
      if (name !== "Creeper Beams") return;
      this.inCreeperBeams = true;
      this.solve();
    });
    onRoomExit((name) => {
      if (name !== "Creeper Beams") return;
      this.reset();
    });
  }

  onEnable() {
    this.currentSolve = [];
    this.inCreeperBeams = false;
    this.roomCenter = null;
    this.rotation = 0;
  }

  onDisable() {
    this.reset();
  }

  reset() {
    this.currentSolve = [];
    this.inCreeperBeams = false;
    this.roomCenter = null;
    this.rotation = 0;
  }

  getBlockRegistry(x, y, z) {
    try {
      return String(World.getBlockAt(x, y, z)?.type?.getRegistryName?.() ?? "");
    } catch (e) {
      return "";
    }
  }

  // Estimate room center as the average of the player position snapped to
  // 32-block dungeon grid. Rotation 0 is the only reliably-supported value
  // without Noam's full map scanner, so we assume unrotated rooms for now.
  estimateRoomCenter() {
    const px = Math.floor(Player.getX());
    const pz = Math.floor(Player.getZ());
    const cx = Math.floor(px / 32) * 32 + 16;
    const cz = Math.floor(pz / 32) * 32 + 16;
    return { x: cx, y: 70, z: cz };
  }

  solve() {
    this.currentSolve = [];
    const data = loadPuzzleData("creeperBeamSolutions.json");
    if (!data || !Array.isArray(data)) return;

    this.roomCenter = this.estimateRoomCenter();
    this.rotation = 0;

    let colorIndex = 0;
    for (const beam of data) {
      if (colorIndex >= COLOR_POOL.length) colorIndex = 0;

      const s0 = beam[0];
      const s1 = beam[1];
      const startPos = getRealCoord(
        s0[0],
        s0[1],
        s0[2],
        this.roomCenter.x,
        this.roomCenter.y,
        this.roomCenter.z,
        this.rotation,
      );
      const endPos = getRealCoord(
        s1[0],
        s1[1],
        s1[2],
        this.roomCenter.x,
        this.roomCenter.y,
        this.roomCenter.z,
        this.rotation,
      );

      if (
        !isBeamBlock(this.getBlockRegistry(startPos.x, startPos.y, startPos.z))
      )
        continue;
      if (!isBeamBlock(this.getBlockRegistry(endPos.x, endPos.y, endPos.z)))
        continue;

      this.currentSolve.push({
        start: startPos,
        end: endPos,
        color: COLOR_POOL[colorIndex++],
      });
    }
  }

  onRenderWorld() {
    if (!this.enabled || !this.inCreeperBeams || this.currentSolve.length === 0)
      return;

    const phase = !!puzzleSettings.phase;
    const color = (rgb) => new RenderColor(rgb[0], rgb[1], rgb[2], 150);

    for (const pair of this.currentSolve) {
      const startReg = this.getBlockRegistry(
        pair.start.x,
        pair.start.y,
        pair.start.z,
      );
      const endReg = this.getBlockRegistry(pair.end.x, pair.end.y, pair.end.z);
      if (!isBeamBlock(startReg) || !isBeamBlock(endReg)) continue;

      const c = color(pair.color);
      Render3D.drawFilledBox(
        new Vec3d(pair.start.x, pair.start.y, pair.start.z),
        c,
      );
      Render3D.drawFilledBox(new Vec3d(pair.end.x, pair.end.y, pair.end.z), c);

      if (puzzleSettings.renderLines) {
        Render3D.drawLine(
          new Vec3d(pair.start.x + 0.5, pair.start.y + 0.5, pair.start.z + 0.5),
          new Vec3d(pair.end.x + 0.5, pair.end.y + 0.5, pair.end.z + 0.5),
          c,
          2,
          !phase,
        );
      }
    }
  }
}

new CreeperBeamSolver();
