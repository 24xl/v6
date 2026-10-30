import { chat } from '../Chat';
import { isLineClear } from '../Raytrace';
import { Vec3d } from '../Constants';

const DEFAULT_MAX_NODES = 50000;
const DEFAULT_TIMEOUT_MS = 250;
const SOFT_TIMEOUT_MS = 150;

function heuristic(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function dist(a, b) {
    return heuristic(a, b);
}

function key(x, y, z) {
    return `${x},${y},${z}`;
}

function isWalkable(x, y, z) {
    const block = World.getBlockAt(x, y, z);
    if (!block) return false;
    const id = block.type?.getID?.() ?? 0;
    if (id !== 0) return false;
    const below = World.getBlockAt(x, y - 1, z);
    const belowId = below?.type?.getID?.() ?? 0;
    if (belowId === 0) return false;
    return true;
}

function hasLineOfSight(a, b) {
    try {
        return isLineClear(a.x + 0.5, a.y + 1, a.z + 0.5, b.x + 0.5, b.y + 1, b.z + 0.5, -99999, -99999, -99999);
    } catch (e) {
        return false;
    }
}

class ExperimentalPathfinder {
    constructor() {
        this.searching = false;
        this.callback = null;
        this.startTime = 0;
        this.maxNodes = DEFAULT_MAX_NODES;
        this.timeoutMs = DEFAULT_TIMEOUT_MS;
        this.softTimeoutMs = SOFT_TIMEOUT_MS;
        this.losCheckDistance = 4;
    }

    configure(options = {}) {
        if (Number.isFinite(options.maxNodes)) this.maxNodes = Math.floor(options.maxNodes);
        if (Number.isFinite(options.timeoutMs)) this.timeoutMs = options.timeoutMs;
        if (Number.isFinite(options.losCheckDistance)) this.losCheckDistance = options.losCheckDistance;
    }

    findPath(startPos, goals, onComplete, options = {}) {
        if (this.searching) {
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }
        const start = {
            x: Math.floor(startPos[0]),
            y: Math.floor(startPos[1]),
            z: Math.floor(startPos[2])
        };
        const goalNodes = (goals || []).map(g => ({
            x: Math.floor(Array.isArray(g) ? g[0] : g.x),
            y: Math.floor(Array.isArray(g) ? g[1] : g.y),
            z: Math.floor(Array.isArray(g) ? g[2] : g.z)
        })).filter(g => isWalkable(g.x, g.y, g.z));

        if (!goalNodes.length) {
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }

        this.searching = true;
        this.callback = typeof onComplete === 'function' ? onComplete : null;
        this.startTime = Date.now();

        const open = [];
        const closed = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = key(start.x, start.y, start.z);
        gScore.set(startKey, 0);
        fScore.set(startKey, heuristic(start, goalNodes[0]));
        open.push({ node: start, f: fScore.get(startKey) });
        cameFrom.set(startKey, null);

        let nodesExpanded = 0;
        let foundGoal = null;

        const getNodeKey = n => key(n.x, n.y, n.z);

        while (open.length > 0) {
            if (Date.now() - this.startTime > this.timeoutMs) {
                this.searching = false;
                if (typeof this.callback === 'function') this.callback(false);
                return;
            }
            if (nodesExpanded >= this.maxNodes) {
                this.searching = false;
                if (typeof this.callback === 'function') this.callback(false);
                return;
            }

            open.sort((a, b) => a.f - b.f);
            const current = open.shift().node;
            const currentKey = getNodeKey(current);
            nodesExpanded++;

            if (closed.has(currentKey)) continue;
            closed.add(currentKey);

            for (const goal of goalNodes) {
                if (current.x === goal.x && current.y === goal.y && current.z === goal.z) {
                    foundGoal = current;
                    break;
                }
            }
            if (foundGoal) break;

            const neighbors = this.getNeighbors(current);
            for (const nb of neighbors) {
                if (!isWalkable(nb.x, nb.y, nb.z)) continue;
                const nbKey = getNodeKey(nb);
                if (closed.has(nbKey)) continue;

                const currentG = gScore.get(currentKey) ?? Infinity;
                let tentativeG;

                const parentKey = cameFrom.get(currentKey);
                const parent = parentKey ? this.nodeFromKey(parentKey) : null;

                if (parent && Math.abs(current.y - nb.y) !== 0 && dist(parent, nb) <= this.losCheckDistance && hasLineOfSight(parent, nb)) {
                    const parentG = gScore.get(parentKey) ?? Infinity;
                    tentativeG = parentG + dist(parent, nb);
                } else {
                    tentativeG = currentG + dist(current, nb);
                }

                if (tentativeG < (gScore.get(nbKey) ?? Infinity)) {
                    cameFrom.set(nbKey, currentKey);
                    gScore.set(nbKey, tentativeG);
                    const h = Math.min(...goalNodes.map(g => heuristic(nb, g)));
                    const f = tentativeG + h;
                    fScore.set(nbKey, f);
                    open.push({ node: nb, f });
                }
            }
        }

        this.searching = false;
        if (!foundGoal) {
            if (typeof this.callback === 'function') this.callback(false);
            return;
        }

        const path = [];
        let curKey = getNodeKey(foundGoal);
        while (curKey) {
            const node = this.nodeFromKey(curKey);
            if (node) path.unshift({ x: node.x + 0.5, y: node.y, z: node.z + 0.5 });
            curKey = cameFrom.get(curKey);
        }

        const result = {
            path: path.map(p => ({ x: p.x, y: p.y, z: p.z })),
            keynodes: path
        };
        if (typeof this.callback === 'function') this.callback(true, result);
    }

    nodeFromKey(k) {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z };
    }

    getNeighbors(node) {
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
                    neighbors.push({ x: node.x + dx, y: node.y + dy, z: node.z + dz });
                }
            }
        }
        return neighbors;
    }

    isSearching() {
        return this.searching;
    }
}

export const ExperimentalPathfinderInstance = new ExperimentalPathfinder();
