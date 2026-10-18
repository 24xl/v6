import { chat } from '../Chat';
import { Swift } from '../pathfinder/SwiftIntegration';
import { startPathExecutor } from '../pathfinder/PathExecutor';
import { CombatWalker } from './CombatWalker';

const STATES = {
    IDLE: 'IDLE',
    SEARCHING: 'SEARCHING',
    FOLLOWING: 'FOLLOWING',
};

const SEARCH_TIMEOUT_MS = 2500;
const SEARCH_EMPTY_GRACE_MS = 1200;
const FAIL_COOLDOWN_MS = 500;
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
        this.state = STATES.IDLE;
        this.callback = null;
        this.tickRegister = null;
        this.searchStartedAt = 0;
        this.emptySince = 0;
        this.lastFailAt = 0;
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
        this.resetPath();

        if (Date.now() - this.lastFailAt < FAIL_COOLDOWN_MS) {
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }

        const end = this.normalizeGoals(goals);
        if (!end.length) {
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }

        const avoidRadius = Math.max(1, Math.floor(Number.isFinite(options.avoidRadius) ? options.avoidRadius : 2));
        this.addAvoidPoints(options.avoidPoints, avoidRadius);

        startPathExecutor();
        if (!Swift.SwiftPath(this.buildStarts(), end, false, this.variantSeed, this.maxCompute)) {
            this.log('search did not start');
            this.lastFailAt = Date.now();
            if (typeof onComplete === 'function') onComplete(false);
            return;
        }

        this.callback = typeof onComplete === 'function' ? onComplete : null;
        this.searchStartedAt = Date.now();
        this.emptySince = 0;
        this.state = STATES.SEARCHING;
        this.startTick();
    }

    onTick() {
        if (this.state === STATES.SEARCHING) {
            if (Swift.isSearching()) {
                if (Date.now() - this.searchStartedAt > SEARCH_TIMEOUT_MS) this.fail('timeout');
                return;
            }

            const result = Swift.getResult();
            if (!result) {
                if (!this.emptySince) this.emptySince = Date.now();
                if (Date.now() - this.emptySince > SEARCH_EMPTY_GRACE_MS || Date.now() - this.searchStartedAt > SEARCH_TIMEOUT_MS) {
                    this.fail('no path');
                }
                return;
            }
            this.emptySince = 0;

            const nodes = result.path?.length ? result.path : result.keynodes;
            if (!nodes?.length) {
                this.fail('empty path');
                return;
            }

            CombatWalker.setPath(result);
            this.state = STATES.FOLLOWING;
            this.log('following ' + nodes.length + ' nodes');
            return;
        }

        if (this.state === STATES.FOLLOWING) {
            const status = CombatWalker.tick();
            if (status === 'ARRIVED') this.finish(true);
            else if (status === 'STUCK' || status === 'IDLE') this.fail('walker ' + status);
        }
    }

    fail(reason) {
        this.log('failed: ' + reason);
        this.finish(false);
    }

    isPathing() {
        return this.state !== STATES.IDLE;
    }

    isFollowing() {
        return this.state === STATES.FOLLOWING;
    }

    resetPath() {
        this.state = STATES.IDLE;
        this.callback = null;
        this.stopTick();
        CombatWalker.stop();
        Swift.clear();
    }

    finish(success) {
        const callback = this.callback;
        this.callback = null;
        this.state = STATES.IDLE;
        if (!success) this.lastFailAt = Date.now();
        this.stopTick();
        CombatWalker.stop();
        Swift.clear();
        if (callback) callback(success);
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
