// Creeper Beams puzzle. Ported from NoammAddons' CreeperBeamSolver.kt.
// Draws each beam's two lanterns (and a line between them) while the pair is still lit.

import { puzzleSettings, rgba } from '../PuzzleSettings';
import { drawBlock, drawLine } from '../PuzzleRender';
import { loadAsset } from '../PuzzleData';
import { getBlockNameAt, getRealCoord } from '../../scan/DungeonScanUtils';

const COLOR_POOL = [
    rgba(255, 0, 0),
    rgba(0, 255, 0),
    rgba(0, 0, 255),
    rgba(255, 255, 0),
    rgba(0, 255, 255),
    rgba(255, 200, 0),
    rgba(255, 255, 255),
    rgba(255, 0, 255),
];

const SEA_LANTERN = 'minecraft:sea_lantern';
export const isBeamBlock = (name) => name === 'minecraft:prismarine' || name === SEA_LANTERN;

export const CreeperBeamSolver = {
    name: 'Creeper Beams',
    enabled: () => puzzleSettings.creeper,

    inRoom: false,
    room: null,
    solved: false,
    beams: [],

    onRoomEnter(room) {
        if (room.name !== 'Creeper Beams') return;
        this.inRoom = true;
        this.room = room;
        this.solved = false;
        this.trySolve();
    },

    onRoomExit() {
        this.reset();
    },

    onTick() {
        if (this.inRoom && !this.solved) this.trySolve();
    },

    trySolve() {
        if (this.room === null || this.room.rotation === null) return;
        const rotation = 360 - this.room.rotation + 180;
        const center = this.room.centerPos;

        const pairs = loadAsset('creeperBeamSolutions.json');
        this.solved = true;
        this.beams = [];
        if (pairs === null) return;

        let colorIndex = 0;
        for (const pair of pairs) {
            if (colorIndex >= COLOR_POOL.length) colorIndex = 0;

            const start = getRealCoord({ x: pair[0][0], y: pair[0][1], z: pair[0][2] }, center, rotation);
            const end = getRealCoord({ x: pair[1][0], y: pair[1][1], z: pair[1][2] }, center, rotation);

            if (!isBeamBlock(getBlockNameAt(start.x, start.y, start.z)) || !isBeamBlock(getBlockNameAt(end.x, end.y, end.z))) continue;

            this.beams.push({ start, end, color: COLOR_POOL[colorIndex++] });
        }
    },

    onRender() {
        if (!this.inRoom) return;

        for (const beam of this.beams) {
            const startName = getBlockNameAt(beam.start.x, beam.start.y, beam.start.z);
            const endName = getBlockNameAt(beam.end.x, beam.end.y, beam.end.z);
            if (startName !== SEA_LANTERN && endName !== SEA_LANTERN) continue;

            drawBlock(beam.start.x, beam.start.y, beam.start.z, beam.color, puzzleSettings.phase);
            drawBlock(beam.end.x, beam.end.y, beam.end.z, beam.color, puzzleSettings.phase);
            if (puzzleSettings.renderLines) {
                drawLine(beam.start.x + 0.5, beam.start.y + 0.5, beam.start.z + 0.5, beam.end.x + 0.5, beam.end.y + 0.5, beam.end.z + 0.5, beam.color);
            }
        }
    },

    reset() {
        this.inRoom = false;
        this.room = null;
        this.solved = false;
        this.beams = [];
    },
};
