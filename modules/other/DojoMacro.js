import { ModuleBase } from '../../utils/ModuleBase';
import { findItemInHotbar, setItemSlot } from '../../utils/player/Inventory';
import { Rotations } from '../../utils/player/Rotations';
import { ungrab, regrab } from '../../utils/Ungrab';
import { ZombieEntity } from '../../utils/Constants';

const EquipmentSlot = net.minecraft.world.entity.EquipmentSlot;
const SkeletonType = net.minecraft.world.entity.monster.skeleton.Skeleton;
const WitherSkeletonType = net.minecraft.world.entity.monster.skeleton.WitherSkeleton;
const SmallFireballType = net.minecraft.world.entity.projectile.SmallFireball;
const FireballType = net.minecraft.world.entity.projectile.Fireball;

const YELLOW_WOOL = 'minecraft:yellow_wool';
const GREEN_WOOL = 'minecraft:green_wool';
const REDSTONE_BLOCK = 'minecraft:redstone_block';

const TARGET_GREEN = new RenderColor(0, 255, 0, 120);
const DECOY_RED = new RenderColor(255, 0, 0, 120);

// Control aim deadband and lead clamps. The rotation engine is designed for settling on a
// target - re-issuing every tick at a moving point makes it chase and shake. Issue only
// when the skeleton has drifted past the deadband AND enough time passed since the last
// nudge, so every move is a small smooth step the engine fully completes.
const AIM_DEADBAND_DEGREES = 2.5;
const LEAD_MAX_BLOCKS = 1.6;
const MASTERY_MAX_RANGE = 18;
const MASTERY_SCAN_MS = 150;

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
const isSkeleton = (entity) => {
    const mc = entityClass(entity);
    return mc instanceof WitherSkeletonType || mc instanceof SkeletonType;
};

class DojoMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Dojo Macro',
            subcategory: 'Combat',
            description: 'Auto-completes every Crimson Isle Dojo test. Control/Mastery/Discipline base logic from OdinClient (skies-starred); Force, Stamina, Swiftness and Tenacity added here. Smooth deadband aiming on the V5 rotation engine with a hard target lock.',
        });

        this.test = TESTS.NONE;
        this.targetEntity = null;
        this.targetUuid = null;
        this.lastAimAt = 0;
        this.lastAimPos = null;
        this.lastSwing = 0;
        this.masteryBlocks = [];
        this.lockedBlock = null;
        this.firedBlock = null;
        this.firingState = 0;
        this.firingTimer = 0;
        this.drawing = false;
        this.lastMasteryScan = 0;
        this.lastStaminaThink = 0;
        this.staminaTarget = null;
        this.jumpUntil = 0;
        this.shootDelay = 600;
        this.aimRefreshMs = 160;

        this.addToggle('Test of Control', (v) => (this.enableControl = !!v), 'Aim at the moving skeleton (locked target, green box).', true);
        this.addToggle('&cTest of Force', (v) => (this.enableForce = !!v), 'Knock zombies into the lava. WIP.', true);
        this.addToggle('Test of Mastery', (v) => (this.enableMastery = !!v), 'Shoot the wool targets (one locked target at a time).', true);
        this.addToggle('Test of Discipline', (v) => (this.enableDiscipline = !!v), 'Attack with the matching sword. WIP movement.', true);
        this.addToggle('&cTest of Stamina', (v) => (this.enableStamina = !!v), 'Steer through the wall gaps. WIP.', true);
        this.addToggle('&cTest of Swiftness', (v) => (this.enableSwiftness = !!v), 'Follow the green wool snake. WIP.', true);
        this.addToggle('&cTest of Tenacity', (v) => (this.enableTenacity = !!v), 'Dodge the ghast fireballs. WIP.', true);
        this.addToggle('Discipline Auto Attack', (v) => (this.disciplineAutoAttack = !!v), 'Left-click the zombie after selecting the right sword.', true);
        this.addSlider('Mastery Shoot Delay (ms)', 0, 2000, 600, (v) => (this.shootDelay = Math.round(v)), 'Shoot when a locked target has less than this much time left.');
        this.addSlider('Control Aim Refresh (ms)', 80, 400, 160, (v) => (this.aimRefreshMs = Math.round(v)), 'How often the rotation engine may nudge toward the skeleton (low = smoother).');

        this.on('tick', () => this.tick());
        this.on('worldUnload', () => this.resetTest(true));
        this.on('chat', (event) => {
            const raw = String(event?.message?.getUnformattedText?.() ?? event?.message ?? '').toLowerCase();
            if (raw.includes('challenge completed') || raw.includes('your rank:') || raw.includes('rank:')) return this.resetTest(true);
            if (!raw.includes('objective')) return;
            if (raw.includes('control')) return this.setTest(TESTS.CONTROL);
            if (raw.includes('force')) return this.setTest(TESTS.FORCE);
            if (raw.includes('mastery')) return this.setTest(TESTS.MASTERY);
            if (raw.includes('discipline')) return this.setTest(TESTS.DISCIPLINE);
            if (raw.includes('stamina')) return this.setTest(TESTS.STAMINA);
            if (raw.includes('swiftness')) return this.setTest(TESTS.SWIFTNESS);
            if (raw.includes('tenacity')) return this.setTest(TESTS.TENACITY);
        });
        register('postRenderWorld', () => this.renderWorld());
    }

    onDisable() {
        this.resetTest(false);
        regrab();
    }

    setTest(type) {
        this.test = type;
        this.targetEntity = null;
        this.targetUuid = null;
        this.lockedBlock = null;
        this.firedBlock = null;
        this.lastAimPos = null;
        this.lastAimAt = 0;
        Rotations.stop();
        ungrab();
        if (type === TESTS.MASTERY) this.selectBow();
    }

    resetTest(completed) {
        this.test = TESTS.NONE;
        this.targetEntity = null;
        this.targetUuid = null;
        this.lockedBlock = null;
        this.firedBlock = null;
        this.lastAimPos = null;
        this.masteryBlocks = [];
        this.firingState = 0;
        this.firingTimer = 0;
        this.drawing = false;
        Rotations.stop();
        Client.setKey('rightclick', false);
        Client.getMinecraft().options.keyJump?.setDown?.(false);
        Client.unpressKeys();
        this.pressKeys('');
        if (completed) regrab();
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

    skeletons() {
        return (World.getAllEntities() || []).filter((entity) => isSkeleton(entity) && !entity.isDead?.());
    }

    // ---- Test of Control ----
    // A hard UUID lock (a replica can never steal the aim) driven by the V5 rotation
    // engine in small smooth nudges: only when the skeleton drifts past the deadband AND
    // the refresh time has elapsed. Nothing is issued - and no target means no aim at all.
    control() {
        const target = this.lockedTarget();
        if (!target) {
            Rotations.stop();
            this.lastAimPos = null;
            return;
        }

        const aim = Rotations.getAimPoint(target);
        if (!aim) {
            this.lastAimPos = null;
            return;
        }

        if (this.lastAimPos) {
            const leadX = Math.max(-LEAD_MAX_BLOCKS, Math.min(LEAD_MAX_BLOCKS, aim.x - this.lastAimPos.x));
            const leadZ = Math.max(-LEAD_MAX_BLOCKS, Math.min(LEAD_MAX_BLOCKS, aim.z - this.lastAimPos.z));
            aim.x += leadX;
            aim.z += leadZ;
        }

        const angles = this.anglesFromPoint(aim.x, aim.y, aim.z);
        if (!angles) return;
        const drift = Math.hypot(this.normalizeAngle(angles.yaw - Player.getYaw()), angles.pitch - Player.getPitch());
        if (drift < AIM_DEADBAND_DEGREES) return;
        if (Date.now() - this.lastAimAt < this.aimRefreshMs) return;

        this.lastAimAt = Date.now();
        this.lastAimPos = { x: aim.x, y: aim.y, z: aim.z };
        Rotations.lookAtVector(aim, { precision: 1.5 });
    }

    lockedTarget() {
        if (this.targetEntity && !this.targetEntity.isDead?.()) return this.targetEntity;
        this.targetEntity = null;
        this.targetUuid = null;
        this.lastAimPos = null;

        const player = Player.getPlayer();
        let best = null;
        let bestDist = Infinity;
        for (const entity of this.skeletons()) {
            if (headRegistry(entity) === REDSTONE_BLOCK) continue;
            const dist = distanceSq(entity, player);
            if (dist < bestDist) {
                bestDist = dist;
                best = entity;
            }
        }
        if (!best) return null;
        this.targetEntity = best;
        this.targetUuid = String(best.getUUID?.() ?? '');
        this.lastAimPos = null;
        return best;
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
    // Selection picks ONE block (soonest to turn red, nearest tiebreak, within range,
    // never the just-fired one) and aims at it a single time - blocks do not move, so it
    // is never re-aimed. Release always happens on the expiry threshold OR when the block
    // goes red/gone, so the draw can never get stuck writing.
    mastery() {
        const now = Date.now();
        this.masteryBlocks = this.masteryBlocks.filter((block) => block.expiry > now && registryAt(block.x, block.y, block.z) === YELLOW_WOOL);
        if (this.firedBlock && registryAt(this.firedBlock.x, this.firedBlock.y, this.firedBlock.z) !== YELLOW_WOOL) this.firedBlock = null;
        if (this.lockedBlock && registryAt(this.lockedBlock.x, this.lockedBlock.y, this.lockedBlock.z) !== YELLOW_WOOL) {
            this.releaseBow();
            this.lockedBlock = null;
        }

        if (this.firingState === 1) {
            this.firingTimer++;
            if (this.firingTimer < 2) return;
            Client.setKey('rightclick', true);
            this.drawing = true;
            this.firingState = 0;
            this.firingTimer = 0;
            return;
        }

        if (!this.lockedBlock) {
            if (now >= this.lastMasteryScan) {
                this.scanMastery();
                this.lastMasteryScan = now + MASTERY_SCAN_MS;
            }
            this.lockedBlock = this.pickMasteryTarget();
            if (!this.lockedBlock) return;
            const block = this.lockedBlock;
            Rotations.lookAtVector({ x: block.x + 0.5, y: block.y + 1.1, z: block.z + 0.5 });
            const bowSlot = findItemInHotbar('Bow');
            if (bowSlot >= 0 && Player.getHeldItemIndex() !== bowSlot) setItemSlot(bowSlot);
            return;
        }

        const block = this.lockedBlock;
        if (!this.drawing) {
            Client.setKey('rightclick', true);
            this.drawing = true;
        }
        if (block.expiry - now >= this.shootDelay) return;

        this.releaseBow();
        this.firedBlock = { x: block.x, y: block.y, z: block.z };
        this.lockedBlock = null;
    }

    pickMasteryTarget() {
        const px = Player.getX();
        const pz = Player.getZ();
        let best = null;
        for (const block of this.masteryBlocks) {
            const dx = block.x + 0.5 - px;
            const dz = block.z + 0.5 - pz;
            if (dx * dx + dz * dz > MASTERY_MAX_RANGE * MASTERY_MAX_RANGE) continue;
            if (this.firedBlock && this.firedBlock.x === block.x && this.firedBlock.y === block.y && this.firedBlock.z === block.z) continue;
            if (!best) {
                best = block;
                continue;
            }
            const dBest = (best.x + 0.5 - px) * (best.x + 0.5 - px) + (best.z + 0.5 - pz) * (best.z + 0.5 - pz);
            const dBlock = dx * dx + dz * dz;
            if (block.expiry < best.expiry || (block.expiry === best.expiry && dBlock < dBest)) best = block;
        }
        return best;
    }

    releaseBow() {
        Client.setKey('rightclick', false);
        this.drawing = false;
        this.firingState = 1;
        this.firingTimer = 0;
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
                    if (!duplicate) this.masteryBlocks.push({ x: bx, y: by, z: bz, expiry: now + 3500 });
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
        this.pressKeys(keys.forward ? 'w' : keys.backward ? 's' : (keys.right ? 'd' : 'a'));
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
        const yaw = (player.getYaw() * Math.PI) / 180;
        const velX = -Math.sin(yaw);
        const velZ = Math.cos(yaw);

        const sideScore = (awayX * velZ - awayZ * velX) / length;
        const forwardScore = (awayX * velX + awayZ * velZ) / length;
        const norm = sideScore > 0.15 ? 'd' : sideScore < -0.15 ? 'a' : '';
        const fwd = forwardScore > 0.15 ? 'w' : forwardScore < -0.15 ? 's' : '';
        this.pressKeys(Math.abs(sideScore) >= Math.abs(forwardScore) && norm ? norm : fwd || (Math.random() > 0.5 ? 'a' : 'd'));
    }

    // ---- helpers ----
    anglesFromPoint(x, y, z) {
        const player = Player.getPlayer();
        if (!player) return null;
        const dx = x - player.getX();
        const dy = y - player.getEyePosition().y();
        const dz = z - player.getZ();
        if (dx === 0 && dz === 0) return { yaw: Player.getYaw(), pitch: (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI };
        return { yaw: (Math.atan2(-dx, dz) * 180) / Math.PI, pitch: (Math.atan2(-dy, Math.hypot(dx, dz)) * 180) / Math.PI };
    }

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

    renderWorld() {
        if (!this.enabled || this.test !== TESTS.CONTROL) return;
        let green = [];
        let red = [];
        for (const entity of this.skeletons()) {
            if (this.targetEntity && String(entity.getUUID?.() ?? '') === this.targetUuid && !entity.isDead?.()) green.push(entity.toMC());
            else red.push(entity.toMC());
        }
        if (green.length) Render3D.drawHitboxes(green, TARGET_GREEN, 5, false);
        if (red.length) Render3D.drawHitboxes(red, DECOY_RED, 5, false);
    }
}

export const dojoMacro = new DojoMacro();
