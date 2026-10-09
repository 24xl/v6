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
const RED_WOOL = 'minecraft:red_wool';
const GREEN_WOOL = 'minecraft:green_wool';
const REDSTONE_BLOCK = 'minecraft:redstone_block';

const TARGET_GREEN = new RenderColor(0, 255, 0, 120);
const DECOY_RED = new RenderColor(255, 0, 0, 120);

const MASTERY_MAX_RANGE = 18;
const MASTERY_SCAN_MS = 150;
const POST_FIRE_HOLDOFF_MS = 450;
const GROUND_RADIUS = 8;
const ATTACK_RANGE_SQ = 3.2 ** 2;

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
const isSolid = (x, y, z) => {
    const id = registryAt(x, y, z);
    return id !== 'minecraft:air' && id !== 'minecraft:cave_air' && id !== 'minecraft:lava';
};
const isPassable = (x, y, z) => {
    const id = registryAt(x, y, z);
    return id === 'minecraft:air' || id === 'minecraft:cave_air';
};

class DojoMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Dojo Macro',
            subcategory: 'Combat',
            description: 'v1.8 - Auto-completes every Crimson Isle Dojo test. Control (native smooth trackEntity + hard UUID lock + WASD edge recovery) and Mastery (fires on red wool, one locked target) are polished; the "-" tests are WIP.',
        });
        console.log('[V5] DojoMacro v1.8 active');

        this.test = TESTS.NONE;
        this.targetEntity = null;
        this.targetUuid = null;
        this.trackedUuid = null;
        this.lastSwing = 0;
        this.masteryBlocks = [];
        this.lockedBlock = null;
        this.firedBlock = null;
        this.firingState = 0;
        this.firingTimer = 0;
        this.drawing = false;
        this.lastMasteryScan = 0;
        this.lockPendingUntil = 0;
        this.lastGroundMap = null;
        this.lastGroundMapAt = 0;
        this.humanPauseUntil = 0;
        this.lastStaminaThink = 0;
        this.staminaTarget = null;
        this.jumpUntil = 0;
        this.shootDelay = 600;

        this.addToggle('Test of Control', (v) => (this.enableControl = !!v), 'Lock onto the moving skeleton; smooth follow; WASD dodge while keeping the stare.', true);
        this.addToggle('- Test of Force', (v) => (this.enableForce = !!v), 'Knock zombies into the lava. WIP.', true);
        this.addToggle('Test of Mastery', (v) => (this.enableMastery = !!v), 'One locked target, fires when it turns red wool.', true);
        this.addToggle('- Test of Discipline', (v) => (this.enableDiscipline = !!v), 'Ground-paths to the nearest zombie and hits it with the right sword. WIP.', true);
        this.addToggle('- Test of Stamina', (v) => (this.enableStamina = !!v), 'Steer through the wall gaps. WIP.', true);
        this.addToggle('- Test of Swiftness', (v) => (this.enableSwiftness = !!v), 'Follow the green wool snake. WIP.', true);
        this.addToggle('- Test of Tenacity', (v) => (this.enableTenacity = !!v), 'Dodge the ghast fireballs. WIP.', true);
        this.addToggle('Discipline Auto Attack', (v) => (this.disciplineAutoAttack = !!v), 'Left-click the zombie after selecting the right sword.', true);

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
        this.trackedUuid = null;
        this.lockedBlock = null;
        this.firedBlock = null;
        this.staminaTarget = null;
        Rotations.stop();
        ungrab();
        if (type === TESTS.MASTERY) this.selectBow();
    }

    resetTest(completed) {
        this.test = TESTS.NONE;
        this.targetEntity = null;
        this.targetUuid = null;
        this.trackedUuid = null;
        this.lockedBlock = null;
        this.firedBlock = null;
        this.masteryBlocks = [];
        this.firingState = 0;
        this.firingTimer = 0;
        this.drawing = false;
        this.humanPauseUntil = 0;
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

    // ---- movement core (WASD only, never rotates the camera) ----
    groundMap() {
        const px = Math.floor(Player.getX());
        const py = Math.floor(Player.getY());
        const pz = Math.floor(Player.getZ());
        const floorY = py - 1;
        const cells = new Set();
        const edges = new Set();
        let minX = px, maxX = px, minZ = pz, maxZ = pz;
        for (let x = px - GROUND_RADIUS; x <= px + GROUND_RADIUS; x++) {
            for (let z = pz - GROUND_RADIUS; z <= pz + GROUND_RADIUS; z++) {
                if (!isSolid(x, floorY, z)) continue;
                if (!isPassable(x, floorY + 1, z)) continue;
                if (!isPassable(x, floorY + 2, z)) continue;
                cells.add(`${x},${z}`);
            }
        }
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const walkable = (x, z) => cells.has(`${x},${z}`);
        for (const key of cells) {
            const parts = key.split(',');
            const x = Number(parts[0]);
            const z = Number(parts[1]);
            for (const [dx, dz] of dirs) {
                if (!walkable(x + dx, z + dz)) {
                    edges.add(key);
                    break;
                }
            }
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        }
        return {
            cells,
            edges,
            center: cells.size ? { x: Math.round((minX + maxX) / 2), z: Math.round((minZ + maxZ) / 2) } : null,
        };
    }

    playerCell() {
        return `${Math.floor(Player.getX())},${Math.floor(Player.getZ())}`;
    }

    moveToward(x, z) {
        const player = Player.getPlayer();
        const dx = x + 0.5 - player.getX();
        const dz = z + 0.5 - player.getZ();
        const yaw = (player.getYaw() * Math.PI) / 180;
        const fX = -Math.sin(yaw);
        const fZ = Math.cos(yaw);
        const forward = dx * fX + dz * fZ;
        const side = dx * fZ - dz * fX;
        let keys = '';
        if (Math.abs(side) > Math.abs(forward)) keys = side > 0.15 ? 'd' : side < -0.15 ? 'a' : '';
        else keys = forward > 0.15 ? 'w' : forward < -0.15 ? 's' : '';
        const now = Date.now();
        if (keys && now < this.humanPauseUntil) keys = '';
        else if (keys && Math.random() < 0.06) this.humanPauseUntil = now + 60 + Math.random() * 120;
        this.pressKeys(keys);
    }

    refreshGroundMap() {
        const now = Date.now();
        if (now - this.lastGroundMapAt >= 250) {
            this.lastGroundMap = this.groundMap();
            this.lastGroundMapAt = now;
        }
    }

    isPlayerOnEdge() {
        return this.lastGroundMap?.edges?.has(this.playerCell()) ?? false;
    }

    isThreatened() {
        const player = Player.getPlayer();
        for (const entity of World.getAllEntities() || []) {
            const mc = entityClass(entity);
            if (!(mc instanceof FireballType) && !(mc instanceof SmallFireballType)) continue;
            if (entity.isDead?.()) continue;
            if (distanceSq(entity, player) <= 6.5 * 6.5) return true;
        }
        return false;
    }

    // ---- Test of Control ----
    // Aim = our engine's native tracking, engaged ONCE per locked skeleton (smooth follow
    // every render frame). Nothing tracks until a target exists. While following, if we sit
    // on an edge or a fireball is incoming, WASD back toward the center WITHOUT losing the
    // stare - the mob is ignored.
    control() {
        const target = this.lockedTarget();
        if (!target) {
            Rotations.stop();
            this.trackedUuid = null;
            this.pressKeys('');
            return;
        }
        if (this.trackedUuid !== this.targetUuid) {
            Rotations.trackEntity(target, { precision: 2 });
            this.trackedUuid = this.targetUuid;
        }

        this.refreshGroundMap();
        if (this.isPlayerOnEdge() || this.isThreatened()) {
            const center = this.lastGroundMap.center;
            if (center) this.moveToward(center.x, center.z);
            else this.pressKeys('');
        } else {
            this.pressKeys('');
        }
    }

    lockedTarget() {
        if (this.targetEntity && !this.targetEntity.isDead?.()) return this.targetEntity;
        this.targetEntity = null;
        this.targetUuid = null;
        this.trackedUuid = null;

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
    // One locked target, nothing else can be aimed; fires when the block actually turns RED
    // wool (32 pts) - no expiry guessing, no re-pick of the just-fired block, and a holdoff
    // after firing so the shot resolves before the next lock.
    mastery() {
        const now = Date.now();
        this.masteryBlocks = this.masteryBlocks.filter((block) => {
            const id = registryAt(block.x, block.y, block.z);
            return id === YELLOW_WOOL || id === RED_WOOL;
        });
        if (this.firedBlock) {
            const id = registryAt(this.firedBlock.x, this.firedBlock.y, this.firedBlock.z);
            if (id !== YELLOW_WOOL && id !== RED_WOOL) this.firedBlock = null;
        }
        if (this.lockedBlock) {
            const id = registryAt(this.lockedBlock.x, this.lockedBlock.y, this.lockedBlock.z);
            if (id !== YELLOW_WOOL && id !== RED_WOOL) {
                if (this.drawing) this.releaseBow();
                this.lockedBlock = null;
            }
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

        if (now < this.lockPendingUntil) return;

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
        if (registryAt(block.x, block.y, block.z) !== RED_WOOL) return;

        this.releaseBow();
        this.firedBlock = { x: block.x, y: block.y, z: block.z };
        this.lockedBlock = null;
        this.lockPendingUntil = now + POST_FIRE_HOLDOFF_MS;
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
            const isRed = registryAt(block.x, block.y, block.z) === RED_WOOL;
            if (!best) {
                best = block;
                continue;
            }
            const bestRed = registryAt(best.x, best.y, best.z) === RED_WOOL;
            if (isRed !== bestRed) {
                if (isRed) best = block;
                continue;
            }
            if (block.expiry < best.expiry) {
                best = block;
                continue;
            }
            if (block.expiry === best.expiry) {
                const bestD = (best.x + 0.5 - px) * (best.x + 0.5 - px) + (best.z + 0.5 - pz) * (best.z + 0.5 - pz);
                const blockD = dx * dx + dz * dz;
                if (blockD < bestD) best = block;
            }
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
                    const id = registryAt(bx, by, bz);
                    if (id !== YELLOW_WOOL && id !== RED_WOOL) continue;
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
    // Maps the platform ground, marks the edges, then WASD-paths (no camera aiming) to the
    // closest safe zombie, and only rotates to face + strike it with the matching sword when
    // in range.
    discipline() {
        const player = Player.getPlayer();
        this.refreshGroundMap();
        const ground = this.lastGroundMap || { cells: this.groundMap().cells, edges: new Set(), center: null };

        let best = null;
        let bestDist = 12 * 12;
        for (const zombie of this.zombies()) {
            if (!SWORD_BY_HELMET[headRegistry(zombie)]) continue;
            const cell = `${Math.floor(zombie.getX())},${Math.floor(zombie.getZ())}`;
            if (!ground.cells.has(cell) || ground.edges.has(cell)) continue;
            const dx = zombie.getX() - player.getX();
            const dz = zombie.getZ() - player.getZ();
            const d = dx * dx + dz * dz;
            if (d < bestDist) {
                bestDist = d;
                best = zombie;
            }
        }

        const playerCell = this.playerCell();
        if (ground.edges.has(playerCell)) {
            if (ground.center) this.moveToward(ground.center.x, ground.center.z);
            else this.pressKeys('');
            return;
        }
        if (!best) {
            this.pressKeys('');
            return;
        }

        if (bestDist > ATTACK_RANGE_SQ) {
            this.moveToward(best.getX(), best.getZ());
            return;
        }

        Rotations.lookAtVector({ x: best.getX(), y: best.getY() + 1.0, z: best.getZ() }, { precision: 5 });
        const swordSlot = this.findSlotByRegistry(SWORD_BY_HELMET[headRegistry(best)]);
        if (swordSlot >= 0 && Player.getHeldItemIndex() !== swordSlot) setItemSlot(swordSlot);
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
        this.moveToward(target.x, target.z);
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
                        if (isSolid(bx, y, bz)) {
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
        this.moveToward(target.x, target.z);
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
        this.moveToward(player.getX() + (awayX / length) * 3, player.getZ() + (awayZ / length) * 3);
    }

    // ---- helpers ----
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
