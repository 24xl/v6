import { chat } from '../Chat';
import { Swift } from '../pathfinder/SwiftIntegration';
import { CombatWalker } from './CombatWalker';

const SEARCH_TIMEOUT_MS = 2500;
const SEARCH_EMPTY_GRACE_MS = 1000;
const START_OFFSETS = [
    [0, 0, 0],
    [0, 1, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
];

class CombatPathNavigator {
    constructor() {
        this.searching = false;
        this.callback = null;
        this.tickRegister = null;
        this.searchStartedAt = 0;
        this.emptySince = 0;
        this.maxCompute = 500000;
        this.variantSeed = 0;
        this.debug = false;
    }

    setDebug(enabled) {
        this.debug = !!enabled;
    }

    setMaxCompute(maxCompute) {
        const value = Number(maxCompute);
        if (Number.isFinite(value) && value > 0) this.maxCompute = Math.floor(value);
    }

    log(message) {
        if (this.debug) chat('&9[CombatNav] &f' + message);
    }

    findPath(goals, onComplete, options = {}) {
        const end = this.normalizeGoals(goals);
        if (!end.length) {
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }

        const avoidRadius = Math.max(1, Math.floor(Number.isFinite(options.avoidRadius) ? options.avoidRadius : 2));
        this.addAvoidPoints(options.avoidPoints, avoidRadius);

        this.callback = typeof onComplete === 'function' ? onComplete : null;
        this.emptySince = 0;
        this.searchStartedAt = Date.now();
        this.searching = true;
        this.startTick();

        if (!Swift.SwiftPath(this.buildStarts(), end, false, this.variantSeed, this.maxCompute)) {
            this.searching = false;
            this.log('search did not start');
            if (!CombatWalker.isActive()) this.finish(false);
        }
    }

    onTick() {
        if (this.searching) {
            if (Swift.isSearching()) {
                if (Date.now() - this.searchStartedAt > SEARCH_TIMEOUT_MS) {
                    this.searching = false;
                    this.log('search timed out');
                }
            } else {
                const result = Swift.getResult();
                if (result) {
                    const nodes = result.path?.length ? result.path : result.keynodes;
                    this.searching = false;
                    if (nodes?.length) {
                        CombatWalker.setPath(result);
                        this.log('following ' + nodes.length + ' nodes');
                    }
                } else if (!this.emptySince) {
                    this.emptySince = Date.now();
                } else if (Date.now() - this.emptySince > SEARCH_EMPTY_GRACE_MS) {
                    this.searching = false;
                }
            }
        }

        if (CombatWalker.isActive()) {
            const status = CombatWalker.tick();
            if (status === 'ARRIVED') this.finish(true);
            else if (status === 'STUCK' && !this.searching) this.finish(false);
            return;
        }

        if (!this.searching) this.finish(false);
    }

    isPathing() {
        return this.searching || CombatWalker.isActive();
    }

    isFollowing() {
        return CombatWalker.isActive();
    }

    resetPath() {
        this.searching = false;
        this.callback = null;
        this.stopTick();
        CombatWalker.stop();
        Swift.clear();
    }

    finish(success) {
        const callback = this.callback;
        this.callback = null;
        this.searching = false;
        this.stopTick();
        CombatWalker.stop();
        Swift.clear();
        if (typeof callback === 'function') callback(success);
    }

    startTick() {
        if (this.tickRegister) return;
        this.tickRegister = register('tick', () => this.onTick());
    }

    stopTick() {
        if (!this.tickRegister) return;
        this.tickRegister.unregister();
        this.tickRegister = null;
    }

    buildStarts() {
        const x = Math.floor(Player.getX());
        const y = Math.floor(Player.getY());
        const z = Math.floor(Player.getZ());
        return START_OFFSETS.map((offset) => [x + offset[0], y + offset[1], z + offset[2]]);
    }

    normalizeGoals(goals) {
        if (!Array.isArray(goals)) return [];
        const result = [];
        for (const goal of goals) {
            const x = Array.isArray(goal) ? goal[0] : goal?.x;
            const y = Array.isArray(goal) ? goal[1] : goal?.y;
            const z = Array.isArray(goal) ? goal[2] : goal?.z;
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                result.push([Math.floor(x), Math.floor(y), Math.floor(z)]);
            }
        }
        return result;
    }

    addAvoidPoints(points, radius) {
        if (!Array.isArray(points)) return;
        for (const point of points) {
            const x = Array.isArray(point) ? point[0] : point?.x;
            const y = Array.isArray(point) ? point[1] : point?.y;
            const z = Array.isArray(point) ? point[2] : point?.z;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
            Swift.addTransientAvoidPoint(x, y, z, radius, 1000, 4);
        }
    }
}

export const CombatNavigator = new CombatPathNavigator();
