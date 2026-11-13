// Ice Path puzzle. Ported from NoammAddons' IcePathSolver.kt.
// Slides the silverfish through the ice grid with a BFS and draws the next moves. Only active in "Ice Path".

import { puzzleSettings } from '../PuzzleSettings';
import { drawLine } from '../PuzzleRender';
import { HORIZONTAL } from '../PuzzleUtils';
import { getRealCoord, getStateAt, rotate } from '../../scan/DungeonScanUtils';

const SilverfishClass = net.minecraft.world.entity.monster.Silverfish;
const PhysBox = net.minecraft.world.phys.AABB;

export const GRID_SIZE = 19;
export const MIN_OFFSET = -8;
const GOAL = { x: 7, z: 18 };

const inGrid = (x, z) => x >= 0 && x < GRID_SIZE && z >= 0 && z < GRID_SIZE;

// Slides from "from" in one direction until the next cell is a wall or the edge.
// Returns the stopping cell, or null if it did not move or that cell was already reached.
function slide(grid, parent, from, dir) {
    let steps = 1;
    while (true) {
        const nx = from.x + steps * dir.dx;
        const nz = from.z + steps * dir.dz;
        if (!inGrid(nx, nz) || grid[nz][nx] === 1) break;
        steps++;
    }

    steps--;
    if (steps === 0) return null;

    const finalX = from.x + steps * dir.dx;
    const finalZ = from.z + steps * dir.dz;
    return parent[finalZ][finalX] !== null ? null : { x: finalX, z: finalZ };
}

// grid[z][x]: 1 = solid, 0 = free. Returns the list of stopping cells from start to the goal, or [].
export function solveIcePath(grid, start) {
    const queue = [start];
    const parent = [];
    for (let z = 0; z < GRID_SIZE; z++) {
        const row = [];
        for (let x = 0; x < GRID_SIZE; x++) row.push(null);
        parent.push(row);
    }
    parent[start.z][start.x] = start;

    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];

        for (const dir of HORIZONTAL) {
            const next = slide(grid, parent, current, dir);
            if (next === null) continue;

            queue.push(next);
            parent[next.z][next.x] = current;

            if (next.x === GOAL.x && next.z === GOAL.z) {
                const path = [];
                let tmp = next;
                while (tmp !== null && !(tmp.x === start.x && tmp.z === start.z)) {
                    path.unshift(tmp);
                    tmp = parent[tmp.z][tmp.x];
                }
                path.unshift(start);
                return path;
            }
        }
    }
    return [];
}

export function isOnSegment(x, z, segment) {
    const padding = 0.8;
    const minX = Math.min(segment.start.x, segment.end.x) - padding;
    const maxX = Math.max(segment.start.x, segment.end.x) + padding;
    const minZ = Math.min(segment.start.z, segment.end.z) - padding;
    const maxZ = Math.max(segment.start.z, segment.end.z) + padding;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

export const IcePathSolver = {
    name: 'Ice Path',
    enabled: () => puzzleSettings.icepath,

    inPath: false,
    room: null,
    center: null,
    rotation: 0,
    grid: null,
    solution: [],
    silverfish: null,
    lastGridPos: null,

    onRoomEnter(room) {
        if (room.name !== 'Ice Path') return;
        this.inPath = true;
        this.room = room;
        this.center = room.centerPos;
        this.setup();
    },

    onRoomExit() {
        this.reset();
    },

    setup() {
        if (this.room === null || this.room.rotation === null) return;
        this.rotation = 360 - this.room.rotation;
        this.grid = this.buildGrid(this.center);
    },

    onTick() {
        if (!this.inPath) return;
        if (this.grid === null) this.setup();
        if (this.grid === null || this.center === null) return;

        const center = this.center;
        let fish = this.silverfish;

        if (fish === null || fish.isRemoved()) {
            const area = new PhysBox(center.x - 10, 67, center.z - 10, center.x + 10, 68, center.z + 10);
            const list = World.getWorld().getEntitiesOfClass(SilverfishClass, area);
            if (list.isEmpty()) return;
            this.silverfish = list.get(0);
            fish = this.silverfish;
        }

        const fx = Number(fish.getX());
        const fz = Number(fish.getZ());
        const gridPos = this.worldToGrid(Math.floor(fx), Math.floor(fz), center);
        if (gridPos === null) return;
        if (this.lastGridPos !== null && gridPos.x === this.lastGridPos.x && gridPos.z === this.lastGridPos.z) return;
        this.lastGridPos = gridPos;

        if (this.solution.length > 0) {
            const current = this.solution[0];
            if (Math.abs(fx - current.end.x) + Math.abs(fz - current.end.z) <= 0.8) {
                this.solution.shift();
                return;
            }
            if (isOnSegment(fx, fz, current)) return;
        }

        this.recalculate(gridPos, center);
    },

    onRender() {
        if (!this.inPath || this.solution.length === 0) return;
        if (this.silverfish !== null && this.silverfish.isRemoved()) return;

        this.solution.forEach((segment, index) => {
            const color = index === 0 ? puzzleSettings.icePathFirstColor : puzzleSettings.icePathColor;
            drawLine(segment.start.x, segment.start.y, segment.start.z, segment.end.x, segment.end.y, segment.end.z, color, 5);
        });
    },

    recalculate(fishPos, center) {
        const path = solveIcePath(this.grid, fishPos);
        if (path.length < 2) return;

        this.solution = [];
        for (let i = 1; i < path.length; i++) {
            this.solution.push({ start: this.gridToWorld(path[i - 1], center), end: this.gridToWorld(path[i], center) });
        }
    },

    buildGrid(center) {
        const grid = [];
        for (let z = 0; z < GRID_SIZE; z++) {
            const row = [];
            for (let x = 0; x < GRID_SIZE; x++) {
                const world = getRealCoord({ x: MIN_OFFSET + x, y: 67, z: MIN_OFFSET + z }, center, this.rotation);
                const state = getStateAt(world.x, world.y, world.z);
                row.push(state === null || state.isAir() ? 0 : 1);
            }
            grid.push(row);
        }
        return grid;
    },

    worldToGrid(blockX, blockZ, center) {
        const rel = rotate({ x: blockX - center.x, y: 0, z: blockZ - center.z }, -this.rotation);
        const gridX = rel.x - MIN_OFFSET;
        const gridZ = rel.z - MIN_OFFSET;
        return inGrid(gridX, gridZ) ? { x: gridX, z: gridZ } : null;
    },

    gridToWorld(point, center) {
        const world = getRealCoord({ x: MIN_OFFSET + point.x, y: 66, z: MIN_OFFSET + point.z }, center, this.rotation);
        return { x: world.x + 0.5, y: 67.5, z: world.z + 0.5 };
    },

    reset() {
        this.inPath = false;
        this.room = null;
        this.center = null;
        this.grid = null;
        this.solution = [];
        this.silverfish = null;
        this.lastGridPos = null;
    },
};
