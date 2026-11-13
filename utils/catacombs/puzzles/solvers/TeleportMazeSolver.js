// Teleport Maze puzzle. Ported from NoammAddons' TeleportMazeSolver.kt.
// Each teleport tells us which pads are wrong; the pad whose direction best matches every teleport so far is shown.

import { puzzleSettings } from '../PuzzleSettings';
import { drawBlock } from '../PuzzleRender';
import { getBlockNameAt, getRealCoord } from '../../scan/DungeonScanUtils';
import { num } from '../PuzzleUtils';

const PORTAL_FRAME = 'minecraft:end_portal_frame';

const read = (obj, name) => (typeof obj[name] === 'function' ? obj[name]() : obj[name]);

// Kotlin's Double.toInt() truncates toward zero.
const toInt = (value) => Math.trunc(value);

export function getAngleDiff(dx, dz, yaw) {
    const yawRad = (yaw * Math.PI) / 180;
    const lookX = -Math.sin(yawRad);
    const lookZ = Math.cos(yawRad);

    const dist = Math.sqrt(dx * dx + dz * dz);
    const targetX = dx / dist;
    const targetZ = dz / dist;

    const dot = Math.max(-1, Math.min(1, lookX * targetX + lookZ * targetZ));
    return (Math.acos(dot) * 180) / Math.PI;
}

const makePad = (pos) => ({ pos, cellX: 0, cellZ: 0, totalAngle: 0, blacklisted: false });

export const TeleportMazeSolver = {
    name: 'Teleport Maze',
    enabled: () => puzzleSettings.tpmaze,

    inTpMaze: false,
    minX: null,
    minZ: null,
    cells: null,
    orderedPads: null,
    room: null,
    ready: false,

    onRoomEnter(room) {
        if (room.name !== 'Teleport Maze') return;
        this.room = room;
        this.ready = false;
        this.trySetup();
    },

    onRoomExit() {
        this.reset();
    },

    onTick() {
        if (this.room !== null && !this.ready) this.trySetup();
    },

    trySetup() {
        if (this.room === null || this.room.rotation === null) return;
        this.ready = true;

        const rotation = 360 - this.room.rotation;
        const center = this.room.centerPos;
        const first = getRealCoord({ x: 0, y: 69, z: -3 }, center, rotation);
        if (getBlockNameAt(first.x, first.y, first.z) !== PORTAL_FRAME) return;

        this.inTpMaze = true;
        this.scan(center);
    },

    scan(center) {
        const pads = [];
        for (let dx = 0; dx <= 31; dx++) {
            for (let dz = 0; dz <= 31; dz++) {
                const x = center.x + dx - 16;
                const z = center.z + dz - 16;
                if (getBlockNameAt(x, 69, z) !== PORTAL_FRAME) continue;
                pads.push(makePad({ x, y: 69, z }));
            }
        }
        if (pads.length === 0) return;

        this.minX = Math.min(...pads.map((pad) => pad.pos.x));
        this.minZ = Math.min(...pads.map((pad) => pad.pos.z));

        this.cells = [];
        for (let i = 0; i < 9; i++) this.cells.push({ xIndex: Math.trunc(i / 3), zIndex: i % 3, pads: [] });

        for (const pad of pads) {
            pad.cellX = Math.trunc((pad.pos.x - this.minX) / 8);
            pad.cellZ = Math.trunc((pad.pos.z - this.minZ) / 8);
            const index = Math.max(0, Math.min(8, pad.cellX * 3 + pad.cellZ));
            this.cells[index].pads.push(pad);
        }
    },

    onRender() {
        if (!this.inTpMaze || this.cells === null) return;

        const top = this.orderedPads !== null && this.orderedPads.length >= 2 ? this.orderedPads.slice(0, 2) : null;
        if (top !== null && top[0].totalAngle !== top[1].totalAngle) {
            drawBlock(top[0].pos.x, top[0].pos.y, top[0].pos.z, puzzleSettings.correctTpPadColor, true);
        }

        for (const cell of this.cells) {
            for (const pad of cell.pads) {
                if (pad.blacklisted) drawBlock(pad.pos.x, pad.pos.y, pad.pos.z, puzzleSettings.wrongTpPadColor);
            }
        }
    },

    // ClientboundPlayerPositionPacket, seen before the game applies it, so the player is still on the old pad.
    onPacket(packet) {
        if (!this.inTpMaze) return;

        const change = read(packet, 'change');
        const position = read(change, 'position');
        const px = num(position.x);
        const py = num(position.y);
        const pz = num(position.z);
        if (px % 0.5 !== 0 || py !== 69.5 || pz % 0.5 !== 0) return;

        const oldPad = this.getPadNear(Number(Player.getX()), Number(Player.getZ()));
        if (oldPad === null) return;
        const newPad = this.getPadNear(px, pz);
        if (newPad === null) return;
        if (this.isPadInStartOrEndCell(newPad)) return;

        newPad.blacklisted = true;
        oldPad.blacklisted = true;

        this.calcPadAngles(px, pz, Number(read(change, 'yRot')));
    },

    calcPadAngles(px, pz, yaw) {
        if (this.cells === null) return;

        const current = [];
        for (const cell of this.cells) {
            for (const pad of cell.pads) {
                if (this.isPadInStartOrEndCell(pad) || pad.blacklisted) continue;
                pad.totalAngle += getAngleDiff(pad.pos.x + 0.5 - px, pad.pos.z + 0.5 - pz, yaw);
                current.push(pad);
            }
        }

        this.orderedPads = current
            .map((pad, index) => ({ pad, index }))
            .sort((a, b) => a.pad.totalAngle - b.pad.totalAngle || a.index - b.index)
            .map((item) => item.pad);
    },

    getCellAt(x, z) {
        if (this.minX === null || this.minZ === null || this.cells === null) return null;

        const xi = toInt(x);
        const zi = toInt(z);
        if (xi < this.minX || xi > this.minX + 23 || zi < this.minZ || zi > this.minZ + 23) return null;

        const cellX = Math.trunc((xi - this.minX) / 8);
        const cellZ = Math.trunc((zi - this.minZ) / 8);
        return this.cells.find((cell) => cell.xIndex === cellX && cell.zIndex === cellZ) ?? null;
    },

    getPadNear(x, z) {
        const cell = this.getCellAt(x, z);
        if (cell === null) return null;
        return cell.pads.find((pad) => Math.abs(x - (pad.pos.x + 0.5)) + Math.abs(z - (pad.pos.z + 0.5)) <= 3.0) ?? null;
    },

    isPadInStartOrEndCell(pad) {
        if (this.cells === null) return false;
        const middle = this.cells[4];
        if (middle !== undefined && middle.pads.includes(pad)) return true;

        for (const cell of this.cells) {
            if (cell !== middle && cell.pads.length === 1 && cell.pads.includes(pad)) return true;
        }
        return false;
    },

    reset() {
        this.inTpMaze = false;
        this.minX = null;
        this.minZ = null;
        this.cells = null;
        this.orderedPads = null;
        this.room = null;
        this.ready = false;
    },
};
