import { setKeysForStraightLineCoords } from '../player/Movement';
import { isLineClear } from '../Raytrace';
import { Vec3d } from '../Constants';
import { CombatRotations } from './CombatRotations';

const MOVEMENT_KEYS = ['w', 'a', 's', 'd', 'space', 'sprint'];

const MIN_LOOKAHEAD = 1.1;
const MAX_LOOKAHEAD = 3.5;
const LOOKAHEAD_STEP = 0.4;
const RECOVERY_MIN_LOOKAHEAD = 0.1;
const RECOVERY_LOOKAHEAD_STEP = 0.15;
const PROXIMITY_THRESHOLD = 4.0;
const COMPLETION_RADIUS = 1.9;
const MAX_ADVANCE_PER_TICK = 1.6;
const MOVE_LOOKAHEAD = 0.9;
const PROGRESS_DISTANCE = 0.2;
const STUCK_MS = 900;
const STEP_UP_THRESHOLD = 0.5;
const PREEMPTIVE_JUMP_DISTANCE = 1.65;
const GAP_SCAN_NODES = 6;
const GAP_MAX_HORIZONTAL = 20;
const GAP_EDGE_DISTANCE = 1.35;
const LOOK_POINT_HEIGHT = 1.6;
const IGNORE_BLOCK = -99999;

const DEFAULT_FLAG_BITS = [1, 2, 4, 8, 16, 32, 64, 128];

class CombatPathWalker {
    constructor() {
        this.nodes = [];
        this.points = [];
        this.flags = null;
        this.flagBits = DEFAULT_FLAG_BITS;
        this.t = 0;
        this.arrivalRadius = 2;
        this.sprint = true;
        this.autoJump = true;
        this.lookAlongPath = true;
        this.debug = false;
        this.smoothedLookahead = MAX_LOOKAHEAD;
        this.progressAt = 0;
        this.lastX = 0;
        this.lastZ = 0;
        this.stuckAttempts = 0;
        this.renderRegister = register('postRenderWorld', () => this.render()).unregister();
    }

    configure(options = {}) {
        if (Number.isFinite(options.arrivalRadius)) this.arrivalRadius = options.arrivalRadius;
        if (typeof options.sprint === 'boolean') this.sprint = options.sprint;
        if (typeof options.autoJump === 'boolean') this.autoJump = options.autoJump;
        if (typeof options.lookAlongPath === 'boolean') this.lookAlongPath = options.lookAlongPath;
    }

    setDebug(enabled) {
        this.debug = !!enabled;
        if (this.debug && !this.renderRegister.isRegistered()) this.renderRegister.register();
        else if (!this.debug && this.renderRegister.isRegistered()) this.renderRegister.unregister();
    }

    setPath(result, options = {}) {
        this.nodes = (result?.path?.length ? result.path : result?.keynodes) || [];
        this.points = this.nodes.map((node) => ({ x: node.x + 0.5, y: node.y, z: node.z + 0.5 }));
        this.flags = result?.path_flags || null;
        this.flagBits = Array.isArray(result?.path_flag_bits) && result.path_flag_bits.length >= 8 ? result.path_flag_bits : DEFAULT_FLAG_BITS;
        this.t = 0;
        this.smoothedLookahead = MAX_LOOKAHEAD;
        this.stuckAttempts = 0;
        if (Number.isFinite(options.arrivalRadius)) this.arrivalRadius = options.arrivalRadius;
        this.markProgress();
    }

    isActive() {
        return this.points.length > 0;
    }

    tick() {
        if (!this.points.length) return 'ARRIVED';

        const player = Player.getPlayer();
        if (!player) return 'IDLE';

        this.updateProgress();

        const remaining = this.points.length - 1 - this.t;
        const last = this.points[this.points.length - 1];
        const endDistance = Math.hypot(player.getX() - last.x, player.getZ() - last.z);
        if (remaining <= 0.25 || (remaining <= 2 && endDistance <= COMPLETION_RADIUS)) {
            this.stopKeys();
            return 'ARRIVED';
        }

        const lookPoint = this.computeLookPoint();
        this.steer(lookPoint);

        const moved = Math.hypot(player.getX() - this.lastX, player.getZ() - this.lastZ);
        if (moved >= PROGRESS_DISTANCE) {
            this.stuckAttempts = 0;
            this.markProgress();
        } else if (Date.now() - this.progressAt > STUCK_MS) {
            this.stuckAttempts++;
            this.markProgress();
            if (this.stuckAttempts >= 3) {
                this.stopKeys();
                return 'STUCK';
            }
            Client.setKey('space', true);
            Client.setKey(this.stuckAttempts % 2 === 1 ? 'a' : 'd', true);
            Client.setKey('w', true);
            return 'MOVING';
        }

        const movePoint = this.interpolate(this.t + MOVE_LOOKAHEAD) || lookPoint;
        this.moveToward(movePoint);
        this.handleJump();

        return 'MOVING';
    }

    moveToward(point) {
        if (!point) return;
        if (Client.isInGui() && !Client.isInChat()) return;
        setKeysForStraightLineCoords(point.x, point.y, point.z, this.autoJump, true);
        Client.setKey('sprint', true);
    }

    steer(point) {
        if (!this.lookAlongPath || !point) return;
        CombatRotations.lookAtPoint(point.x, point.y + LOOK_POINT_HEIGHT, point.z);
    }

    isStraight() {
        return this.smoothedLookahead >= MAX_LOOKAHEAD - 0.5;
    }

    updateProgress() {
        const lastSegment = this.points.length - 2;
        if (lastSegment < 0) {
            this.t = 0;
            return;
        }

        const player = Player.getPlayer();
        const px = player.getX();
        const pz = player.getZ();
        const base = Math.max(0, Math.min(lastSegment, Math.floor(this.t)));

        let result = this.project(px, pz, Math.max(0, base - 3), Math.min(lastSegment, base + 12));
        if (result.distanceSq > 6.25) {
            const global = this.project(px, pz, 0, lastSegment);
            if (global.distanceSq < result.distanceSq) result = global;
        }

        this.t = Math.max(0, Math.min(this.points.length - 1, result.t));
    }

    project(px, pz, start, end) {
        let bestT = start;
        let bestDistanceSq = Infinity;

        for (let i = start; i <= end; i++) {
            const a = this.points[i];
            const b = this.points[i + 1];
            if (!a || !b) continue;

            const abx = b.x - a.x;
            const abz = b.z - a.z;
            const lengthSq = abx * abx + abz * abz;
            const segment = lengthSq <= 1e-8 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / lengthSq));
            const projX = a.x + abx * segment;
            const projZ = a.z + abz * segment;
            const distanceSq = Math.pow(px - projX, 2) + Math.pow(pz - projZ, 2);

            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                bestT = i + segment;
            }
        }

        return { t: bestT, distanceSq: bestDistanceSq };
    }

    interpolate(indexFloat) {
        if (!this.points.length) return null;
        const safe = Math.max(0, Math.min(indexFloat, this.points.length - 1));
        const index = Math.floor(safe);
        const fraction = safe - index;
        const p1 = this.points[index];
        const p2 = this.points[Math.min(index + 1, this.points.length - 1)];
        if (!p1) return null;
        if (!p2 || fraction <= 0) return { x: p1.x, y: p1.y, z: p1.z };
        return { x: p1.x + (p2.x - p1.x) * fraction, y: p1.y + (p2.y - p1.y) * fraction, z: p1.z + (p2.z - p1.z) * fraction };
    }

    getAdaptiveLookahead() {
        const index = Math.floor(this.t);
        if (index + 3 >= this.points.length) return this.smoothedLookahead;

        const eyes = Player.getPlayer().getEyePosition();
        const pathPoint = this.interpolate(this.t);
        const deviation = Math.hypot(eyes.x() - pathPoint.x, eyes.z() - pathPoint.z);
        const deviationFactor = Math.min(1, Math.max(0, (deviation - 1.6) / 2.0));

        let maxAngle = 0;
        const startA = this.points[index];
        const startB = this.points[Math.min(index + 2, this.points.length - 1)];
        const startDirection = { x: startB.x - startA.x, z: startB.z - startA.z };
        const startMagnitude = Math.hypot(startDirection.x, startDirection.z);

        for (let lookahead = 4; lookahead <= 8; lookahead += 2) {
            const futureIndex = Math.min(index + lookahead, this.points.length - 3);
            if (futureIndex <= index + 2) continue;
            const futureA = this.points[futureIndex];
            const futureB = this.points[Math.min(futureIndex + 2, this.points.length - 1)];
            const futureDirection = { x: futureB.x - futureA.x, z: futureB.z - futureA.z };
            const futureMagnitude = Math.hypot(futureDirection.x, futureDirection.z);
            if (startMagnitude > 0.8 && futureMagnitude > 0.8) {
                const dot = (startDirection.x * futureDirection.x + startDirection.z * futureDirection.z) / (startMagnitude * futureMagnitude);
                maxAngle = Math.max(maxAngle, Math.acos(Math.max(-1, Math.min(1, dot))));
            }
        }

        const curveFactor = Math.min(1, Math.max(0, (maxAngle - 0.61) / 0.7));
        const adjust = Math.max(deviationFactor, curveFactor);
        const target = MAX_LOOKAHEAD - (MAX_LOOKAHEAD - MIN_LOOKAHEAD) * adjust;
        const lerp = target > this.smoothedLookahead ? 0.2 : 0.1;
        this.smoothedLookahead += (target - this.smoothedLookahead) * lerp;
        return this.smoothedLookahead;
    }

    isPointVisible(point) {
        if (!point) return false;
        const eyes = Player.getPlayer().getEyePosition();
        return isLineClear(eyes.x(), eyes.y(), eyes.z(), point.x, point.y + LOOK_POINT_HEIGHT, point.z, IGNORE_BLOCK, IGNORE_BLOCK, IGNORE_BLOCK);
    }

    computeLookPoint() {
        const ideal = this.getAdaptiveLookahead();
        let lookahead = Math.max(ideal, MIN_LOOKAHEAD);

        while (lookahead >= MIN_LOOKAHEAD) {
            const point = this.interpolate(this.t + lookahead);
            if (this.isPointVisible(point)) return point;
            lookahead -= LOOKAHEAD_STEP;
        }

        let closeLookahead = Math.max(RECOVERY_MIN_LOOKAHEAD, MIN_LOOKAHEAD - 0.2);
        while (closeLookahead >= RECOVERY_MIN_LOOKAHEAD) {
            const point = this.interpolate(this.t + closeLookahead);
            if (this.isPointVisible(point)) return point;
            lookahead -= RECOVERY_LOOKAHEAD_STEP;
            lookahead = Math.max(lookahead, 0);
            closeLookahead = lookahead;
        }

        return this.interpolate(this.t + MIN_LOOKAHEAD);
    }

    getFlagBit(position) {
        if (!this.flags || !this.flagBits) return 0;
        const index = Math.max(0, Math.min(this.flags.length - 1, Math.floor(position) + 1));
        return this.flags[index] || 0;
    }

    hasFlag(index, bitIndex) {
        const bit = this.flagBits[bitIndex];
        if (!this.flags || !bit || index < 0 || index >= this.flags.length) return false;
        return (this.flags[index] & bit) !== 0;
    }

    handleJump() {
        const player = Player.getPlayer();
        if (!player) return;

        if (this.autoJump && this.hasLowHeadroom()) {
            Client.setKey('space', false);
            return;
        }

        if (this.isPlayerInFluid()) {
            Client.setKey('space', true);
            return;
        }

        if (this.checkStepUp()) {
            Client.setKey('space', true);
            return;
        }

        if (this.checkGapJump()) {
            Client.setKey('space', true);
            return;
        }
    }

    hasLowHeadroom() {
        const index = Math.floor(this.t) + 1;
        return this.hasFlag(index, 2);
    }

    isPlayerInFluid() {
        try {
            const player = Player.asPlayerMP();
            return !!player && (player.isInLava() || player.isInWater());
        } catch (e) {
            return false;
        }
    }

    checkStepUp() {
        const index = Math.floor(this.t);
        if (index + 1 >= this.points.length) return false;
        const current = this.points[index];
        const next = this.points[index + 1];
        if (next.y - current.y < STEP_UP_THRESHOLD) return false;

        const player = Player.getPlayer();
        const distance = Math.hypot(next.x - player.getX(), next.z - player.getZ());
        return distance <= PREEMPTIVE_JUMP_DISTANCE;
    }

    checkGapJump() {
        const index = Math.floor(this.t);
        if (index < 0 || index + 3 >= this.points.length) return false;

        const baseY = this.points[index].y;
        let dropIndex = -1;
        let recoveryIndex = -1;
        const maxIndex = Math.min(this.points.length, index + GAP_SCAN_NODES);

        for (let i = index + 1; i < maxIndex; i++) {
            const y = this.points[i].y;
            if (y < baseY - 0.5) {
                if (dropIndex === -1) dropIndex = i;
            } else if (dropIndex !== -1 && y >= baseY) {
                recoveryIndex = i;
                break;
            } else if (y > baseY + 0.5 && dropIndex === -1) {
                return false;
            }
        }

        if (dropIndex === -1 || recoveryIndex === -1) return false;

        const edge = this.points[dropIndex - 1];
        const recovery = this.points[recoveryIndex];
        const gapHorizSq = Math.pow(recovery.x - edge.x, 2) + Math.pow(recovery.z - edge.z, 2);
        if (gapHorizSq <= 0 || gapHorizSq > GAP_MAX_HORIZONTAL) return false;

        const player = Player.getPlayer();
        const edgeDistanceSq = Math.pow(player.getX() - edge.x, 2) + Math.pow(player.getZ() - edge.z, 2);
        return edgeDistanceSq <= GAP_EDGE_DISTANCE * GAP_EDGE_DISTANCE;
    }

    checkStepUpJump() {
        return this.checkStepUp();
    }

    markProgress() {
        this.progressAt = Date.now();
        this.lastX = Player.getX();
        this.lastZ = Player.getZ();
    }

    stopKeys() {
        Client.stopMovement();
        for (const key of MOVEMENT_KEYS) Client.setKey(key, false);
    }

    stop() {
        this.nodes = [];
        this.points = [];
        this.flags = null;
        this.t = 0;
        this.stopKeys();
    }

    render() {
        if (!this.debug || !this.points.length) return;
        const player = Player.getPlayer();
        if (!player) return;

        const visible = this.points.filter((point) => Math.abs(point.x - player.getX()) < 64 && Math.abs(point.z - player.getZ()) < 64);
        Render3D.drawSizedBoxes(visible.map((point) => new Vec3d(point.x, point.y + 0.5, point.z)), 0.35, 0.35, 0.35, new RenderColor(0, 150, 255, 150), true, 1, true);

        const lookPoint = this.computeLookPoint();
        if (lookPoint) {
            Render3D.drawSizedBoxes([new Vec3d(lookPoint.x, lookPoint.y + 0.5, lookPoint.z)], 0.5, 0.5, 0.5, new RenderColor(0, 255, 0, 200), true, 1, true);
        }

        const current = this.interpolate(this.t);
        if (lookPoint && current) {
            Render3D.drawLines([new Vec3d(current.x, current.y + 0.5, current.z), new Vec3d(lookPoint.x, lookPoint.y + 0.5, lookPoint.z)], new RenderColor(255, 255, 0, 255), 3, false);
        }
    }
}

export const CombatWalker = new CombatPathWalker();
