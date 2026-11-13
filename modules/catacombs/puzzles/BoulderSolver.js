import { ModuleBase } from "../../../utils/ModuleBase";
import { Vec3d, BP } from "../../../utils/Constants";
import { puzzleSettings } from "../../../utils/catacombs/puzzles/PuzzleSettings";
import {
  onRoomEnter,
  onRoomExit,
  getRealCoord,
} from "../../../utils/catacombs/RoomScanner";
import { loadPuzzleData } from "../../../utils/catacombs/puzzles/PuzzleData";

// Boulder: scan a 7x6 grid of air/blocks, look up the solution pattern in
// boulderSolutions.json, and render the box + click target for each move.
// Ported from NoammAddons' BoulderSolver.kt.
//
// The grid is at y=65, 3-block steps, starting at (-9, 65, -9) in room-local
// coordinates. Each solution entry is 6 doubles: [boxX, boxY, clickX, clickY,
// renderX, renderY]. All are mapped to world space via getRealCoord.

const GRID_SX = -9;
const GRID_SY = 65;
const GRID_SZ = -9;
const GRID_W = 7;
const GRID_H = 6;

const ButtonBlock = Java.type("net.minecraft.world.level.block.ButtonBlock");
const LeverBlock = Java.type("net.minecraft.world.level.block.LeverBlock");
const WallSignBlock = Java.type(
  "net.minecraft.world.level.block.WallSignBlock",
);
const ChestBlock = Java.type("net.minecraft.world.level.block.ChestBlock");

class BoulderSolver extends ModuleBase {
  constructor() {
    super({
      name: "Boulder Solver",
      subcategory: "Catacombs",
      description: "Shows the solution for the Boulder puzzle.",
      tooltip: "Shows the solution for the Boulder puzzle.",
      showEnabledToggle: false,
    });

    this.currentSolution = [];
    this.inBoulder = false;
    this.roomCenter = null;
    this.rotation = 0;

    this.on("tick", () => {
      if (this.enabled !== puzzleSettings.boulder)
        this.toggle(puzzleSettings.boulder);
    });
    this.when(
      () => this.enabled,
      "postRenderWorld",
      () => this.onRenderWorld(),
    );

    onRoomEnter((name) => {
      if (name !== "Boulder") return;
      this.inBoulder = true;
      this.roomCenter = this.estimateRoomCenter();
      this.rotation = 0;
      this.solve();
    });
    onRoomExit((name) => {
      if (name !== "Boulder") return;
      this.reset();
    });
  }

  onEnable() {
    this.currentSolution = [];
    this.inBoulder = false;
    this.roomCenter = null;
    this.rotation = 0;
  }

  onDisable() {
    this.reset();
  }

  reset() {
    this.currentSolution = [];
    this.inBoulder = false;
    this.roomCenter = null;
    this.rotation = 0;
  }

  estimateRoomCenter() {
    const px = Math.floor(Player.getX());
    const pz = Math.floor(Player.getZ());
    return {
      x: Math.floor(px / 32) * 32 + 16,
      y: 70,
      z: Math.floor(pz / 32) * 32 + 16,
    };
  }

  isAir(x, y, z) {
    try {
      return World.getBlockAt(x, y, z)?.type?.getID?.() === 0;
    } catch (e) {
      return true;
    }
  }

  solve() {
    this.currentSolution = [];
    const data = loadPuzzleData("boulderSolutions.json");
    if (!data) return;

    let pattern = "";
    for (let z = 0; z < GRID_H; z++) {
      for (let x = 0; x < GRID_W; x++) {
        const relX = GRID_SX + x * 3;
        const relZ = GRID_SZ + z * 3;
        const real = getRealCoord(
          relX,
          GRID_SY,
          relZ,
          this.roomCenter.x,
          this.roomCenter.y,
          this.roomCenter.z,
          this.rotation,
        );
        pattern += this.isAir(real.x, real.y, real.z) ? "0" : "1";
      }
    }

    const solutions = data[pattern];
    if (!solutions) return;

    for (const sol of solutions) {
      const box = getRealCoord(
        Math.floor(sol[0]),
        GRID_SY,
        Math.floor(sol[1]),
        this.roomCenter.x,
        this.roomCenter.y,
        this.roomCenter.z,
        this.rotation,
      );
      const click = getRealCoord(
        Math.floor(sol[2]),
        GRID_SY,
        Math.floor(sol[3]),
        this.roomCenter.x,
        this.roomCenter.y,
        this.roomCenter.z,
        this.rotation,
      );
      const render = getRealCoord(
        Math.floor(sol[4]),
        GRID_SY,
        Math.floor(sol[5]),
        this.roomCenter.x,
        this.roomCenter.y,
        this.roomCenter.z,
        this.rotation,
      );
      this.currentSolution.push({ box, click, render });
    }
  }

  onRenderWorld() {
    if (!this.enabled || !this.inBoulder || this.currentSolution.length === 0)
      return;

    const boxColor = new RenderColor(
      puzzleSettings.boxColor.getRed(),
      puzzleSettings.boxColor.getGreen(),
      puzzleSettings.boxColor.getBlue(),
      puzzleSettings.boxColor.getAlpha(),
    );
    const clickColor = new RenderColor(
      puzzleSettings.clickColor.getRed(),
      puzzleSettings.clickColor.getGreen(),
      puzzleSettings.clickColor.getBlue(),
      puzzleSettings.clickColor.getAlpha(),
    );

    const entries = puzzleSettings.showAll
      ? this.currentSolution
      : [this.currentSolution[0]];
    for (const entry of entries) {
      // 3x3 box outline centered at the box position
      const bx = entry.box.x + 0.5;
      const by = entry.box.y - 1;
      const bz = entry.box.z + 0.5;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          Render3D.drawFilledBox(new Vec3d(bx + dx, by, bz + dz), boxColor);
        }
      }
      // Click target
      Render3D.drawFilledBox(
        new Vec3d(
          entry.click.x + 0.5,
          entry.click.y + 0.5,
          entry.click.z + 0.5,
        ),
        clickColor,
      );
    }
  }
}

new BoulderSolver();
