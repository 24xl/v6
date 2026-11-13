// Boulder puzzle. Ported from NoammAddons' BoulderSolver.kt.
// The room layout is read as a 7x6 grid of air/solid cells, looked up in assets/boulderSolutions.json.

import { puzzleSettings } from '../PuzzleSettings';
import { drawBlock, drawCenteredBox } from '../PuzzleRender';
import { loadAsset } from '../PuzzleData';
import { isAirAt, samePos } from '../PuzzleUtils';
import { getBlockNameAt, getRealCoord } from '../../scan/DungeonScanUtils';

const SX = -9;
const SY = 65;
const SZ = -9;

// Builds the layout key Noam uses: for z 0..5, x 0..6 -> "0" if the sampled block is air, else "1".
export function boulderPattern(isAir) {
    let pattern = '';
    for (let z = 0; z <= 5; z++) {
        for (let x = 0; x <= 6; x++) pattern += isAir(SX + x * 3, SY, SZ + z * 3) ? '0' : '1';
    }
    return pattern;
}

export const isBoulderClickBlock = (name) => name.endsWith('_button') || name === 'minecraft:lever' || name.endsWith('_wall_sign');
export const isChestBlock = (name) => name === 'minecraft:chest' || name === 'minecraft:trapped_chest';

export const BoulderSolver = {
    name: 'Boulder',
    enabled: () => puzzleSettings.boulder,

    inBoulder: false,
    room: null,
    solved: false,
    solution: [],

    onRoomEnter(room) {
        if (room.name !== 'Boulder') return;
        this.inBoulder = true;
        this.room = room;
        this.solved = false;
        this.trySolve();
    },

    onRoomExit() {
        this.reset();
    },

    // The room's rotation can arrive a moment after entering, so keep trying until it is known.
    onTick() {
        if (this.inBoulder && !this.solved) this.trySolve();
    },

    trySolve() {
        if (this.room === null || this.room.rotation === null) return;
        const rotation = 360 - this.room.rotation + 180;
        const center = this.room.centerPos;

        const solutions = loadAsset('boulderSolutions.json');
        this.solved = true;
        if (solutions === null) return;

        const pattern = boulderPattern((x, y, z) => {
            const pos = getRealCoord({ x, y, z }, center, rotation);
            return isAirAt(pos.x, pos.y, pos.z);
        });

        const entries = solutions[pattern];
        if (entries === undefined) return;

        this.solution = entries.map((sol) => ({
            box: getRealCoord({ x: Math.trunc(sol[0]), y: SY, z: Math.trunc(sol[1]) }, center, rotation),
            click: getRealCoord({ x: Math.trunc(sol[2]), y: SY, z: Math.trunc(sol[3]) }, center, rotation),
        }));
    },

    onRender() {
        if (!this.inBoulder || this.solution.length === 0) return;
        if (puzzleSettings.showAll) this.solution.forEach((entry) => this.renderEntry(entry));
        else this.renderEntry(this.solution[0]);
    },

    renderEntry(entry) {
        drawCenteredBox(entry.box.x + 0.5, entry.box.y - 1.0, entry.box.z + 0.5, 3.0, 3.0, puzzleSettings.boxColor, true);
        drawBlock(entry.click.x, entry.click.y, entry.click.z, puzzleSettings.clickColor, true);
    },

    onInteract(pos) {
        if (!this.inBoulder) return;
        const name = getBlockNameAt(pos.x, pos.y, pos.z);
        if (isBoulderClickBlock(name)) {
            const index = this.solution.findIndex((entry) => samePos(entry.click, pos));
            if (index !== -1) this.solution.splice(index, 1);
        } else if (isChestBlock(name)) {
            this.reset();
        }
    },

    reset() {
        this.inBoulder = false;
        this.room = null;
        this.solved = false;
        this.solution = [];
    },
};
