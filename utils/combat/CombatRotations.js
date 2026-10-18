import { calculateAbsoluteAngles, getAngleDifference, wrapTo180 } from '../Math';
import { applyToPlayer } from '../player/RotationGCD';

const BASE_KP = 0.09;
const KD = 0.55;
const MAX_VELOCITY = 16.0;
const ACCEL_LIMIT = 2.6;
const SETTLE_THRESHOLD = 0.15;
const YAW_DEADZONE = 1.2;
const PITCH_DEADZONE = 1.8;
const SMOOTH_FACTOR = 0.1;
const TALL_ENTITY_SPLIT = 2.5;
const TALL_ENTITY_MULTIPLIER = 0.5;
const SHORT_ENTITY_MULTIPLIER = 0.85;

class CombatRotationController {
    constructor() {
        this.request = null;
        this.currentYaw = 0;
        this.currentPitch = 0;
        this.rawTargetYaw = 0;
        this.rawTargetPitch = 0;
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.initialized = false;
        this.lastUpdate = 0;
        this.speedMultiplier = 1;
        this.renderRegister = register('renderWorld', () => this.update()).unregister();
    }

    setSpeedMultiplier(multiplier) {
        const value = Number(multiplier);
        if (Number.isFinite(value) && value > 0) this.speedMultiplier = value;
    }

    lookAtEntity(entity) {
        if (!this.isEntityUsable(entity)) {
            this.stop();
            return;
        }
        this.request = { type: 'entity', value: entity };
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
        this.lastUpdate = 0;
        if (this.renderRegister.isRegistered()) this.renderRegister.unregister();
    }

    start() {
        if (!this.initialized) this.syncFromPlayer();
        this.lastUpdate = 0;
        if (!this.renderRegister.isRegistered()) this.renderRegister.register();
    }

    syncFromPlayer() {
        const player = Player.getPlayer();
        if (!player) return;
        this.currentYaw = wrapTo180(player.getYRot());
        this.currentPitch = player.getXRot();
        this.rawTargetYaw = this.currentYaw;
        this.rawTargetPitch = this.currentPitch;
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.initialized = true;
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
            if (!box) return null;
            const height = box.maxY - box.minY;
            const multiplier = height >= TALL_ENTITY_SPLIT ? TALL_ENTITY_MULTIPLIER : SHORT_ENTITY_MULTIPLIER;
            return {
                x: (box.minX + box.maxX) / 2,
                y: box.minY + height * multiplier,
                z: (box.minZ + box.maxZ) / 2,
            };
        } catch (e) {
            return null;
        }
    }

    resolvePoint() {
        if (!this.request) return null;
        if (this.request.type === 'point') return this.request.value;
        return this.getEntityAimPoint(this.request.value);
    }

    update() {
        const point = this.resolvePoint();
        if (!point) {
            this.stop();
            return;
        }

        const now = Date.now();
        const timeScale = this.lastUpdate ? Math.min(2, (now - this.lastUpdate) / (1000 / 120)) : 1;
        this.lastUpdate = now;

        const angles = calculateAbsoluteAngles(point);
        const targetYaw = wrapTo180(angles.yaw);
        const yawDelta = getAngleDifference(this.rawTargetYaw, targetYaw);
        const smooth = Math.min(1, SMOOTH_FACTOR * timeScale);

        if (Math.abs(yawDelta) > YAW_DEADZONE) this.rawTargetYaw = wrapTo180(this.rawTargetYaw + yawDelta * smooth);
        const pitchDelta = angles.pitch - this.rawTargetPitch;
        if (Math.abs(pitchDelta) > PITCH_DEADZONE) this.rawTargetPitch += pitchDelta * smooth;

        this.applyPhysics(timeScale);
        applyToPlayer(this.currentYaw, this.currentPitch);
    }

    applyPhysics(timeScale) {
        const yawError = getAngleDifference(this.currentYaw, this.rawTargetYaw);
        const pitchError = this.rawTargetPitch - this.currentPitch;
        const multiplier = Math.min(1.5, Math.max(0.6, Math.abs(yawError) / 10));
        const kp = BASE_KP * multiplier * this.speedMultiplier;
        const accelLimit = ACCEL_LIMIT * this.speedMultiplier;
        const maxVelocity = MAX_VELOCITY * this.speedMultiplier;

        if (Math.abs(yawError) < SETTLE_THRESHOLD && Math.abs(this.yawVelocity) < 0.02) {
            this.currentYaw = this.rawTargetYaw;
            this.yawVelocity = 0;
        } else {
            const accel = yawError * kp - this.yawVelocity * KD;
            this.yawVelocity += Math.max(-accelLimit, Math.min(accelLimit, accel)) * timeScale;
            this.yawVelocity *= Math.pow(0.92, timeScale);
            this.yawVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, this.yawVelocity));
            this.currentYaw = wrapTo180(this.currentYaw + this.yawVelocity * timeScale);
        }

        if (Math.abs(pitchError) < SETTLE_THRESHOLD && Math.abs(this.pitchVelocity) < 0.02) {
            this.currentPitch = this.rawTargetPitch;
            this.pitchVelocity = 0;
        } else {
            const accel = pitchError * kp - this.pitchVelocity * KD;
            this.pitchVelocity += Math.max(-accelLimit, Math.min(accelLimit, accel)) * timeScale;
            this.pitchVelocity *= Math.pow(0.92, timeScale);
            this.pitchVelocity = Math.max(-maxVelocity, Math.min(maxVelocity, this.pitchVelocity));
            this.currentPitch += this.pitchVelocity * timeScale;
        }

        this.currentPitch = Math.max(-90, Math.min(90, this.currentPitch));
    }
}

export const CombatRotations = new CombatRotationController();
