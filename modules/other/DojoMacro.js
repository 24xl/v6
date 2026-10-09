import { ModuleBase } from '../../utils/ModuleBase';
import { findItemInHotbar, setItemSlot } from '../../utils/player/Inventory';
import { Rotations } from '../../utils/player/Rotations';
import { ZombieEntity } from '../../utils/Constants';

const EquipmentSlot = net.minecraft.world.entity.EquipmentSlot;
const SkeletonType = net.minecraft.world.entity.monster.skeleton.Skeleton;
const WitherSkeletonType = net.minecraft.world.entity.monster.skeleton.WitherSkeleton;
const SmallFireballType = net.minecraft.world.entity.projectile.SmallFireball;
const FireballType = net.minecraft.world.entity.projectile.Fireball;

const YELLOW_WOOL = 'minecraft:yellow_wool';
const GREEN_WOOL = 'minecraft:green_wool';
const REDSTONE_BLOCK = 'minecraft:redstone_block';

const TESTS = {
    NONE: 'none',
    CONTROL: 'control',
    FORCE: 'force',
    MASTERY: 'mastery',
    DISCIPLINE: 'discipline',
    STAMINA: 'stamina',
    SWIFTNESS: 'swiftness',
    TENACITY: 'tenacity',
};

const SWORD_BY_HELMET = {
    'minecraft:leather_helmet': 'minecraft:wooden_sword',
    'minecraft:iron_helmet': 'minecraft:iron_sword',
    'minecraft:golden_helmet': 'minecraft:golden_sword',
    'minecraft:diamond_helmet': 'minecraft:diamond_sword',
};

const registryAt = (x, y, z) => String(World.getBlockAt(x, y, z)?.type?.getRegistryName?.() ?? '');
const entityClass = (entity) => entity?.toMC?.();
const headRegistry = (entity) => {
    try {
        const item = entityClass(entity)?.getItemBySlot?.(EquipmentSlot.HEAD);
        return item ? String(item.getType?.()?.getRegistryName?.() ?? '') : '';
    } catch (e) {
        return '';
    }
};
const distanceSq = (a, b) => {
    const dx = a.getX() - b.getX();
    const dy = a.getY() - b.getY();
    const dz = a.getZ() - b.getZ();
    return dx * dx + dy * dy + dz * dz;
};
const isWitherSkeleton = (entity) => {
    const mc = entityClass(entity);
    return mc instanceof WitherSkeletonType || (mc instanceof SkeletonType && mc.getType?.() === Java.type('net.minecraft.world.entity.EntityType').WITHER_SKELETON);
};

class DojoMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Dojo Macro',
            subcategory: 'Combat',
            description: 'Auto-completes every Crimson Isle Dojo test. Control/Mastery/Discipline logic ported from OdinClient (skies-starred); Force, Stamina, Swiftness and Tenacity added here.',
        });

        this.test = TESTS.NONE;
        this.targetSkeleton = null;
        this.lastSkeletonPos = null;
        this.skeletonVelX = 0;
        this.skeletonVelZ = 0;
        this.lookCooldown = 0;
        this.lastSwing = 0;
        this.masteryBlocks = [];
        this.firingState = 0;
        this.firingTimer = 0;
        this.drawing = false;
        this.lastMasteryScan = 0;
        this.lastStaminaThink = 0;
        this.staminaTarget = null;
        this.jumpUntil = 0;

        this.addToggle('Test of Control', (v) => (this.enableControl = !!v), 'Aim at the moving skeleton.', true);
        this.addToggle('Test of Force', (v) => (this.enableForce = !!v), 'Knock zombies into the lava.', true);
        this.addToggle('Test of Mastery', (v) => (this.enableMastery = !!v), 'Shoot the wool targets.', true);
        this.addToggle('Test of Discipline', (v) => (this.enableDiscipline = !!v), 'Attack with the matching sword.', true);
        this.addToggle('Test of Stamina', (v) => (this.enableStamina = !!v), 'Steer through the wall gaps.', true);
        this.addToggle('Test of Swiftness', (v) => (this.enableSwiftness = !!v), 'Follow the green wool snake.', true);
        this.addToggle('Test of Tenacity', (v) => (this.enableTenacity = !!v), 'Dodge the ghast fireballs.', true);
        this.addToggle('Discipline Auto Attack', (v) => (this.disciplineAutoAttack = !!v), 'Left-click the zombie after selecting the right sword.', true);
        this.addSlider('Mastery Shoot Delay (ms)', 0, 2000, 600, (v) => (this.shootDelay = Math.round(v)), 'Shoot when a yellow target has less than this much time left.');
        this.addSlider('Control Prediction Ticks', 1, 20, 5, (v) => (this.controlPredictionTicks = Math.round(v)), 'How many ticks ahead to predict the skeleton movement.');

        this.on('tick', () => this.tick());
        this.on('chat', (event) => {
            const raw = String(event?.message?.getUnformattedText?.() ?? event?.message ?? '').toLowerCase();
            if (raw.includes('rank:')) return this.resetTest();
            if (!raw.includes('objective')) return;
            if (raw.includes('control')) return this.setTest(TESTS.CONTROL);
            if (raw.includes('force')) return this.setTest(TESTS.FORCE);
            if (raw.includes('mastery')) return this.setTest(TESTS.MASTERY);
            if (raw.includes('discipline')) return this.setTest(TESTS.DISCIPLINE);
            if (raw.includes('stamina')) return this.setTest(TESTS.STAMINA);
            if (raw.includes('swiftness')) return this.setTest(TESTS.SWIFTNESS);
            if (raw.includes('tenacity')) return this.setTest(TESTS.TENACITY);
        });
    }

    onDisable() {
        this.resetTest();
    }

    setTest(type) {
        this.test = type;
        if (type === TESTS.MASTERY) this.selectBow();
    }

    resetTest() {
        this.test = TESTS.NONE;
        this.targetSkeleton = null;
        this.lastSkeletonPos = null;
        this.staminaTarget = null;
        this.masteryBlocks = [];
        this.firingState = 0;
        this.drawing = false;
        Rotations.stop();
        Client.unpressKeys();
        Client.setKey('rightclick', false);
        Client.getMinecraft().options.keyJump?.setDown?.(false);
        this.pressKeys('');
    }

    pressKeys(keys) {
        ['a', 'd', 'w', 's', 'shift'].forEach((key) => Client.setKey(key, keys.includes(key)));
    }

    tick() {
        if (!this.enabled || this.test === TESTS.NONE) return;
        const player = Player.getPlayer();
        if (!player || !World.isLoaded()) return;
        switch (this.test) {
            case TESTS.CONTROL:
                if (this.enableControl) this.control();
                break;
            case TESTS.FORCE:
                if (this.enableForce) this.force();
                break;
            case TESTS.MASTERY:
                if (this.enableMastery) this.mastery();
                break;
            case TESTS.DISCIPLINE:
                if (this.enableDiscipline) this.discipline();
                break;
            case TESTS.STAMINA:
                if (this.enableStamina) this.stamina();
                break;
            case TESTS.SWIFTNESS:
                if (this.enableSwiftness) this.swiftness();
                break;
            case TESTS.TENACITY:
                if (this.enableTenacity) this.tenacity();
                break;
        }
    }

    zombies() {
        return (World.getAllEntities() || []).filter((entity) => entityClass(entity) instanceof ZombieEntity && !entity.isDead?.());
    }

    // ---- Test of Control ----
    control() {
        const player = Player.getPlayer();
        let closest = null;
        let best = 0;
        for (const entity of World.getAllEntities() || []) {
            if (!isWitherSkeleton(entity)) continue;
            if (headRegistry(entity) === REDSTONE_BLOCK) continue;
            const dist = distanceSq(entity, player);
            if (dist < best || closest === null) {
                best = dist;
                closest = entity;
            }
        }
        this.targetSkeleton = closest;
        if (!closest) return;

        const cx = closest.getX();
        const cy = closest.getY();
        const cz = closest.getZ();
        if (this.lastSkeletonPos) {
            this.skeletonVelX = cx - this.lastSkeletonPos.x;
            this.skeletonVelZ = cz - this.lastSkeletonPos.z;
        }
        this.lastSkeletonPos = { x: cx, y: cy, z: cz };

        const now = Date.now();
        if (now - this.lookCooldown < 40) return;
        this.lookCooldown = now;

        const predX = cx + this.skeletonVelX * this.controlPredictionTicks;
        const predY = cy + 2.5;
        const predZ = cz + this.skeletonVelZ * this.controlPredictionTicks;
        Rotations.lookAtVector({ x: predX, y: predY, z: predZ }, { precision: 3 });
    }

    // ---- Test of Force ----
    force() {
        const player = Player.getPlayer();
        let best = null;
        let bestScore = -1;
        let bestDist = Infinity;
        for (const zombie of this.zombies()) {
            const head = headRegistry(zombie);
            const points = head === 'minecraft:diamond_helmet' ? 30 : head === 'minecraft:golden_helmet' ? 20 : head === 'minecraft:iron_helmet' ? 10 : 0;
            if (points <= 0) continue;
            const dist = distanceSq(zombie, player);
            if (points > bestScore || (points === bestScore && dist < bestDist)) {
                bestScore = points;
                bestDist = dist;
                best = zombie;
            }
        }
        if (!best) return;

        Rotations.lookAtVector({ x: best.getX(), y: best.getY() + 0.8, z: best.getZ() }, { precision: 6 });
        if (Date.now() - this.lastSwing >= 450) {
            Client.leftClick();
            this.lastSwing = Date.now();
        }
    }

    // ---- Test of Mastery ----
    mastery() {
        const now = Date.now();
        this.masteryBlocks = this.masteryBlocks.filter((block) => block.expiry > now && registryAt(block.x, block.y, block.z) === YELLOW_WOOL);

        if (this.firingState === 1) {
            this.firingTimer++;
            if (this.firingTimer < 2) return;
            Client.setKey('rightclick', true);
            this.drawing = true;
            this.firingState = 0;
            this.firingTimer = 0;
            return;
        }

        if (now >= this.lastMasteryScan) {
            this.scanMastery();
            this.lastMasteryScan = now + 125;
        }
        let closest = null;
        let best = Infinity;
        for (const block of this.masteryBlocks) {
            const dx = block.x + 0.5 - Player.getX();
            const dz = block.z + 0.5 - Player.getZ();
            const d = dx * dx + dz * dz;
            if (d < best) {
                best = d;
                closest = block;
            }
        }
        if (!closest) return;

        Rotations.lookAtVector({ x: closest.x + 0.5, y: closest.y + 1.1, z: closest.z + 0.5 });
        const bowSlot = findItemInHotbar('Bow');
        if (bowSlot >= 0 && Player.getHeldItemIndex() !== bowSlot) setItemSlot(bowSlot);

        if (!this.drawing) {
            Client.setKey('rightclick', true);
            this.drawing = true;
        }

        if (closest.color !== 'yellow') return;
        if (closest.expiry - now >= this.shootDelay) return;
        if (!this.drawing) return;

        Client.setKey('rightclick', false);
        this.drawing = false;
        this.firingState = 1;
        this.firingTimer = 0;
        this.masteryBlocks = this.masteryBlocks.filter((block) => block !== closest);
    }

    scanMastery() {
        const baseX = Math.floor(Player.getX());
        const baseY = Math.floor(Player.getY());
        const baseZ = Math.floor(Player.getZ());
        const now = Date.now();
        for (let x = -25; x <= 25; x++) {
            for (let z = -25; z <= 25; z++) {
                if (x * x + z * z > 25 * 25) continue;
                for (let y = -10; y <= 10; y++) {
                    const bx = baseX + x;
                    const by = baseY + y;
                    const bz = baseZ + z;
                    if (registryAt(bx, by, bz) !== YELLOW_WOOL) continue;
                    const duplicate = this.masteryBlocks.some((block) => block.x === bx && block.y === by && block.z === bz);
                    if (!duplicate) this.masteryBlocks.push({ x: bx, y: by, z: bz, color: 'yellow', expiry: now + 3500 });
                }
            }
        }
    }

    selectBow() {
        const slot = findItemInHotbar('Bow');
        if (slot >= 0) setItemSlot(slot);
    }

    // ---- Test of Discipline ----
    discipline() {
        const player = Player.getPlayer();
        let best = null;
        let bestDist = 7 * 7;
        for (const zombie of this.zombies()) {
            const dx = zombie.getX() - player.getX();
            const dy = zombie.getY() + 1.2 - player.getEyePosition().y();
            const dz = zombie.getZ() - player.getZ();
            const dist = Math.hypot(dx, dy, dz);
            if (dist > 6) continue;
            const targetYaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
            const targetPitch = (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI;
            const yawDiff = Math.abs(this.normalizeAngle(targetYaw - player.getYaw()));
            const pitchDiff = Math.abs(targetPitch - player.getPitch());
            if (yawDiff >= 20 || pitchDiff >= 35) continue;
            if (dist * dist >= bestDist) continue;
            bestDist = dist * dist;
            best = zombie;
        }
        if (!best) return;

        const sword = SWORD_BY_HELMET[headRegistry(best)];
        if (!sword) return;
        const slot = this.findSlotByRegistry(sword);
        if (slot === -1) return;
        if (Player.getHeldItemIndex() !== slot) setItemSlot(slot);
        if (this.disciplineAutoAttack && Date.now() - this.lastSwing >= 250) {
            Client.leftClick();
            this.lastSwing = Date.now();
        }
    }

    findSlotByRegistry(registryId) {
        const inventory = Player.getInventory();
        if (!inventory) return -1;
        for (let slot = 0; slot < Math.min(inventory.getSize(), 9); slot++) {
            const item = inventory.getStackInSlot(slot);
            const id = String(item?.getType?.()?.getRegistryName?.() ?? '');
            if (id === registryId) return slot;
        }
        return -1;
    }

    // ---- Test of Stamina ----
    stamina() {
        if (Date.now() >= this.lastStaminaThink) {
            this.staminaTarget = this.findWallGap();
            this.lastStaminaThink = Date.now() + 125;
        }
        const target = this.staminaTarget;
        if (!target) {
            this.pressKeys('');
            return;
        }
        Rotations.lookAtVector({ x: target.x + 0.5, y: Player.getY() + 1.0, z: target.z + 0.5 }, { precision: 5 });
        const dx = target.x + 0.5 - Player.getX();
        const dz = target.z + 0.5 - Player.getZ();
        const facing = this.directionKeys(dx, dz);
        const keys = facing.forward ? 'w' : facing.backward ? 's' : '';
        this.pressKeys(keys);
        if (target.y > Player.getY() + 0.2 && Player.getPlayer().onGround?.() && Date.now() >= this.jumpUntil) {
            Client.getMinecraft().options.keyJump.setDown(true);
            this.jumpUntil = Date.now() + 300;
        } else {
            Client.getMinecraft().options.keyJump.setDown(false);
        }
    }

    findWallGap() {
        const px = Math.floor(Player.getX());
        const py = Math.floor(Player.getY());
        const pz = Math.floor(Player.getZ());
        for (let r = 1; r <= 7; r++) {
            let best = null;
            let bestDist = Infinity;
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const bx = px + dx;
                    const bz = pz + dz;
                    let solidCount = 0;
                    let holeY = null;
                    for (let y = py; y <= py + 3; y++) {
                        if (registryAt(bx, y, bz) !== 'minecraft:air') {
                            solidCount++;
                        } else if (y > py) {
                            holeY = y;
                        }
                    }
                    if (solidCount >= 2 && holeY !== null) {
                        const d = dx * dx + dz * dz;
                        if (d < bestDist) {
                            bestDist = d;
                            best = { x: bx, y: holeY + 0.5, z: bz };
                        }
                    }
                }
            }
            if (best) return best;
        }
        return null;
    }

    // ---- Test of Swiftness ----
    swiftness() {
        const px = Math.floor(Player.getX());
        const py = Math.floor(Player.getY());
        const pz = Math.floor(Player.getZ());
        let target = null;
        let best = Infinity;
        for (let x = -7; x <= 7; x++) {
            for (let z = -7; z <= 7; z++) {
                const bx = px + x;
                const bz = pz + z;
                for (let y = -1; y <= 3; y++) {
                    if (registryAt(bx, py + y, bz) !== GREEN_WOOL) continue;
                    const d = x * x + z * z;
                    if (d < best) {
                        best = d;
                        target = { x: bx, y: py + y, z: bz };
                    }
                }
            }
        }
        if (!target) {
            this.pressKeys('');
            return;
        }
        Rotations.lookAtVector({ x: target.x + 0.5, y: Player.getY() + 1.0, z: target.z + 0.5 }, { precision: 5 });
        const dx = target.x + 0.5 - Player.getX();
        const dz = target.z + 0.5 - Player.getZ();
        const keys = this.directionKeys(dx, dz);
        this.pressKeys(keys.forward ? 'w' : keys.backward ? 's' : (keys.left ? 'a' : 'd'));
        if (target.y > Player.getY() + 0.2 && Player.getPlayer().onGround?.() && Date.now() >= this.jumpUntil) {
            Client.getMinecraft().options.keyJump.setDown(true);
            this.jumpUntil = Date.now() + 300;
        } else {
            Client.getMinecraft().options.keyJump.setDown(false);
        }
    }

    // ---- Test of Tenacity ----
    tenacity() {
        const player = Player.getPlayer();
        let nearest = null;
        let best = Infinity;
        for (const entity of World.getAllEntities() || []) {
            const mc = entityClass(entity);
            if (!(mc instanceof FireballType) && !(mc instanceof SmallFireballType)) continue;
            if (entity.isDead?.()) continue;
            const d = distanceSq(entity, player);
            if (d < best) {
                best = d;
                nearest = entity;
            }
        }
        if (!nearest || best > 6 * 6) {
            this.pressKeys('');
            return;
        }

        const awayX = player.getX() - nearest.getX();
        const awayZ = player.getZ() - nearest.getZ();
        const length = Math.hypot(awayX, awayZ) || 1;
        let keys = '';
        const yaw = (player.getYaw() * Math.PI) / 180;
        const velX = -Math.sin(yaw);
        const velZ = Math.cos(yaw);

        const sideScore = awayX * velZ - awayZ * velX;
        const forwardScore = awayX * velX + awayZ * velZ;
        const norm = (sideScore / length) > 0.15 ? 'd' : (sideScore / length) < -0.15 ? 'a' : '';
        const fwd = (forwardScore / length) > 0.15 ? 'w' : (forwardScore / length) < -0.15 ? 's' : '';
        keys = sideScore !== 0 ? (Math.abs(sideScore) >= Math.abs(forwardScore) ? norm : fwd) : fwd;
        this.pressKeys(keys || (Math.random() > 0.5 ? 'a' : 'd'));
    }

    // ---- helpers ----
    directionKeys(dx, dz) {
        const yaw = (Player.getYaw() * Math.PI) / 180;
        const velX = -Math.sin(yaw);
        const velZ = Math.cos(yaw);
        const forward = dx * velX + dz * velZ;
        const side = dx * velZ - dz * velX;
        return { forward: forward > 0.2, backward: forward < -0.2, right: side > 0.2, left: side < -0.2 };
    }

    normalizeAngle(angle) {
        let normalized = angle % 360;
        if (normalized > 180) normalized -= 360;
        if (normalized < -180) normalized += 360;
        return normalized;
    }
}

export const dojoMacro = new DojoMacro();
