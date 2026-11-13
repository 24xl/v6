import { ModuleBase } from "../../../utils/ModuleBase";
import { Vec3d } from "../../../utils/Constants";
import { puzzleSettings } from "../../../utils/catacombs/puzzles/PuzzleSettings";
import {
  onRoomEnter,
  onRoomExit,
  isInRoom,
} from "../../../utils/catacombs/RoomScanner";

// Blaze puzzle: highlight Blazes by HP, draw connecting lines, send "Blaze Done!"
// party message when cleared. Ported from NoammAddons' BlazeSolver.kt.
//
// Only active while inside the Blaze room (detected by RoomScanner). Renders via
// Render3D just like the other V5 visuals modules.

const BLAZE_HP_REGEX = /^\[Lv\d+].+Blaze [\d,]+\/([\d,]+)\u2764$/;
const BlazeEntity = Java.type("net.minecraft.world.entity.monster.Blaze");
const ArmorStand = Java.type(
  "net.minecraft.world.entity.decoration.ArmorStand",
);

class BlazeSolver extends ModuleBase {
  constructor() {
    super({
      name: "Blaze Solver",
      subcategory: "Catacombs",
      description: "Highlights Blazes by HP and draws connecting lines.",
      tooltip: "Highlights Blazes by HP and draws connecting lines.",
      showEnabledToggle: false,
    });

    this.blazes = [];
    this.hpMap = {};
    this.inBlaze = false;
    this.reversed = false;
    this.lastBlazeCount = 10;

    this.on("tick", () => {
      // Sync the module state to the Puzzle Solvers toggle. One boolean
      // compare per tick; the actual solver logic runs only when enabled.
      if (this.enabled !== puzzleSettings.blaze)
        this.toggle(puzzleSettings.blaze);
      this.onTick();
    });
    this.when(
      () => this.enabled,
      "postRenderWorld",
      () => this.onRenderWorld(),
    );

    onRoomEnter((name) => {
      if (name !== "Blaze") return;
      this.inBlaze = true;
      this.reversed = name === "Lower Blaze";
    });
    onRoomExit((name) => {
      if (name !== "Blaze") return;
      this.reset();
    });
  }

  onEnable() {
    this.blazes = [];
    this.hpMap = {};
    this.lastBlazeCount = 10;
  }

  onDisable() {
    this.reset();
  }

  reset() {
    this.blazes = [];
    this.hpMap = {};
    this.inBlaze = false;
    this.reversed = false;
    this.lastBlazeCount = 10;
  }

  getBlazes() {
    try {
      return World.getAllEntitiesOfType(BlazeEntity) || [];
    } catch (e) {
      return [];
    }
  }

  getArmorStands() {
    try {
      return World.getAllEntitiesOfType(ArmorStand) || [];
    } catch (e) {
      return [];
    }
  }

  onTick() {
    if (!this.enabled) return;
    if (!this.inBlaze) return;

    const blazes = this.getBlazes();
    if (blazes.length === 0) {
      if (this.lastBlazeCount === 1) {
        if (puzzleSettings.blazeDoneMessage) {
          ChatLib.command("party msg &aBlaze Done!");
        }
        this.lastBlazeCount = 0;
      }
      return;
    }

    this.blazes = [];
    this.hpMap = {};

    const stands = this.getArmorStands();
    for (const stand of stands) {
      const name = ChatLib.removeFormatting(String(stand.getName?.() ?? ""));
      const match = BLAZE_HP_REGEX.exec(name);
      if (!match) continue;

      const hp = parseInt(match[1].replace(/,/g, ""), 10);
      if (Number.isNaN(hp)) continue;

      const bx = stand.getX();
      const by = stand.getY();
      const bz = stand.getZ();
      let nearest = null;
      let nearestDistSq = Infinity;
      for (const b of blazes) {
        const uuid = String(b.getUUID());
        if (
          this.blazes.includes(b) ||
          Object.prototype.hasOwnProperty.call(this.hpMap, uuid)
        )
          continue;
        const dx = b.getX() - bx;
        const dy = b.getY() - by;
        const dz = b.getZ() - bz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = b;
        }
      }
      if (!nearest) continue;

      this.hpMap[nearest.getUUID().toString()] = hp;
      this.blazes.push(nearest);
    }

    this.blazes.sort(
      (a, b) =>
        this.hpMap[a.getUUID().toString()] - this.hpMap[b.getUUID().toString()],
    );
    if (this.reversed) this.blazes.reverse();

    this.lastBlazeCount = this.blazes.length;
  }

  onRenderWorld() {
    if (!this.enabled || !this.inBlaze || this.blazes.length === 0) return;

    const count = Math.min(puzzleSettings.blazeCount, this.blazes.length);
    for (let i = 0; i < count; i++) {
      const b = this.blazes[i];
      if (!b || b.isRemoved?.() || b.isDead?.()) continue;
      Render3D.drawHitboxes([b], this.getBlazeColor(i), 2, false);
    }

    for (let i = 1; i < count; i++) {
      const prev = this.blazes[i - 1];
      const curr = this.blazes[i];
      if (!prev || !curr || prev.isRemoved?.() || curr.isRemoved?.()) continue;
      const start = new Vec3d(
        prev.getX(),
        prev.getY() + prev.getEyeHeight() / 2,
        prev.getZ(),
      );
      const end = new Vec3d(
        curr.getX(),
        curr.getY() + curr.getEyeHeight() / 2,
        curr.getZ(),
      );
      Render3D.drawLine(
        start,
        end,
        this.toRenderColor(puzzleSettings.lineColor),
        2,
        false,
      );
    }
  }

  getBlazeColor(index) {
    switch (index) {
      case 0:
        return this.toRenderColor(puzzleSettings.firstBlazeColor);
      case 1:
        return this.toRenderColor(puzzleSettings.secondBlazeColor);
      default:
        return this.toRenderColor(puzzleSettings.thirdBlazeColor);
    }
  }

  toRenderColor(color) {
    return new RenderColor(
      color.getRed(),
      color.getGreen(),
      color.getBlue(),
      color.getAlpha(),
    );
  }
}

new BlazeSolver();
