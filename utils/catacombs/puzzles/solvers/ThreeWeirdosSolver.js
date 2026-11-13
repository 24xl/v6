// Three Weirdos puzzle. Ported from NoammAddons' ThreeWeirdosSolver.kt.
// Reads each weirdo's line, works out whether their chest is the right one, and hides or colours the chests.

import { ArmorStandEntity, BP } from '../../../Constants';
import { puzzleSettings } from '../PuzzleSettings';
import { drawBlock } from '../PuzzleRender';
import { samePos } from '../PuzzleUtils';
import { isInBoss } from '../../DungeonLocation';
import scanner from '../../scanner/DungeonScanner';
import { rotate } from '../../scan/DungeonScanUtils';

const NpcRegex = /\[NPC\] (\w+): (.+)/;

const SOLUTIONS = [
    /^The reward is not in my chest!$/,
    /^At least one of them is lying, and the reward is not in .+'s chest.?$/,
    /^My chest doesn't have the reward. We are all telling the truth.?$/,
    /^My chest has the reward and I'm telling the truth!$/,
    /^The reward isn't in any of our chests.?$/,
    /^Both of them are telling the truth. Also, .+ has the reward in their chest.?$/,
];

const WRONG = [
    /^One of us is telling the truth!$/,
    /^They are both telling the truth. The reward isn't in .+'s chest.$/,
    /^We are all telling the truth!$/,
    /^.+ is telling the truth and the reward is in his chest.$/,
    /^My chest doesn't have the reward. At least one of the others is telling the truth!$/,
    /^One of the others is lying.$/,
    /^They are both telling the truth, the reward is in .+'s chest.$/,
    /^They are both lying, the reward is in my chest!$/,
    /^The reward is in my chest.$/,
    /^The reward is not in my chest. They are both lying.$/,
    /^.+ is telling the truth.$/,
    /^My chest has the reward.$/,
];

export function classifyWeirdo(text) {
    if (SOLUTIONS.some((regex) => regex.test(text))) return 'solution';
    if (WRONG.some((regex) => regex.test(text))) return 'wrong';
    return null;
}

const BlockRegistry = net.minecraft.world.level.block.Blocks;

// Same flags Noam uses (19).
const setBlock = (pos, state) => World.getWorld().setBlock(new BP(pos.x, pos.y, pos.z), state, 19);

export const ThreeWeirdosSolver = {
    name: 'Three Weirdos',
    enabled: () => puzzleSettings.weirdos,

    wrongPositions: [],
    correctPos: null,

    inWeirdos() {
        return this.wrongPositions.length > 0 || this.correctPos !== null;
    },

    onChat(text) {
        const room = scanner.currentRoom;
        if (room === null || room.name !== 'Three Weirdos' || room.rotation === null) return;

        const match = NpcRegex.exec(text);
        if (!match) return;
        const npcName = match[1];
        const line = match[2];

        const kind = classifyWeirdo(line);
        if (kind === null) return;

        let stand = null;
        for (const entity of World.getAllEntitiesOfType(ArmorStandEntity)) {
            if (ChatLib.removeFormatting(String(entity.getName())).includes(npcName)) {
                stand = entity;
                break;
            }
        }
        if (stand === null) return;

        const offset = rotate({ x: 1, y: 0, z: 0 }, 360 - room.rotation);
        const chestPos = { x: Math.floor(Number(stand.getX())) + offset.x, y: 69 + offset.y, z: Math.floor(Number(stand.getZ())) + offset.z };

        if (kind === 'solution') {
            this.correctPos = chestPos;
        } else {
            if (puzzleSettings.removeChests) setBlock(chestPos, BlockRegistry.AIR.defaultBlockState());
            if (!this.wrongPositions.some((pos) => samePos(pos, chestPos))) this.wrongPositions.push(chestPos);
        }
    },

    onRender() {
        if (!this.inWeirdos()) return;

        if (this.correctPos !== null) drawBlock(this.correctPos.x, this.correctPos.y, this.correctPos.z, puzzleSettings.colorCorrect);

        if (!puzzleSettings.removeChests) {
            for (const pos of this.wrongPositions) drawBlock(pos.x, pos.y, pos.z, puzzleSettings.colorWrong);
        }
    },

    onInteract(pos) {
        if (!this.inWeirdos()) return;
        if (isInBoss()) return;
        if (this.correctPos !== null && samePos(pos, this.correctPos)) this.reset();
    },

    // Noam also resets when the room's map state flips back to "discovered"; here leaving the room does it.
    onRoomExit(room) {
        if (room.name === 'Three Weirdos') this.reset();
    },

    reset() {
        if (puzzleSettings.removeChests) {
            for (const pos of this.wrongPositions) setBlock(pos, BlockRegistry.CHEST.defaultBlockState());
        }
        this.correctPos = null;
        this.wrongPositions = [];
    },
};
