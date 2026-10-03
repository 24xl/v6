import { MCHand } from '../../utils/Constants';
import { ServerboundUseItemPacket } from '../../utils/Packets';
import { Rotations } from '../../utils/player/Rotations';
import { ScheduleTask } from '../../utils/ScheduleTask';
import { findItemInHotbar, setItemSlot } from '../../utils/player/Inventory';

const ROOF_SCAN_MIN_OFFSET = 2;
const ROOF_SCAN_MAX_Y = 76;
const ROOF_SCAN_BOTTOM = 0;
const AIM_SPEED = 0.55;
const AIM_PRECISION = 0.35;
const ARRIVAL_TIMEOUT_MS = 4_000;
const ARRIVAL_DISTANCE_SQ = 2.25;
const AOTV_RANGE_SQ = 12 ** 2;

export class RoofEtherwarp {
    constructor() {
        this.enabled = false;
        this.testToken = 0;
        this.climbing = false;
        this.originalSlot = -1;
        this.castPending = false;
        this.castAt = 0;
        this.castFrom = null;
    }

    /**
     * Highest block above the player that has air directly over it, so there
     * is somewhere to land. The very top of a stack is unusable when more
     * blocks sit on top of it, so walk down through the stack until the block
     * above is air.
     */
    findRoofTarget() {
        const player = Player.getPlayer();
        if (!player) return null;

        const x = Math.floor(player.getX());
        const z = Math.floor(player.getZ());
        const bottom = Math.max(ROOF_SCAN_BOTTOM, Math.floor(player.getY()) + ROOF_SCAN_MIN_OFFSET);

        let surface = null;
        for (let y = bottom; y <= ROOF_SCAN_MAX_Y; y++) {
            const name = World.getBlockAt(x, y, z)?.type?.getRegistryName?.();
            if (name && name !== 'minecraft:air') surface = { x, y, z, name };
        }
        if (!surface) return null;

        while (surface.y > bottom) {
            const above = World.getBlockAt(surface.x, surface.y + 1, surface.z)?.type?.getRegistryName?.();
            if (above && above !== 'minecraft:air') surface = { x: surface.x, y: surface.y + 1, z: surface.z, name: above };
            else break;
        }

        const eye = player.getEyePosition?.() || player.getEyePos?.();
        if (eye && surface.y <= Math.floor(player.getY()) + 1) return null;
        return surface;
    }

    hasRoofAbove() {
        return !!this.findRoofTarget();
    }

    findAotvSlot() {
        const aotv = findItemInHotbar('Aspect of the Void');
        return aotv === -1 ? null : aotv;
    }

    startTestClimb(onComplete) {
        if (this.climbing) return 'already-climbing';
        if (this.findAotvSlot() === null) return 'no-aotv';
        if (!this.findRoofTarget()) return 'no-roof';

        this.startClimbing();
        this.onClimbComplete = onComplete;
        return 'started';
    }

    stopTestClimb() {
        this.testToken++;
        this.stopClimbing();
    }

    startClimbing() {
        const slot = this.findAotvSlot();
        if (slot === null) return false;

        this.climbing = true;
        this.testToken++;
        this.castPending = false;
        if (this.originalSlot === -1) this.originalSlot = Player.getHeldItemIndex();

        setItemSlot(slot);
        Client.stopMovement();
        Client.setKey('shift', true);
        this.nextStep(this.testToken);
        return true;
    }

    stopClimbing() {
        this.climbing = false;
        this.castPending = false;
        Client.setKey('shift', false);
        Client.stopMovement();
        Rotations.stop();
        if (this.originalSlot >= 0 && this.originalSlot <= 8) {
            setItemSlot(this.originalSlot);
            this.originalSlot = -1;
        }
    }

    /** Aim at the roof surface, cast once the aim lands, then re-scan. */
    nextStep(token) {
        if (!this.climbing || token !== this.testToken) return;

        if (this.castPending) {
            if (this.hasArrived()) {
                this.castPending = false;
                this.continueClimb(token);
            } else if (Date.now() - this.castAt > ARRIVAL_TIMEOUT_MS) {
                this.castPending = false;
                this.continueClimb(token);
            } else {
                ScheduleTask(1, () => this.nextStep(token));
            }
            return;
        }

        const target = this.findRoofTarget();
        if (!target) {
            const done = this.stopClimbing();
            if (typeof this.onClimbComplete === 'function') this.onClimbComplete(done, false);
            this.onClimbComplete = null;
            return;
        }

        const player = Player.getPlayer();
        if (!player) return;

        const eyes = player.getEyePosition();
        const dx = target.x + 0.5 - eyes.x();
        const dy = target.y + 1 - eyes.y;
        const dz = target.z + 0.5 - eyes.z();
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq > AOTV_RANGE_SQ) {
            this.castPending = false;
            this.continueClimb(token);
            return;
        }

        const yaw = (Math.atan2(dz, dx) * 180) / Math.PI - 90;
        const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;

        const aimStarted = Rotations.lookAtAngles(yaw, pitch, { rotationSpeed: AIM_SPEED, precision: AIM_PRECISION });
        const tokenAtAim = token;
        Rotations.onComplete(() => {
            if (!this.climbing || tokenAtAim !== this.testToken) return;
            this.cast(target);
            ScheduleTask(1, () => this.nextStep(token));
        });

        if (!aimStarted) {
            this.cast(target);
            ScheduleTask(1, () => this.nextStep(token));
        }
    }

    cast(target) {
        const yaw = Player.getYaw();
        const pitch = Player.getPitch();
        Client.sendSequencedPacket((sequence) => new ServerboundUseItemPacket(MCHand.MAIN_HAND, sequence, yaw, pitch));
        this.castPending = true;
        this.castAt = Date.now();
        this.castFrom = target;
    }

    hasArrived() {
        const player = Player.getPlayer();
        if (!player || !this.castFrom) return true;
        const dx = player.getX() - this.castFrom.x;
        const dy = player.getY() - this.castFrom.y;
        const dz = player.getZ() - this.castFrom.z;
        return dx * dx + dz * dz <= ARRIVAL_DISTANCE_SQ && Math.abs(dy) <= 2;
    }

    continueClimb(token) {
        if (!this.climbing || token !== this.testToken) return;
        const target = this.findRoofTarget();
        if (!target) {
            this.stopClimbing();
            if (typeof this.onClimbComplete === 'function') this.onClimbComplete(true, false);
            this.onClimbComplete = null;
            return;
        }
        this.nextStep(token);
    }
}

export const roofEtherwarp = new RoofEtherwarp();