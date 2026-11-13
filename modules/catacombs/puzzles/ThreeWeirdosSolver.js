import { ModuleBase } from "../../../utils/ModuleBase";
import { Vec3d, BP, Blocks } from "../../../utils/Constants";
import { puzzleSettings } from "../../../utils/catacombs/puzzles/PuzzleSettings";
import {
  onRoomEnter,
  onRoomExit,
  isInRoom,
} from "../../../utils/catacombs/RoomScanner";
import { isInBoss } from "../../../utils/catacombs/DungeonLocation";

// Three Weirdos: scan NPC chat lines against known answer regexes,
// highlight or remove wrong chests, play a sound on the correct one.
// Ported from NoammAddons' ThreeWeirdosSolver.kt.
//
// The chest is 1 block east of the NPC (room-local frame). We don't have the
// room rotation from RoomScanner, so this only works for rotation-0 rooms.
// (TODO: extend RoomScanner with rotation to support all orientations.)

const NPC_REGEX = /\[NPC]\s+(\w+):\s*(.+)/;
const SOLUTIONS = [
  /The reward is not in my chest!/,
  /At least one of them is lying, and the reward is not in .+'s chest.?/,
  /My chest doesn't have the reward. We are all telling the truth.?/,
  /My chest has the reward and I'm telling the truth!/,
  /The reward isn't in any of our chests.?/,
  /Both of them are telling the truth. Also, .+ has the reward in their chest.?/,
];
const WRONG = [
  /One of us is telling the truth!/,
  /They are both telling the truth. The reward isn't in .+'s chest./,
  /We are all telling the truth!/,
  /.+ is telling the truth and the reward is in his chest./,
  /My chest doesn't have the reward. At least one of the others is telling the truth!/,
  /One of the others is lying./,
  /They are both telling the truth, the reward is in .+'s chest./,
  /They are both lying, the reward is in my chest!/,
  /The reward is in my chest./,
  /The reward is not in my chest. They are both lying./,
  /.+ is telling the truth./,
  /My chest has the reward./,
];

const ArmorStand = Java.type(
  "net.minecraft.world.entity.decoration.ArmorStand",
);

class ThreeWeirdosSolver extends ModuleBase {
  constructor() {
    super({
      name: "Three Weirdos Solver",
      subcategory: "Catacombs",
      description: "Highlights the correct chest and removes wrong ones.",
      tooltip: "Highlights the correct chest and removes wrong ones.",
      showEnabledToggle: false,
    });

    this.wrongPositions = new Set();
    this.correctPos = null;
    this.inWeirdos = false;

    this.on("tick", () => {
      if (this.enabled !== puzzleSettings.weirdos)
        this.toggle(puzzleSettings.weirdos);
    });
    this.on("chat", (event) => this.onChat(event));
    this.when(
      () => this.enabled,
      "postRenderWorld",
      () => this.onRenderWorld(),
    );

    onRoomEnter((name) => {
      if (name !== "Three Weirdos") return;
      this.inWeirdos = true;
      this.wrongPositions.clear();
      this.correctPos = null;
    });
    onRoomExit((name) => {
      if (name !== "Three Weirdos") return;
      this.reset();
    });
  }

  onEnable() {
    this.wrongPositions = new Set();
    this.correctPos = null;
    this.inWeirdos = false;
  }

  onDisable() {
    this.reset();
  }

  reset() {
    if (puzzleSettings.removeChests) {
      for (const pos of this.wrongPositions) {
        this.setBlock(pos, Blocks.CHEST.defaultBlockState());
      }
    }
    this.wrongPositions.clear();
    this.correctPos = null;
    this.inWeirdos = false;
  }

  setBlock(pos, state) {
    try {
      Client.getMinecraft().level.setBlockAndUpdate(
        new BP(pos.x, pos.y, pos.z),
        state,
      );
    } catch (e) {
      // chunk not loaded or other error; ignore
    }
  }

  findNPC(name) {
    try {
      const stands = World.getAllEntitiesOfType(ArmorStand) || [];
      for (const stand of stands) {
        const standName = ChatLib.removeFormatting(
          String(stand.getName?.() ?? ""),
        );
        if (standName.includes(name)) return stand;
      }
    } catch (e) {}
    return null;
  }

  onChat(event) {
    if (!this.enabled || !this.inWeirdos) return;
    if (!isInRoom("Three Weirdos")) return;

    const raw =
      event?.message?.getUnformattedText?.() ??
      event?.message?.unformattedText ??
      "";
    const text = ChatLib.removeFormatting(String(raw));
    const match = NPC_REGEX.exec(text);
    if (!match) return;

    const npcName = match[1];
    const npcText = match[2];

    const isSolution = SOLUTIONS.some((r) => r.test(npcText));
    const isWrong = WRONG.some((r) => r.test(npcText));
    if (!isSolution && !isWrong) return;

    const npc = this.findNPC(npcName);
    if (!npc) return;

    const npcX = Math.floor(npc.getX());
    const npcZ = Math.floor(npc.getZ());
    // Chest is 1 block east of the NPC in the room's local frame.
    // Without room rotation we default to rotation-0 (east).
    const chestX = npcX + 1;
    const chestZ = npcZ;
    const chestY = 69;

    if (isSolution) {
      this.correctPos = { x: chestX, y: chestY, z: chestZ };
    } else {
      if (puzzleSettings.removeChests) {
        this.setBlock(
          { x: chestX, y: chestY, z: chestZ },
          Blocks.AIR.defaultBlockState(),
        );
      }
      this.wrongPositions.add({ x: chestX, y: chestY, z: chestZ });
    }
  }

  onRenderWorld() {
    if (!this.enabled || (!this.correctPos && this.wrongPositions.size === 0))
      return;

    const correctColor = new RenderColor(
      puzzleSettings.colorCorrect.getRed(),
      puzzleSettings.colorCorrect.getGreen(),
      puzzleSettings.colorCorrect.getBlue(),
      puzzleSettings.colorCorrect.getAlpha(),
    );
    const wrongColor = new RenderColor(
      puzzleSettings.colorWrong.getRed(),
      puzzleSettings.colorWrong.getGreen(),
      puzzleSettings.colorWrong.getBlue(),
      puzzleSettings.colorWrong.getAlpha(),
    );

    if (this.correctPos) {
      Render3D.drawFilledBox(
        new Vec3d(this.correctPos.x, this.correctPos.y, this.correctPos.z),
        correctColor,
      );
    }

    if (!puzzleSettings.removeChests) {
      const positions = [];
      for (const pos of this.wrongPositions) {
        positions.push(new Vec3d(pos.x, pos.y, pos.z));
      }
      if (positions.length > 0) {
        Render3D.drawFilledBoxes(positions, wrongColor);
      }
    }
  }
}

new ThreeWeirdosSolver();
