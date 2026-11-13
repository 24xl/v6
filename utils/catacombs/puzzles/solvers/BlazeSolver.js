// Blaze puzzle. Ported from NoammAddons' BlazeSolver.kt.
// Kill order = ascending max health; "Lower Blaze" is reversed. Active only inside the two Blaze rooms.

import { ArmorStandEntity } from '../../../Constants';
import { puzzleSettings } from '../PuzzleSettings';
import { drawEntityBox, drawLine } from '../PuzzleRender';
import { javaListToArray } from '../PuzzleUtils';

const BlazeClass = net.minecraft.world.entity.monster.Blaze;

const HP_PATTERN = /^\[Lv\d+\].+Blaze [\d,]+\/([\d,]+)\u2764$/;

// "[Lv15] Blaze 1,000/2,000❤" -> 2000, or null if the name is not a blaze health tag.
export function parseBlazeMaxHealth(name) {
    const match = HP_PATTERN.exec(name);
    if (!match) return null;
    const health = parseInt(match[1].split(',').join(''), 10);
    return Number.isNaN(health) ? null : health;
}

// Stable ascending sort by health, optionally reversed (Lower Blaze).
export function orderBlazes(entries, reversed) {
    const sorted = entries
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.health - b.entry.health || a.index - b.index)
        .map((item) => item.entry);
    return reversed ? sorted.reverse() : sorted;
}

export const BlazeSolver = {
    name: 'Blaze',
    enabled: () => puzzleSettings.blaze,

    inBlaze: false,
    reversed: false,
    lastBlazeCount: 10,
    blazes: [],
    healthById: new Map(),

    onRoomEnter(room) {
        if (!room.name.includes('Blaze')) return;
        this.inBlaze = true;
        this.reversed = room.name.toLowerCase() === 'lower blaze';
        this.lastBlazeCount = 10;
    },

    onRoomExit() {
        this.reset();
    },

    onTick() {
        if (!this.inBlaze) return;

        const level = World.getWorld();
        const found = [];
        const seen = new Set();

        for (const stand of World.getAllEntitiesOfType(ArmorStandEntity)) {
            const health = parseBlazeMaxHealth(ChatLib.removeFormatting(String(stand.getName())));
            if (health === null) continue;

            const area = stand.toMC().getBoundingBox().expandTowards(0, -2, 0);
            const blaze = javaListToArray(level.getEntitiesOfClass(BlazeClass, area))[0];
            if (blaze === undefined) continue;

            const id = Number(blaze.getId());
            if (seen.has(id)) continue;
            seen.add(id);
            found.push({ blaze, health, id });
        }

        const ordered = orderBlazes(found, this.reversed);
        this.blazes = ordered.map((entry) => entry.blaze);

        if (this.blazes.length === 0 && this.lastBlazeCount === 1) {
            if (puzzleSettings.blazeDoneMessage) ChatLib.say('/pc Blaze Done!');
            this.lastBlazeCount = 0;
        }
        this.lastBlazeCount = this.blazes.length;
    },

    onRender() {
        if (!this.inBlaze || this.blazes.length === 0) return;

        const count = puzzleSettings.blazeCount;
        const colors = [puzzleSettings.firstBlazeColor, puzzleSettings.secondBlazeColor, puzzleSettings.thirdBlazeColor];

        // Noam recolours the glow of the first N blazes; here each gets a hitbox in the same colour.
        for (let i = 0; i < this.blazes.length && i < count; i++) {
            drawEntityBox(this.blazes[i], colors[Math.min(i, 2)], 2, true);
        }

        for (let i = 1; i < this.blazes.length && i < count; i++) {
            const prev = this.blazes[i - 1];
            const current = this.blazes[i];
            drawLine(
                Number(prev.getX()),
                Number(prev.getY()) + Number(prev.getBbHeight()) / 2,
                Number(prev.getZ()),
                Number(current.getX()),
                Number(current.getY()) + Number(current.getBbHeight()) / 2,
                Number(current.getZ()),
                puzzleSettings.lineColor
            );
        }
    },

    reset() {
        this.inBlaze = false;
        this.reversed = false;
        this.blazes = [];
        this.lastBlazeCount = 10;
    },
};
