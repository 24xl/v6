import { ArmorStandEntity, CreeperEntity, DataComponents, EndermanEntity, MobEntity, PlayerEntity, Vec3d, ZombieEntity } from '../../utils/Constants';
import { angleToPlayer, getDistance, getDistanceToPlayer } from '../../utils/Math';
import { ModuleBase } from '../../utils/ModuleBase';
import { CombatNavigator } from '../../utils/combat/CombatNavigator';
import { CombatRotations } from '../../utils/combat/CombatRotations';
import { CombatWalker } from '../../utils/combat/CombatWalker';
import { isLineClear, isLookingAtEntity } from '../../utils/Raytrace';

const STATES = {
    IDLE: 'IDLE',
    PATHING: 'PATHING',
    FIGHTING: 'FIGHTING',
};

const parseNames = (value) => [
    ...new Set(
        String(value)
            .split(',')
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean)
    ),
];

const BLACKHOLE_TEXTURES = new Set([
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE4NDg2Nzc3MywKICAicHJvZmlsZUlkIiA6ICJjNmViMzdjNmE4YjM0MDI3OGJjN2FmZGE3ZjMxOWJmMyIsCiAgInByb2ZpbGVOYW1lIiA6ICJFbFJleUNhbGFiYXphbCIsCiAgInNpZ25hdHVyZVJlcXVpcmVkIiA6IHRydWUsCiAgInRleHR1cmVzIiA6IHsKICAgICJTS0lOIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS81NWI3MGYwOTRlMDE2Nzk1MDhkZDViY2EzOTY0MGVkOWVjNWM2YzY3OTJmYmQ4ZjU3YzAzYjNhMTJmOWMwYTkyIiwKICAgICAgIm1ldGFkYXRhIiA6IHsKICAgICAgICAibW9kZWwiIDogInNsaW0iCiAgICAgIH0KICAgIH0KICB9Cn0=',
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE4NDg1MjkxMCwKICAicHJvZmlsZUlkIiA6ICI5OWY1MzhjMDhlN2E0NTg3YmU4MGJjNGVmNzU0ZmQyMSIsCiAgInByb2ZpbGVOYW1lIiA6ICJTb2xvV1MyIiwKICAic2lnbmF0dXJlUmVxdWlyZWQiIDogdHJ1ZSwKICAidGV4dHVyZXMiIDogewogICAgIlNLSU4iIDogewogICAgICAidXJsIiA6ICJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlL2Q2MWI4N2YxYTEwNDBhOGI5MjJjYTUxYmU5YzBiYzZkNmZjNzFiYTVkNzQ1YzZiZjY1OWNiZDBkOWE5Y2Y0ZmMiLAogICAgICAibWV0YWRhdGEiIDogewogICAgICAgICJtb2RlbCIgOiAic2xpbSIKICAgICAgfQogICAgfQogIH0KfQ==',
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE5OTQ3NjI5MiwKICAicHJvZmlsZUlkIiA6ICI0YWY1YmQ3NTdmZDE0MWEwOTczYmUxNTFkZWRjNmM5ZiIsCiAgInByb2ZpbGVOYW1lIiA6ICJjcmFzaGludG95b3VybW9tIiwKICAic2lnbmF0dXJlUmVxdWlyZWQiIDogdHJ1ZSwKICAidGV4dHVyZXMiIDogewogICAgIlNLSU4iIDogewogICAgICAidXJsIiA6ICJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlLzhkMzQ1NmUyZDkwZjQxMmM1NzA5MjViNTI4YmI1YTNlNGUxZTZhM2YyNGVmODIwYTZiMWNlNDJhYzhlMDA2MDIiLAogICAgICAibWV0YWRhdGEiIDogewogICAgICAgICJtb2RlbCIgOiAic2xpbSIKICAgICAgfQogICAgfQogIH0KfQ==',
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE5OTcxODMwNSwKICAicHJvZmlsZUlkIiA6ICI4NzczZWRiODZmYWQ0MTczOGFiYWJhNTUxMWM3MDcwZSIsCiAgInByb2ZpbGVOYW1lIiA6ICJjb3NtaWNwb3RhdG9lcyIsCiAgInNpZ25hdHVyZVJlcXVpcmVkIiA6IHRydWUsCiAgInRleHR1cmVzIiA6IHsKICAgICJTS0lOIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS9mNDM4YzZiYzUwMTk4NWNiYTA3OTZkODE3OTcxZTY4Njc5M2JlMDhiZTQyYjUzODVkN2QwYjkzZDg4MTUyMDE5IiwKICAgICAgIm1ldGFkYXRhIiA6IHsKICAgICAgICAibW9kZWwiIDogInNsaW0iCiAgICAgIH0KICAgIH0KICB9Cn0=',
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE5OTY5MzM4NCwKICAicHJvZmlsZUlkIiA6ICIzZmM3ZmRmOTM5NjM0YzQxOTExOTliYTNmN2NjM2ZlZCIsCiAgInByb2ZpbGVOYW1lIiA6ICJZZWxlaGEiLAogICJzaWduYXR1cmVSZXF1aXJlZCIgOiB0cnVlLAogICJ0ZXh0dXJlcyIgOiB7CiAgICAiU0tJTiIgOiB7CiAgICAgICJ1cmwiIDogImh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvMTI5MDc4MTM3ZWEwOTcxOTQ0YzM3NzQxODY3MTcyNjE2NmI3NTFiZDgzOTVlNDcxNDYwMTk1MjJjNzU3ODIyOSIsCiAgICAgICJtZXRhZGF0YSIgOiB7CiAgICAgICAgIm1vZGVsIiA6ICJzbGltIgogICAgICB9CiAgICB9CiAgfQp9',
    'ewogICJ0aW1lc3RhbXAiIDogMTczNjE5OTc0NTg5NCwKICAicHJvZmlsZUlkIiA6ICJmYjZkM2E5Zjk3MWY0ZTdlYmQ0MjE2Yjk0MjE5NDA3NCIsCiAgInByb2ZpbGVOYW1lIiA6ICJtYXJjaXhkZCIsCiAgInNpZ25hdHVyZVJlcXVpcmVkIiA6IHRydWUsCiAgInRleHR1cmVzIiA6IHsKICAgICJTS0lOIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS9jYjgzMmZjOTdkMzhjY2NhOGJkMTE4YmZiZGEyZmE1N2M1MjA4ZTFmYmJkNmI4ZWE0MjhmNzBjN2NhMTY1NmY0IiwKICAgICAgIm1ldGFkYXRhIiA6IHsKICAgICAgICAibW9kZWwiIDogInNsaW0iCiAgICAgIH0KICAgIH0KICB9Cn0=',
]);

const ATTACK_REACH = 4;
const NAMETAG_MOB_RANGE = 1;
const PATH_HANDOFF_DISTANCE = 6;
const REPATH_DISTANCE = 2;
const REPATH_DELAY_MS = 700;
const PATH_FAILURE_BLACKLIST_MS = 12000;
const VISIBILITY_GRACE_MS = 750;
const TARGET_SCAN_INTERVAL = 3;
const TARGET_SWITCH_MARGIN = 2.5;
const NAME_CACHE_MS = 500;
const DEFAULT_SCAN_RADIUS = 24;
const MIN_SCAN_RADIUS = 12;
const MAX_SCAN_RADIUS = 50;
const SCAN_Y_RANGE = 12;

const BLACKHOLE_AVOID_RADIUS = 8.5;
const BLACKHOLE_SCAN_INTERVAL = 20;
const BLACKHOLE_SCAN_RADIUS = 30;
const BLACKHOLE_SCAN_Y_RANGE = 20;
const BLACKHOLE_MEMORY_MS = 60000;
const BLACKHOLE_MERGE_RADIUS = 2.5;

const CURRENT_TARGET_COLOR = new RenderColor(255, 0, 0, 100);
const NEXT_TARGET_COLOR = new RenderColor(0, 255, 0, 120);
const CURRENT_TARGET_THICKNESS = 7;
const NEXT_TARGET_THICKNESS = 5;

const COMBAT_PRESETS = {
    Graveyard: {
        entityClass: ZombieEntity,
        checkVisibility: false,
        boundaryCheck: (x, y) => y >= 60 && y <= 100 && x <= -72,
    },
    Endermen: {
        entityClass: EndermanEntity,
        checkVisibility: true,
    },
    Ghost: {
        entityClass: CreeperEntity,
        entityCheck: (entity) => entity.isPowered(),
        allowInvisible: true,
    },
    Goblins: {
        names: ['Goblin', 'Weakling', 'Knifethrower', 'Fireslinger'],
        checkVisibility: true,
        boundaryCheck: (x, y, z) => y > 127 && !(z > 153 && x < -157) && !(z < 148 && x > -77),
    },
    'Ice Walkers': {
        names: ['Ice Walker', 'Glacite Walker'],
        checkVisibility: true,
        boundaryCheck: (x, y, z) => y >= 127 && y <= 145 && z <= 180 && z >= 130 && x <= 80,
    },
};

class Combat extends ModuleBase {
    constructor() {
        super({
            name: 'Combat Bot',
            subcategory: 'Combat',
            description: 'Automatically hunts entities matching configured names.',
            tooltip: 'Enter one or more entity names, then toggle with the module keybind.',
            theme: '#c74d4d',
            isMacro: true,
        });

        this.bindToggleKey('Toggle Combat Bot');

        this.externalTargets = null;
        this.enabledPresets = new Set(['Graveyard']);
        this.targetNames = [];
        this.targetNameBlacklist = [];
        this.targets = [];
        this.target = null;
        this.trackedTarget = null;
        this.state = STATES.IDLE;

        this.pathToken = 0;
        this.pathStartedAt = 0;
        this.pathTargetPosition = null;
        this.nextAttackAt = 0;

        this.blacklistedTargets = new Map();
        this.visibleUntil = new Map();
        this.nameCache = new Map();
        this.targetUuids = new Set();
        this.nextTarget = null;
        this.activeBlackholes = [];
        this.scanTicker = 0;
        this.targetScanTicker = 0;

        this.pathfindingThreshold = 15;
        this.attackCPS = 10;
        this.attackButton = 'Left Click';
        this.scanRadius = DEFAULT_SCAN_RADIUS;

        this.addSlider(
            'Scan Radius',
            MIN_SCAN_RADIUS,
            MAX_SCAN_RADIUS,
            DEFAULT_SCAN_RADIUS,
            (value) => {
                this.scanRadius = value;
            },
            'Radius (blocks) to search for nearby targets. Lower = better FPS.'
        );

        this.addSlider(
            'Pathfinding Threshold',
            5,
            30,
            15,
            (value) => {
                this.pathfindingThreshold = value;
            },
            'Distance to switch from direct pursuit to pathfinding'
        );

        this.addSlider(
            'Attack CPS',
            5,
            15,
            10,
            (value) => {
                this.attackCPS = value;
            },
            'Average attacks per second'
        );

        this.addMultiToggle(
            'Attack Button',
            ['Left Click', 'Right Click'],
            true,
            (selected) => {
                this.attackButton = selected.find((item) => item.enabled)?.name || 'Left Click';
            },
            'Mouse button used to attack.',
            'Left Click'
        );

        this.addMultiToggle(
            'Target Presets',
            Object.keys(COMBAT_PRESETS),
            false,
            (selected) => {
                this.enabledPresets.clear();
                selected.forEach((item) => {
                    if (item.enabled && COMBAT_PRESETS[item.name]) this.enabledPresets.add(item.name);
                });
            },
            'Select built-in mob types to target when running standalone.',
            'Graveyard'
        );

        this.addTextInput(
            'Target Names',
            '',
            (value) => (this.targetNames = parseNames(value)),
            'Case-insensitive nametag text separated by commas. Matches partial names and links armor stands to mob hitboxes within 1 block.'
        );

        this.addTextInput(
            'Target Name Blacklist',
            '',
            (value) => (this.targetNameBlacklist = parseNames(value)),
            'Case-insensitive entity names to exclude, separated by commas.'
        );

        this.createOverlay([
            {
                title: 'Status',
                data: {
                    State: () => this.state,
                    Target: () => this.getTargetDisplayName(this.target),
                    'Targets Found': () => this.targets.length,
                    'Known Blackholes': () => this.activeBlackholes.length,
                },
            },
        ]);

        this.on('postRenderWorld', () => this.renderTargets());
        this.on('tick', () => this.onTick());
    }

    onTick() {
        if (!this.enabled) return;
        if (!Client.isInChat() && Client.isInGui()) {
            this.pauseMovement();
            return;
        }

        this.scanBlackholes();
        this.expireTargetData();
        this.scanTargets();

        if (this.target && !this.isTargetUsable(this.target)) this.setTarget(null);

        const best = this.bestTarget();
        if (!this.target) this.setTarget(best);
        else if (best && !this.sameTarget(best, this.target) && this.shouldSwitchTarget(best)) this.setTarget(best);

        if (!this.target) {
            this.setState(STATES.IDLE);
            return;
        }

        const position = this.getTargetPosition(this.target);
        if (!position) {
            this.setTarget(null);
            return;
        }

        const distance = this._getDistanceToPlayer(position);

        if (distance.distance <= ATTACK_REACH && this.hasLineOfSight(position)) {
            this.engage(position, distance);
            return;
        }

        this.ensurePath(position);
        if (!CombatNavigator.isFollowing()) this.approachDirectly(position);
    }

    approachDirectly(position) {
        this.trackTarget();
        CombatWalker.moveToward(position);
    }

    ensurePath(position) {
        const moved =
            !this.pathTargetPosition ||
            this.getDistanceBetween(position, this.pathTargetPosition).distanceFlat >= REPATH_DISTANCE;
        const stale = Date.now() - this.pathStartedAt >= REPATH_DELAY_MS;
        const navigating = this.state === STATES.PATHING && CombatNavigator.isPathing();
        if (!navigating || moved || stale) this.startPath(position);
    }

    hasLineOfSight(position) {
        const eye = Player.getPlayer()?.getEyePosition();
        if (!eye) return false;
        return isLineClear(eye.x(), eye.y(), eye.z(), position.x, position.y + 1, position.z, -99999, -99999, -99999);
    }

    setTarget(target) {
        if (this.sameTarget(this.target, target)) return;

        this.cancelPath();
        Client.stopMovement();
        CombatRotations.stop();
        this.trackedTarget = null;
        this.target = target;
        this.nextAttackAt = 0;
        this.setState(STATES.IDLE);

        this.trackTarget();
    }

    trackTarget() {
        if (!this.target) return;
        if (this.trackedTarget === this.target) return;
        CombatRotations.lookAtEntity(this.target);
        this.trackedTarget = this.target;
    }

    engage(position, distance) {
        if (this.state !== STATES.FIGHTING) {
            this.cancelPath();
            this.setState(STATES.FIGHTING);
        }
        this.trackTarget();

        if (distance.distanceFlat > 2.8) {
            CombatWalker.moveToward(position);
        } else {
            Client.stopMovement();
        }

        if (distance.distanceY < -1.5) Client.setKey('space', true);
        this.tryAttack(distance.distance);
    }

    tryAttack(distance) {
        const now = Date.now();
        if (distance > ATTACK_REACH + 0.35 || now < this.nextAttackAt) return;
        if (!isLookingAtEntity(this.target, ATTACK_REACH + 0.5)) return;

        if (this.attackButton === 'Right Click') Client.rightClick();
        else Client.leftClick();
        const jitter = 0.82 + Math.random() * 0.36;
        this.nextAttackAt = now + (1000 / this.attackCPS) * jitter;
    }

    startPath(position) {
        if (!this.isPositionSafe(position.x, position.y, position.z)) {
            this.setTarget(null);
            return;
        }

        this.cancelPath();
        this.trackedTarget = null;
        this.setState(STATES.PATHING);
        this.pathStartedAt = Date.now();
        this.pathTargetPosition = { ...position };

        const goals = this.buildPathGoals(position);

        const token = ++this.pathToken;
        const target = this.target;

        CombatNavigator.findPath(goals, (success) => this.onPathComplete(token, target, success), {
            avoidPoints: this.activeBlackholes,
            avoidRadius: Math.ceil(BLACKHOLE_AVOID_RADIUS),
        });
    }

    onPathComplete(token, target, success) {
        if (token !== this.pathToken || this.state !== STATES.PATHING || !this.sameTarget(this.target, target)) return;

        this.pathTargetPosition = null;
        if (success && this.isTargetUsable(target)) {
            this.trackedTarget = null;
            this.setState(STATES.FIGHTING);
            this.trackTarget();
            return;
        }

        if (this.externalTargets === null) this.blacklistTarget(target, PATH_FAILURE_BLACKLIST_MS);
        this.setTarget(null);
    }

    cancelPath() {
        this.pathToken++;
        this.pathTargetPosition = null;
        if (this.state === STATES.PATHING || CombatNavigator.isPathing()) CombatNavigator.resetPath();
    }

    pauseMovement() {
        if (this.state === STATES.IDLE && !this.trackedTarget) return;
        this.cancelPath();
        Client.stopMovement();
        CombatRotations.stop();
        this.trackedTarget = null;
        this.setState(STATES.IDLE);
    }

    setState(state) {
        this.state = state;
    }

    buildPathGoals(position) {
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);
        return [
            [x, y - 1, z],
            [x, y, z],
            [x, y + 1, z],
        ];
    }

    scoreTarget(target) {
        const position = this.getTargetPosition(target);
        if (!position) return null;

        const distance = this._getDistanceToPlayer(position).distance;
        const turn = angleToPlayer([position.x, position.y, position.z]).distance;
        return distance + turn * 0.025;
    }

    bestTarget() {
        let best = null;
        let bestScore = Infinity;

        this.targets.forEach((target) => {
            if (!this.isTargetUsable(target)) return;

            const score = this.scoreTarget(target);
            if (score !== null && score < bestScore) {
                best = target;
                bestScore = score;
            }
        });

        return best;
    }

    shouldSwitchTarget(best) {
        const currentPosition = this.getTargetPosition(this.target);
        const bestPosition = this.getTargetPosition(best);
        if (!currentPosition || !bestPosition) return true;

        const currentDistance = this._getDistanceToPlayer(currentPosition).distance;
        const bestDistance = this._getDistanceToPlayer(bestPosition).distance;
        return bestDistance < currentDistance - TARGET_SWITCH_MARGIN;
    }

    getNextTarget() {
        return this.nextTarget;
    }

    computeNextTarget() {
        let best = null;
        let bestScore = Infinity;

        this.targets.forEach((target) => {
            if (!this.isTargetUsable(target)) return;
            if (this.sameTarget(target, this.target)) return;

            const score = this.scoreTarget(target);
            if (score !== null && score < bestScore) {
                best = target;
                bestScore = score;
            }
        });

        return best;
    }

    isTargetUsable(target) {
        if (!target) return false;

        try {
            if (!this.isCombatTargetCandidate(target, true)) return false;

            const uuid = this.getTargetUuid(target);
            if (!uuid) return false;
            if (this.blacklistedTargets.has(uuid)) return false;
            if (!this.targetUuids.has(uuid)) return false;

            const position = this.getTargetPosition(target);
            if (!position || !this.isPositionSafe(position.x, position.y, position.z)) return false;

            return true;
        } catch (e) {
            return false;
        }
    }

    sameTarget(first, second) {
        if (first === second) return true;
        if (!first || !second) return false;
        const firstUuid = this.getTargetUuid(first);
        return firstUuid !== null && firstUuid === this.getTargetUuid(second);
    }

    getTargetUuid(target) {
        try {
            const entity = target?.toMC ? target.toMC() : target;
            return entity?.getUUID?.()?.toString() || null;
        } catch (e) {
            return null;
        }
    }

    getTargetPosition(target) {
        try {
            const entity = target?.toMC ? target.toMC() : target;
            if (!entity?.getX) return null;
            return { x: entity.getX(), y: entity.getY(), z: entity.getZ() };
        } catch (e) {
            return null;
        }
    }

    _getDistanceToPlayer(position) {
        return getDistanceToPlayer(position.x, position.y, position.z);
    }

    getDistanceBetween(first, second) {
        return getDistance(first.x, first.y, first.z, second.x, second.y, second.z);
    }

    canSeeTarget(target) {
        try {
            return Player.asPlayerMP()?.canSeeEntity(target) ?? true;
        } catch (e) {
            return true;
        }
    }

    blacklistTarget(target, duration) {
        const uuid = this.getTargetUuid(target);
        if (uuid) this.blacklistedTargets.set(uuid, Date.now() + duration);
    }

    expireTargetData() {
        const now = Date.now();
        for (const [uuid, expiry] of this.blacklistedTargets) {
            if (now >= expiry) this.blacklistedTargets.delete(uuid);
        }
        for (const [uuid, expiry] of this.visibleUntil) {
            if (now >= expiry) this.visibleUntil.delete(uuid);
        }
    }

    findMob(config) {
        if (!config) return [];
        const hasNames = Array.isArray(config.names) && config.names.length > 0;
        if (!hasNames && !config.entityClass) return [];

        if (hasNames) return this.findMobByName(config.names, this.scanRadius);
        return this.nearbyEntities(config.entityClass, this.scanRadius).filter((entity) => this.matchesMobConfig(entity, config));
    }

    nearbyEntities(mcClass, radius, yRange = SCAN_Y_RANGE) {
        const player = Player.getPlayer();
        const world = World.getWorld();
        if (!player || !world) return [];
        try {
            const box = player.getBoundingBox().inflate(radius, yRange, radius);
            return world.getEntitiesOfClass(mcClass, box) || [];
        } catch (e) {
            console.error('V5 Combat Bot entity query error: ' + e);
            return [];
        }
    }

    matchesMobConfig(entity, config) {
        try {
            if (!this.isCombatTargetCandidate(entity, config.allowInvisible)) return false;
            if (this.isTargetNameBlacklisted(entity)) return false;
            if (config.boundaryCheck && !config.boundaryCheck(entity.getX(), entity.getY(), entity.getZ())) return false;
            if (config.entityCheck && !config.entityCheck(entity)) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    findMobByName(names, radius) {
        const parsed = names
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean);
        if (!parsed.length) return [];

        const mobs = this.nearbyEntities(MobEntity, radius).filter((entity) => this.isCombatTargetCandidate(entity, true));
        const mobIds = new Set(mobs.map((mob) => this.getTargetUuid(mob)).filter(Boolean));
        const targets = new Map();

        for (const stand of this.nearbyEntities(ArmorStandEntity, radius)) {
            const name = this.getCleanEntityName(stand);
            if (!parsed.some((candidate) => name.includes(candidate))) continue;
            if (this.isTargetNameBlacklisted(stand)) continue;
            const mob = this.resolveNametagTarget(stand, mobs);
            if (!mob) continue;
            const uuid = this.getTargetUuid(mob);
            if (uuid && mobIds.has(uuid)) targets.set(uuid, mob);
        }

        for (const mob of mobs) {
            const name = this.getCleanEntityName(mob);
            if (!parsed.some((candidate) => name.includes(candidate))) continue;
            if (this.isTargetNameBlacklisted(mob)) continue;
            const uuid = this.getTargetUuid(mob);
            if (uuid) targets.set(uuid, mob);
        }

        return [...targets.values()];
    }

    isCombatTargetCandidate(entity, allowInvisible = false) {
        try {
            const mcEntity = entity?.toMC ? entity.toMC() : entity;
            if (mcEntity instanceof PlayerEntity) {
                const uuid = mcEntity.getUUID();
                if (uuid.version() !== 2 || String(uuid) === String(Player.getUUID())) return false;
            } else if (!(mcEntity instanceof MobEntity)) {
                return false;
            }

            return (
                !mcEntity.isSpectator() &&
                !mcEntity.isRemoved?.() &&
                !mcEntity.isDeadOrDying?.() &&
                (allowInvisible || !entity.isInvisible?.()) &&
                !entity.isDead?.()
            );
        } catch (e) {
            return false;
        }
    }

    resolveNametagTarget(namedEntity, mobs) {
        const mcEntity = namedEntity?.toMC ? namedEntity.toMC() : namedEntity;
        if (!mcEntity) return null;
        if (mcEntity.isRemoved?.() || mcEntity.isDeadOrDying?.()) return null;

        const point = mcEntity.position();

        const maxDistanceSq = NAMETAG_MOB_RANGE ** 2;
        let closest = null;
        let closestDistanceSq = Infinity;

        for (const mob of mobs) {
            try {
                const mobEntity = mob?.toMC ? mob.toMC() : mob;
                const distanceSq = mobEntity.getBoundingBox().distanceToSqr(point);
                if (distanceSq <= maxDistanceSq && distanceSq < closestDistanceSq) {
                    closest = mob;
                    closestDistanceSq = distanceSq;
                }
            } catch (e) {
                console.error('V5 Combat Bot target scan error: ' + e);
            }
        }

        return closest;
    }

    getCleanEntityName(entity) {
        const uuid = this.getTargetUuid(entity);
        const now = Date.now();
        if (uuid) {
            const cached = this.nameCache.get(uuid);
            if (cached && now - cached.at < NAME_CACHE_MS) return cached.name;
        }

        const name = ChatLib.removeFormatting(String(entity.getName()?.getString?.() ?? entity.getName())).toLowerCase();
        if (uuid) this.nameCache.set(uuid, { name, at: now });
        return name;
    }

    isVisibleOrRecent(entity, checkVisibility) {
        if (!checkVisibility) return true;

        const uuid = this.getTargetUuid(entity);
        if (!uuid) return false;

        if (this.canSeeTarget(entity)) {
            this.visibleUntil.set(uuid, Date.now() + VISIBILITY_GRACE_MS);
            return true;
        }

        return (this.visibleUntil.get(uuid) || 0) > Date.now();
    }

    scanTargets() {
        if (this.targetScanTicker++ % TARGET_SCAN_INTERVAL !== 0) return;

        this.targets = this.getTargets();
        this.targetUuids = new Set(this.targets.map((target) => this.getTargetUuid(target)).filter(Boolean));
        this.nextTarget = this.computeNextTarget();
    }

    getTargets() {
        const targets =
            this.externalTargets !== null ? this.externalTargets : this.targetNames.length ? this.findMob({ names: this.targetNames }) : [];
        if (this.externalTargets === null) {
            this.enabledPresets.forEach((name) => {
                if (COMBAT_PRESETS[name]) targets.push(...this.findMob(COMBAT_PRESETS[name]));
            });
        }
        return [...new Map(targets.map((target) => [this.getTargetUuid(target), target])).values()].filter((target) => !this.isTargetNameBlacklisted(target));
    }

    isTargetNameBlacklisted(target) {
        if (!this.targetNameBlacklist.length) return false;
        try {
            const name = this.getCleanEntityName(target);
            return this.targetNameBlacklist.some((blocked) => name.includes(blocked));
        } catch (e) {
            return false;
        }
    }

    setExternalTargets(targets) {
        this.externalTargets = Array.isArray(targets) ? targets : [];
    }

    clearExternalTargets() {
        this.externalTargets = null;
    }

    scanBlackholes() {
        if (++this.scanTicker % BLACKHOLE_SCAN_INTERVAL !== 0) return;

        const player = { x: Player.getX(), y: Player.getY(), z: Player.getZ() };
        const now = Date.now();

        for (const stand of this.nearbyEntities(ArmorStandEntity, BLACKHOLE_SCAN_RADIUS, BLACKHOLE_SCAN_Y_RANGE)) {
            try {
                const position = { x: stand.getX(), y: stand.getY(), z: stand.getZ() };
                if (
                    Math.abs(position.x - player.x) > BLACKHOLE_SCAN_RADIUS ||
                    Math.abs(position.y - player.y) > BLACKHOLE_SCAN_Y_RANGE ||
                    Math.abs(position.z - player.z) > BLACKHOLE_SCAN_RADIUS ||
                    !this.isBlackholeHead(stand.getItemBySlot(net.minecraft.world.entity.EquipmentSlot.HEAD))
                ) {
                    continue;
                }

                const known = this.activeBlackholes.find((blackhole) => this.getDistanceBetween(blackhole, position).distanceFlat <= BLACKHOLE_MERGE_RADIUS);
                if (known) Object.assign(known, position, { lastSeen: now });
                else this.activeBlackholes.push({ ...position, lastSeen: now });
            } catch (e) {
                console.error('V5 Combat Bot blackhole scan error: ' + e);
            }
        }

        this.activeBlackholes = this.activeBlackholes.filter((blackhole) => now - blackhole.lastSeen <= BLACKHOLE_MEMORY_MS);
    }

    isBlackholeHead(item) {
        try {
            const stack = item?.toMC ? item.toMC() : item;
            const profile = stack?.get(DataComponents.PROFILE)?.partialProfile?.()?.toString() || '';
            if (!profile) return false;

            for (const texture of BLACKHOLE_TEXTURES) {
                if (profile.includes(texture)) return true;
            }
        } catch (e) {
            console.error('V5 Combat Bot blackhole texture error: ' + e);
        }
        return false;
    }

    isPositionSafe(x, y, z) {
        return this.activeBlackholes.every((blackhole) => this.getDistanceBetween({ x, y, z }, blackhole).distanceFlat >= BLACKHOLE_AVOID_RADIUS);
    }

    renderTargets() {
        const next = this.nextTarget && this.nextTarget !== this.target ? this.nextTarget : null;
        const nextEntity = next && next.toMC ? next.toMC() : next;
        const currentEntity = this.target ? (this.target.toMC ? this.target.toMC() : this.target) : null;

        if (nextEntity) Render3D.drawHitboxes([nextEntity], NEXT_TARGET_COLOR, NEXT_TARGET_THICKNESS, false);
        if (currentEntity) Render3D.drawHitboxes([currentEntity], CURRENT_TARGET_COLOR, CURRENT_TARGET_THICKNESS, false);

        Render3D.drawFilledBoxes(
            this.activeBlackholes.map((blackhole) => new Vec3d(blackhole.x - 0.5, blackhole.y + 0.5, blackhole.z - 0.5)),
            new RenderColor(0, 0, 0, 150),
            false
        );
    }

    getTargetDisplayName(target) {
        if (!target) return 'None';
        try {
            return ChatLib.removeFormatting(String(target.getName?.()?.getString?.() ?? target.getName?.() ?? target.name ?? 'Unknown'));
        } catch (e) {
            return 'Unknown';
        }
    }

    onEnable() {
        this.activeBlackholes = [];
        this.scanTicker = 0;
        this.targetScanTicker = 0;
        this.targetUuids = new Set();
        this.nextTarget = null;
        if (!this.isParentManaged) {
            this.message(this.targetNames.length || this.enabledPresets.size ? '&aEnabled' : '&eEnabled, but no targets are configured.');
        }
    }

    onDisable() {
        if (!this.isParentManaged) this.message('&cDisabled');

        this.cancelPath();
        Client.stopMovement();
        CombatRotations.stop();
        this.externalTargets = null;
        this.targets = [];
        this.targetUuids = new Set();
        this.nextTarget = null;
        this.target = null;
        this.trackedTarget = null;
        this.state = STATES.IDLE;
        this.nextAttackAt = 0;
        this.blacklistedTargets.clear();
        this.visibleUntil.clear();
        this.activeBlackholes = [];
    }
}

export const CombatBot = new Combat();
