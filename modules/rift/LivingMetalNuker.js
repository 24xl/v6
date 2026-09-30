import { Vec3d } from '../../utils/Constants';
import { ModuleBase } from '../../utils/ModuleBase';
import { isBlockInRange, isVanillaNukeActive, nukeQueue, queueVanillaNuke } from '../../utils/NukerUtils';
import { testPointNative } from '../../utils/Raytrace';
import { Rotations } from '../../utils/player/Rotations';
import Pathfinder from '../../utils/pathfinder/PathFinder';

const LAPIS_ORE = new BlockType('minecraft:lapis_ore');
const REACH = 4.5;
const MOVE_SEARCH = 10;
const MOVE_HEIGHT = 2;
const TARGET_COLOR = new RenderColor(0, 220, 255, 255);

class LivingMetalNuker extends ModuleBase {
    constructor() {
        super({
            name: 'Living Metal Nuker',
            subcategory: 'Rift',
            description: 'Mines one Living Metal lapis ore chain with vanilla block breaking.',
            autoDisableOnWorldUnload: true,
            isMacro: true,
        });
        this.bindToggleKey();
        this.rotations = false;
        this.rotating = false;
        this.movement = false;
        this.pathTarget = null;
        this.moveRetryAt = 0;
        this.addToggle(
            'Rotations',
            (value) => {
                this.rotations = value;
                if (!value && this.rotating) {
                    Rotations.stop();
                    this.rotating = false;
                }
            },
            'Look at a visible spot while mining.'
        );
        this.addToggle(
            'Movement',
            (value) => {
                this.movement = value;
                if (!value) {
                    this.stopMoving();
                    if (this.target && !isBlockInRange(this.target, REACH)) {
                        this.target = null;
                        this.knownOres.clear();
                    }
                }
            },
            'Path through caves toward distant ores.'
        );
        this.target = null;
        this.knownOres = new Set();
        this.chainEndAt = 0;
        this.on('tick', () => this.tick());
        this.on('postRenderWorld', () => {
            if (!this.target || !World.isLoaded()) return;
            const [x, y, z] = this.target;
            if (World.getBlockAt(x, y, z)?.type?.getRegistryName() !== 'minecraft:lapis_ore') return;
            Render3D.drawWireFrameBox(new Vec3d(x, y, z), TARGET_COLOR, 2, false);
        });
    }

    onEnable() {
        this.target = null;
        this.knownOres.clear();
        this.chainEndAt = 0;
        this.moveRetryAt = 0;
    }

    onDisable() {
        this.cancelQueuedNukes();
        this.stopMoving();
        if (this.rotating) Rotations.stop();
        this.rotating = false;
        this.target = null;
    }

    cancelQueuedNukes() {
        for (let i = nukeQueue.length - 1; i >= 0; i--) {
            if (nukeQueue[i]?.owner === this) nukeQueue.splice(i, 1);
        }
    }

    stopMoving() {
        if (this.pathTarget) Pathfinder.resetPath();
        this.pathTarget = null;
    }

    tick() {
        if (!World.isLoaded() || !Player.getPlayer() || Client.isInGui()) {
            this.stopMoving();
            return;
        }

        if (this.target) {
            const nearbyOres = this.getNearbyOres(this.target);
            const targetKey = this.positionKey(this.target);
            if (!nearbyOres.has(targetKey)) {
                const eyeY = Player.getPlayer()?.getEyePosition().y();
                const newOres = [...nearbyOres].filter((key) => !this.knownOres.has(key));
                const nextOre =
                    newOres.find((key) => isBlockInRange(key.split(',').map(Number), REACH)) ??
                    (this.movement &&
                        newOres.find((key) => {
                            const pos = key.split(',').map(Number);
                            const verticalGap = Math.max(pos[1] - eyeY, 0, eyeY - pos[1] - 1);
                            return verticalGap < REACH + MOVE_HEIGHT;
                        }));
                if (!nextOre) {
                    this.stopMoving();
                    if (!this.chainEndAt) this.chainEndAt = Date.now() + 250;
                    if (Date.now() < this.chainEndAt) return;
                    if (this.rotating) Rotations.stop();
                    this.rotating = false;
                    this.target = null;
                    this.knownOres.clear();
                    this.chainEndAt = 0;
                } else {
                    this.target = nextOre.split(',').map(Number);
                    this.knownOres = this.getNearbyOres(this.target);
                    this.moveRetryAt = 0;
                }
            }
            if (this.target) this.chainEndAt = 0;
        }
        if (this.pathTarget && this.pathTarget !== (this.target && this.positionKey(this.target))) this.stopMoving();

        if (isVanillaNukeActive() || Client.getKeyBindFromDescription('key.attack')?.isKeyDown() || Client.getMinecraft().options.keyAttack?.isDown()) {
            this.stopMoving();
            return;
        }

        if (!this.target) {
            this.target = this.findTarget();
            if (!this.target) {
                this.stopMoving();
                return;
            }
            this.knownOres = this.getNearbyOres(this.target);
            this.moveRetryAt = 0;
        }
        const inReach = isBlockInRange(this.target, REACH);
        if (this.movement && !inReach) {
            const [x, , z] = this.target;
            const horizontalDistance = Math.hypot(x + 0.5 - Player.getX(), z + 0.5 - Player.getZ());
            if (horizontalDistance > 0.6) {
                if (!this.pathTarget && Date.now() >= this.moveRetryAt && !Pathfinder.isPathing()) this.startPath();
                return;
            }
        }
        this.stopMoving();
        if (!inReach) {
            if (this.rotating) Rotations.stop();
            this.rotating = false;
            return;
        }
        if (this.rotations) {
            const point = this.getAimPoint(this.target) ?? this.target.map((coord) => coord + 0.5);
            this.rotating = Rotations.lookAtVector(point);
        }
        queueVanillaNuke(this.target, REACH, this);
    }

    startPath() {
        const [tx, ty, tz] = this.target;
        const baseFloorY = Math.floor(Player.getY()) - 1;
        const eyeHeight = Player.getPlayer().getEyePosition().y() - Player.getY();
        const goals = [];
        for (let floorY = baseFloorY - MOVE_HEIGHT; floorY <= baseFloorY + MOVE_HEIGHT; floorY++) {
            const eyeY = floorY + 1 + eyeHeight;
            const dy = Math.max(ty - eyeY, 0, eyeY - ty - 1);
            if (dy >= REACH) continue;
            for (let dx = -3; dx <= 3; dx++) {
                for (let dz = -3; dz <= 3; dz++) {
                    const x = tx + dx;
                    const z = tz + dz;
                    if (Pathfinder.isBlockWalkable(x, floorY, z)) continue;
                    if (!Pathfinder.isBlockWalkable(x, floorY + 1, z) || !Pathfinder.isBlockWalkable(x, floorY + 2, z)) continue;
                    const nearX = Math.max(tx - x - 0.5, 0, x - tx - 0.5);
                    const nearZ = Math.max(tz - z - 0.5, 0, z - tz - 0.5);
                    if (Math.hypot(nearX, dy, nearZ) > REACH - 0.25) continue;
                    goals.push([x + 0.5, floorY, z + 0.5]);
                }
            }
        }
        if (!goals.length) {
            this.moveRetryAt = Date.now() + 2000;
            return;
        }
        if (this.rotating) Rotations.stop();
        this.rotating = false;
        const key = (this.pathTarget = this.positionKey(this.target));
        Pathfinder.findPath(
            goals,
            (success) => {
                if (this.pathTarget !== key) return;
                this.pathTarget = null;
                this.moveRetryAt = Date.now() + (success ? 250 : 2000);
            },
            { silent: true, walkArrivalRadius: 0.6 }
        );
    }

    positionKey([x, y, z]) {
        return `${x},${y},${z}`;
    }

    getNearbyOres([x, y, z]) {
        return new Set(World.getBlocksInBox(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1, [LAPIS_ORE]).map(({ x, y, z }) => `${x},${y},${z}`));
    }

    getAimPoint([x, y, z]) {
        const eye = Player.getPlayer()?.getEyePosition();
        if (!eye) return null;
        const eyes = { x: eye.x(), y: eye.y(), z: eye.z() };
        const faces = [];
        if (eyes.x < x) faces.push((a, b) => [x + 0.01, y + a, z + b]);
        if (eyes.x > x + 1) faces.push((a, b) => [x + 0.99, y + a, z + b]);
        if (eyes.y < y) faces.push((a, b) => [x + a, y + 0.01, z + b]);
        if (eyes.y > y + 1) faces.push((a, b) => [x + a, y + 0.99, z + b]);
        if (eyes.z < z) faces.push((a, b) => [x + a, y + b, z + 0.01]);
        if (eyes.z > z + 1) faces.push((a, b) => [x + a, y + b, z + 0.99]);
        for (const face of faces) {
            for (const [a, b] of [
                [0.5, 0.5],
                [0.25, 0.25],
                [0.25, 0.75],
                [0.75, 0.25],
                [0.75, 0.75],
            ]) {
                const point = face(a, b);
                if (Math.hypot(point[0] - eyes.x, point[1] - eyes.y, point[2] - eyes.z) > REACH) continue;
                if (testPointNative(x, y, z, point, eyes)) return point;
            }
        }
        return null;
    }

    findTarget() {
        const player = Player.getPlayer();
        if (!player) return null;
        const eye = player.getEyePosition();
        const eyeX = eye.x();
        const eyeY = eye.y();
        const eyeZ = eye.z();
        const x = Math.floor(player.getX());
        const y = Math.floor(player.getY());
        const z = Math.floor(player.getZ());
        let closest = (this.movement ? MOVE_SEARCH : REACH) ** 2;
        let target = null;

        const radius = Math.ceil(this.movement ? MOVE_SEARCH : REACH);
        const verticalRadius = Math.ceil(REACH + (this.movement ? MOVE_HEIGHT : 0) + 2);
        for (const block of World.getBlocksInBox(x - radius, y - verticalRadius, z - radius, x + radius, y + verticalRadius, z + radius, [LAPIS_ORE])) {
            const dx = Math.max(block.x - eyeX, 0, eyeX - block.x - 1);
            const dy = Math.max(block.y - eyeY, 0, eyeY - block.y - 1);
            const dz = Math.max(block.z - eyeZ, 0, eyeZ - block.z - 1);
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance >= closest) continue;
            if (this.movement && dy >= REACH + MOVE_HEIGHT) continue;
            closest = distance;
            target = [block.x, block.y, block.z];
        }
        return target;
    }
}

new LivingMetalNuker();
