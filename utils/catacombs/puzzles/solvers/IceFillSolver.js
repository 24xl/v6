// Ice Fill puzzle. Ported from NoammAddons' IceFillSolver.kt.
// Finds the Hamiltonian path through each ice board with the fewest turns, preferring turns that
// stop against a wall. The search itself (solveIceFill) is pure so it can be tested on its own.

import { chat } from '../../../Chat';
import { puzzleSettings } from '../PuzzleSettings';
import { drawLine } from '../PuzzleRender';
import { HORIZONTAL } from '../PuzzleUtils';
import { getBlockNameAt, getRealCoord } from '../../scan/DungeonScanUtils';

// Noam's costs: any turn, a turn that does not stop against a wall, and a turn straight after a turn.
export const ICE_FILL_PENALTIES = Object.freeze({ turn: 1, noWall: 5, doubleTurn: 2 });

const keyOf = (p) => p.x + ',' + p.y + ',' + p.z;

// Direction index into HORIZONTAL: 0 NORTH, 1 EAST, 2 SOUTH, 3 WEST.
function dirBetween(a, b) {
    if (b.x > a.x) return 1;
    if (b.x < a.x) return 3;
    if (b.z > a.z) return 2;
    return 0;
}

// Noam searches on a background coroutine. This runs on the game thread, so each pass has a time budget:
// finding any path may take up to firstMs, improving it up to optimizeMs (best path found so far is kept).
export const ICE_FILL_BUDGET = { firstMs: 1000, optimizeMs: 250 };

// spaces: [{x,y,z}], start/end are members of spaces. Returns the path as an array of positions, or [].
export function solveIceFill(spaces, start, end, budget = ICE_FILL_BUDGET) {
    const count = spaces.length;
    const index = new Map();
    for (let i = 0; i < count; i++) index.set(keyOf(spaces[i]), i);

    const startIndex = index.get(keyOf(start));
    const endIndex = index.get(keyOf(end));
    if (startIndex === undefined || endIndex === undefined) return [];

    // graph[i] = [{ dir, to }] in HORIZONTAL order, like Noam's associateWith { HORIZONTAL.filter { ... } }.
    const graph = [];
    for (let i = 0; i < count; i++) {
        const edges = [];
        for (let d = 0; d < 4; d++) {
            const to = index.get(spaces[i].x + HORIZONTAL[d].dx + ',' + spaces[i].y + ',' + (spaces[i].z + HORIZONTAL[d].dz));
            if (to !== undefined) edges.push({ dir: d, to });
        }
        graph.push(edges);
    }

    const hasNeighbor = (i, d) => index.has(spaces[i].x + HORIZONTAL[d].dx + ',' + spaces[i].y + ',' + (spaces[i].z + HORIZONTAL[d].dz));
    const isBackedByWall = (i, d) => !hasNeighbor(i, d);

    const remainingConnected = (current, visited, visitedCount) => {
        const remaining = count - visitedCount + 1;
        if (remaining <= 1) return true;

        const seen = new Array(count).fill(false);
        const stack = [current];
        seen[current] = true;
        let seenCount = 1;

        while (stack.length > 0) {
            const cur = stack.pop();
            const edges = graph[cur];
            for (let e = 0; e < edges.length; e++) {
                const n = edges[e].to;
                if ((n === current || !visited[n]) && !seen[n]) {
                    seen[n] = true;
                    seenCount++;
                    stack.push(n);
                }
            }
        }
        return seenCount === remaining;
    };

    const pathCost = (fullPath) => {
        if (fullPath.length < 3) return 0;
        let total = 0;
        let prevDir = -1;
        let prevWasTurn = false;
        for (let i = 1; i < fullPath.length; i++) {
            const dir = dirBetween(spaces[fullPath[i - 1]], spaces[fullPath[i]]);
            if (prevDir !== -1 && dir !== prevDir) {
                total += ICE_FILL_PENALTIES.turn;
                if (!isBackedByWall(fullPath[i - 1], prevDir)) total += ICE_FILL_PENALTIES.noWall;
                if (prevWasTurn) total += ICE_FILL_PENALTIES.doubleTurn;
                prevWasTurn = true;
            } else {
                prevWasTurn = false;
            }
            prevDir = dir;
        }
        return total;
    };

    const search = (stopAtFirst, costBound, limitMs) => {
        let bestCost = costBound;
        let bestPath = null;
        const deadline = Date.now() + limitMs;
        let nodes = 0;
        let timedOut = false;

        const visited = new Array(count).fill(false);
        visited[startIndex] = true;
        let visitedCount = 1;
        const tempPath = [startIndex];

        const dfs = (current, lastDir, lastWasTurn, cost) => {
            if (timedOut) return true;
            if ((++nodes & 2047) === 0 && Date.now() > deadline) {
                timedOut = true;
                return true;
            }
            if (cost >= bestCost) return false;

            if (visitedCount === count) {
                if (current === endIndex) {
                    bestCost = cost;
                    bestPath = tempPath.slice();
                    return stopAtFirst;
                }
                return false;
            }
            if (current === endIndex) return false;

            const candidates = [];
            const edges = graph[current];
            for (let e = 0; e < edges.length; e++) {
                if (visited[edges[e].to]) continue;
                const to = edges[e].to;
                let free = 0;
                const nextEdges = graph[to];
                for (let k = 0; k < nextEdges.length; k++) if (!visited[nextEdges[k].to]) free++;
                candidates.push({ dir: edges[e].dir, to, free, order: candidates.length });
            }
            candidates.sort((a, b) => a.free - b.free || (a.dir === lastDir ? 0 : 1) - (b.dir === lastDir ? 0 : 1) || a.order - b.order);

            for (let c = 0; c < candidates.length; c++) {
                const dir = candidates[c].dir;
                const next = candidates[c].to;
                let stepCost = cost;
                let turned = false;
                if (lastDir !== -1 && dir !== lastDir) {
                    turned = true;
                    stepCost += ICE_FILL_PENALTIES.turn;
                    if (!isBackedByWall(current, lastDir)) stepCost += ICE_FILL_PENALTIES.noWall;
                    if (lastWasTurn) stepCost += ICE_FILL_PENALTIES.doubleTurn;
                }
                if (stepCost >= bestCost) continue;

                visited[next] = true;
                visitedCount++;
                tempPath.push(next);

                const stop = remainingConnected(next, visited, visitedCount) && dfs(next, dir, turned, stepCost);

                tempPath.pop();
                visited[next] = false;
                visitedCount--;

                if (stop) return true;
            }
            return false;
        };

        dfs(startIndex, -1, false, 0);
        return bestPath;
    };

    const fallback = search(true, Number.MAX_SAFE_INTEGER, budget.firstMs);
    if (fallback === null) return [];

    const optimized = search(false, pathCost(fallback), budget.optimizeMs);
    return (optimized === null ? fallback : optimized).map((i) => spaces[i]);
}

const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z);

// Groups ice cells into connected clusters (BFS over the four horizontal neighbours), in Noam's order.
export function clusterIce(cells) {
    const all = new Map();
    for (const cell of cells) all.set(keyOf(cell), cell);

    const visited = new Set();
    const clusters = [];
    for (const cell of cells) {
        if (visited.has(keyOf(cell))) continue;

        const cluster = [];
        const queue = [cell];
        visited.add(keyOf(cell));

        for (let head = 0; head < queue.length; head++) {
            const current = queue[head];
            cluster.push(current);
            for (const dir of HORIZONTAL) {
                const next = all.get(current.x + dir.dx + ',' + current.y + ',' + (current.z + dir.dz));
                if (next !== undefined && !visited.has(keyOf(next))) {
                    visited.add(keyOf(next));
                    queue.push(next);
                }
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

const closestTo = (cells, target) => {
    let best = cells[0];
    for (let i = 1; i < cells.length; i++) if (dist2(cells[i], target) < dist2(best, target)) best = cells[i];
    return best;
};

export const IceFillSolver = {
    name: 'Ice Fill',
    enabled: () => puzzleSettings.icefill,

    room: null,
    solved: false,
    puzzles: [],

    onRoomEnter(room) {
        if (room.name !== 'Ice Fill') return;
        this.room = room;
        this.solved = false;
        this.trySolve();
    },

    onRoomExit() {
        this.reset();
    },

    onTick() {
        if (this.room !== null && !this.solved) this.trySolve();
    },

    trySolve() {
        if (this.room === null || this.room.rotation === null) return;
        this.solved = true;

        const started = Date.now();
        this.solve(this.room.centerPos, 360 - this.room.rotation);
        chat('&bIce Fill took ' + (Date.now() - started) + 'ms to solve');
    },

    solve(center, rotation) {
        const checkpoints = [
            getRealCoord({ x: 0, y: 69, z: -8 }, center, rotation),
            getRealCoord({ x: 0, y: 70, z: -3 }, center, rotation),
            getRealCoord({ x: 0, y: 71, z: 4 }, center, rotation),
            getRealCoord({ x: 0, y: 71, z: 11 }, center, rotation),
        ];

        this.puzzles = [];

        const cells = [];
        for (let dx = -22; dx <= 22; dx++) {
            for (let dz = -22; dz <= 22; dz++) {
                for (let dy = 68; dy <= 73; dy++) {
                    const x = center.x + dx;
                    const z = center.z + dz;
                    const name = getBlockNameAt(x, dy, z);
                    if (name !== 'minecraft:ice' && name !== 'minecraft:packed_ice') continue;
                    if (getBlockNameAt(x, dy + 1, z) !== 'minecraft:air') continue;
                    cells.push({ x, y: dy + 1, z });
                }
            }
        }
        if (cells.length === 0) return;

        const clusters = clusterIce(cells);
        const nearest = (cluster) => {
            let min = Infinity;
            for (const cell of cluster) min = Math.min(min, dist2(cell, checkpoints[0]));
            return min;
        };
        const sorted = clusters.map((cluster, i) => ({ cluster, i, key: nearest(cluster) })).sort((a, b) => a.key - b.key || a.i - b.i);

        for (let i = 0; i < sorted.length && i < 3; i++) {
            const spaces = sorted[i].cluster;
            const start = closestTo(spaces, checkpoints[i]);
            const end = closestTo(spaces, checkpoints[i + 1]);
            const path = solveIceFill(spaces, start, end);

            if (path.length > 0) this.puzzles.push(path);
            else chat('&cIceFill: Failed to find path for Puzzle ' + i + '.');
        }
    },

    onRender() {
        for (const path of this.puzzles) {
            for (let i = 1; i < path.length; i++) {
                const prev = path[i - 1];
                const pos = path[i];
                drawLine(prev.x + 0.5, prev.y + 0.01, prev.z + 0.5, pos.x + 0.5, pos.y + 0.01, pos.z + 0.5, puzzleSettings.icefillColor, 5);
            }
        }
    },

    reset() {
        this.room = null;
        this.solved = false;
        this.puzzles = [];
    },
};
