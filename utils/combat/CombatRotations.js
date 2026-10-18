import { calculateAbsoluteAngles, getAngleDifference, wrapTo180 } from '../Math';
import { applyToPlayer, clampPitch, getCurrentRotation } from '../player/RotationGCD';

const DEFAULT_SPEED = 500;
const DAMPING_DIST = 45;
const MIN_STEP = 10;
const POINT_PRECISION = 0.1;
const ENTITY_PRECISION = 0.5;
const CURVE_STRENGTH = 0.14;
const TALL_ENTITY_SPLIT = 2.5;
const TALL_ENTITY_MULTIPLIER = 0.5;
const SHORT_ENTITY_MULTIPLIER = 0.85;

class CombatRotationController {
    constructor() {
        this.request = null;
        this.speed = DEFAULT_SPEED;
        this.mode = 'Non-linear';
        this.lastTime = 0;
        this.startTime = 0;
        this.initialDistance = 0;
        this.curveSeed = Math.random() * Math.PI * 2;
        this.renderRegister = register('renderWorld', () => this.update()).unregister();
    }

    setSpeed(speed) {
        const value = Number(speed);
        if (Number.isFinite(value) && value > 0) this.speed = value;
    }

    setMode(mode) {
        this.mode = mode === 'Linear' ? 'Linear' : mode === 'Instant' ? 'Instant' : 'Non-linear';
    }

    lookAtEntity(entity) {
        if (!this.isEntityUsable(entity)) {
            this.stop();
            return;
        }
        if (this.request?.type === 'entity' && this.request.value === entity) return;
        this.request = { type: 'entity', value: entity };
        this.resetTiming();
        this.start();
    }

    lookAtPoint(x, y, z) {
        const px = Number(x);
        const py = Number(y);
        const pz = Number(z);
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return;
        this.request = { type: 'point', value: { x: px, y: py, z: pz } };
        this.start();
    }

    isActive() {
        return !!this.request;
    }

    stop() {
        this.request = null;
        this.lastTime = 0;
        this.startTime = 0;
        this.initialDistance = 0;
        if (this.renderRegister.isRegistered()) this.renderRegister.unregister();
    }

    start() {
        if (!this.renderRegister.isRegistered()) this.renderRegister.register();
    }

    resetTiming(now = 0, distance = 0) {
        this.lastTime = now;
        this.startTime = now;
        this.initialDistance = distance;
        this.curveSeed = Math.random() * Math.PI * 2;
    }

    isEntityUsable(entity) {
        try {
            const mc = entity?.toMC ? entity.toMC() : entity;
            return !!mc && !mc.isDeadOrDying?.() && !mc.isRemoved?.();
        } catch (e) {
            return false;
        }
    }

    getEntityAimPoint(entity) {
        try {
            const mc = entity?.toMC ? entity.toMC() : entity;
            const box = mc?.getBoundingBox?.();
            if (box) {
                const height = box.maxY - box.minY;
                const multiplier = height >= TALL_ENTITY_SPLIT ? TALL_ENTITY_MULTIPLIER : SHORT_ENTITY_MULTIPLIER;
                return {
                    x: (box.minX + box.maxX) / 2,
                    y: box.minY + height * multiplier,
                    z: (box.minZ + box.maxZ) / 2,
                };
            }
            return { x: mc.getX(), y: mc.getY() + 1, z: mc.getZ() };
        } catch (e) {
            return null;
        }
    }

    resolvePoint() {
        if (!this.request) return null;
        if (this.request.type === 'point') return this.request.value;
        return this.getEntityAimPoint(this.request.value);
    }

    getPrecision() {
        return this.request?.type === 'entity' ? ENTITY_PRECISION : POINT_PRECISION;
    }

    update() {
        if (!this.request) return;

        const player = Player.getPlayer();
        if (!player) {
            this.stop();
            return;
        }

        const point = this.resolvePoint();
        if (!point) {
            this.stop();
            return;
        }

        const current = getCurrentRotation(player);
        if (!current) return;

        const angles = calculateAbsoluteAngles(point);
        const targetYaw = wrapTo180(angles.yaw);
        const targetPitch = clampPitch(angles.pitch);

        const currentYaw = wrapTo180(current.yaw);
        const currentPitch = current.pitch;
        const deltaYaw = getAngleDifference(currentYaw, targetYaw);
        const deltaPitch = targetPitch - currentPitch;
        const distance = Math.hypot(deltaYaw, deltaPitch);

        const now = Date.now();
        if (this.lastTime === 0) {
            this.resetTiming(now, distance);
            return;
        }

        if (distance > this.initialDistance) this.initialDistance = distance;
        const deltaTime = Math.max(0, (now - this.lastTime) / 1000);
        this.lastTime = now;

        if (this.mode === 'Instant' || distance <= this.getPrecision()) {
            applyToPlayer(targetYaw, targetPitch);
            return;
        }

        const ratio = this.getStepRatio(distance, deltaTime);
        const curve = this.getCurveOffset(this.getProgress(distance));
        const nextYaw = currentYaw + deltaYaw * ratio + curve.x * ratio;
        const nextPitch = clampPitch(currentPitch + deltaPitch * ratio + curve.y * ratio);

        if (Number.isFinite(nextYaw) && Number.isFinite(nextPitch)) {
            applyToPlayer(nextYaw, nextPitch);
        }
    }

    getStepRatio(distance, deltaTime) {
        const timeAlive = this.startTime > 0 ? (Date.now() - this.startTime) / 1000 : 0;
        const warmup = Math.min(timeAlive * 4, 1);
        const damping = Math.min(distance / DAMPING_DIST, 1);
        const speed = this.speed * Math.sqrt(damping);
        const step = (speed * warmup + MIN_STEP) * deltaTime;
        return Math.min(distance, step) / distance;
    }

    getProgress(distance) {
        if (this.initialDistance <= 0) return 1;
        return Math.max(0, Math.min(1, 1 - distance / this.initialDistance));
    }

    getCurveOffset(progress) {
        if (this.mode !== 'Non-linear') return { x: 0, y: 0 };
        const ease = Math.sin(progress * Math.PI);
        const fade = 1 - progress;
        const strength = this.initialDistance * CURVE_STRENGTH * ease * fade;
        return { x: Math.cos(this.curveSeed) * strength, y: Math.sin(this.curveSeed) * strength };
    }
}

export const CombatRotations = new CombatRotationController();
