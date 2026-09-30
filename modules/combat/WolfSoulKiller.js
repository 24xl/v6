import { Vec3d } from '../../utils/Constants';
import { angleToPlayer, getDistance, getDistanceToPlayer } from '../../utils/Math';
import { ModuleBase } from '../../utils/ModuleBase';
import Pathfinder from '../../utils/pathfinder/PathFinder';
import { setKeysForStraightLineCoords } from '../../utils/player/Movement';
import { Rotations } from '../../utils/player/Rotations';
import { isLookingAtEntity } from '../../utils/Raytrace';

const STATES = {
    IDLE: 'IDLE',
    PATHING: 'PATHING',
    FIGHTING: 'FIGHTING',
};

const TARGET_NAMES = ['old wolf', 'wolf', 'pack spirit', 'howling spirit', 'soul of the alpha'];

const ATTACK_REACH = 4;
const PATH_HANDOFF_DISTANCE = 6;
const REPATH_DISTANCE = 7;
const REPATH_DELAY_MS = 1200;
const PATH_FAILURE_BLACKLIST_MS = 5000;
const VISIBILITY_GRACE_MS = 750;

class WolfSoulKiller extends ModuleBase {
    constructor() {
        super({
            name: 'Wolf Soul Killer',
            subcategory: 'Combat',
            description: 'Targets Old Wolf, Wolf, Pack Spirit, Howling Spirit and Soul of the Alpha.',
            theme: '#5fb0ff',
            isMacro: true,
        });

        this.bindToggleKey('Toggle Wolf Soul Killer');

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

        this.attackRange = ATTACK_REACH;
        this.pathfindingThreshold = 15;
        this.attackCPS = 10;
        this.attackButton = 'Left Click';
        this.overrideRotationSpeed = false;
        this.combatRotationSpeed = 400;

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

        let rotationSpeedSlider;
        this.addToggle(
            'Override Rotation Speed',
            (value) => {
                this.overrideRotationSpeed = !!value;
                rotationSpeedSlider.visible = this.overrideRotationSpeed;
                this.refreshTargetRotation();
            },
            'Use a Wolf Soul Killer-specific rotation speed instead of the global setting.'
        );
        rotationSpeedSlider = this.addSlider(
            'Combat Rotation Speed',
            30,
            60,
            40,
            (value) => {
                this.combatRotationSpeed = value * 10;
                if (this.overrideRotationSpeed) this.refreshTargetRotation();
            },
            'Degrees per second.'
        );
        rotationSpeedSlider.visible = false;

        this.createOverlay([
            {
                title: 'Wolf Soul Killer',
                data: {
                    State: () => this.state,
                    Target: () => this.getTargetDisplayName(this.target),
                    'Targets Found': () => this.targets.length,
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

        this.expireTargetData();
        this.targets = this.getTargets();

        if (this.target && !this.isTargetUsable(this.target)) this.setTarget(null);
        if (!this.target) {
            this.setTarget(this.bestTarget());
            const position = this.getTargetPosition(this.target);
            if (!position) this.setState(STATES.IDLE);
            else {
                const distance = this._getDistanceToPlayer(position);
                if (distance.distance <= this.attackRange && this.canSeeTarget(this.target)) this.engage(position, distance);
                else this.startPath(position);
            }
            return;
        }

        const position = this.getTargetPosition(this.target);
        if (!position) {
            this.setTarget(null);
            return;
        }

        const distance = this._getDistanceToPlayer(position);

        if (this.state === STATES.PATHING) {
            if (
                Date.now() - this.pathStartedAt >= REPATH_DELAY_MS &&
                this.pathTargetPosition &&
                this.getDistanceBetween(position, this.pathTargetPosition).distanceFlat >= REPATH_DISTANCE
            ) {
                this.startPath(position);
            }
            return;
        }

        const pathThreshold = this.state === STATES.FIGHTING ? this.pathfindingThreshold + 2 : this.pathfindingThreshold;
        if (distance.distanceFlat > pathThreshold || (distance.distance > this.attackRange && !this.canSeeTarget(this.target))) {
            this.startPath(position);
            return;
        }

        this.engage(position, distance);
    }

    setTarget(target) {
        if (this.sameTarget(this.target, target)) return;

        this.cancelPath();
        Client.stopMovement();
        Rotations.stop();
        this.trackedTarget = null;
        this.target = target;
        this.nextAttackAt = 0;
        this.setState(STATES.IDLE);

        this.trackTarget();
    }

    trackTarget() {
        if (!this.target || this.trackedTarget === this.target) return;
        const options = this.overrideRotationSpeed ? { rotationSpeed: this.combatRotationSpeed } : { speedMultiplier: 0.9 };
        if (Rotations.trackEntity(this.target, options)) this.trackedTarget = this.target;
    }

    refreshTargetRotation() {
        if (!this.target) return;
        this.trackedTarget = null;
        this.trackTarget();
    }

    engage(position, distance) {
        this.setState(STATES.FIGHTING);
        this.trackTarget();

        if (distance.distanceFlat > 2.8) {
            setKeysForStraightLineCoords(position.x, position.y, position.z, true, true);
            Client.setKey('sprint', true);
        } else {
            Client.stopMovement();
        }

        if (distance.distanceY < -1.5) Client.setKey('space', true);
        this.tryAttack(distance.distance);
    }

    tryAttack(distance) {
        const now = Date.now();
        if (distance > this.attackRange + 0.35 || now < this.nextAttackAt) return;
        if (!isLookingAtEntity(this.target, this.attackRange + 0.5)) return;

        if (this.attackButton === 'Right Click') Client.rightClick();
        else Client.leftClick();
        const jitter = 0.82 + Math.random() * 0.36;
        this.nextAttackAt = now + (1000 / this.attackCPS) * jitter;
    }

    startPath(position) {
        this.cancelPath();
        this.trackTarget();
        this.setState(STATES.PATHING);
        this.pathStartedAt = Date.now();
        this.pathTargetPosition = { ...position };

        const candidates = this.targets.filter((target) => this.isTargetUsable(target));
        const goals = [];
        candidates.forEach((target) => {
            const targetPosition = this.getTargetPosition(target);
            if (targetPosition) goals.push(...this.buildPathGoals(targetPosition));
        });
        let target = this.target;
        const token = ++this.pathToken;
        Pathfinder.findPath(goals, (success) => this.onPathComplete(token, target, success), {
            resolveEntityTarget: (result) => {
                const selected = this.getPathResultTarget(result, candidates);
                const selectedPosition = this.getTargetPosition(selected);
                if (!selectedPosition) return null;

                target = selected;
                this.pathTargetPosition = { ...selectedPosition };
                if (!this.sameTarget(this.target, selected)) {
                    this.target = selected;
                    this.trackedTarget = null;
                    this.nextAttackAt = 0;
                    this.trackTarget();
                }

                return { target: selected, goals: this.buildPathGoals(selectedPosition) };
            },
            entityTrackDistance: 8,
            walkArrivalRadius: PATH_HANDOFF_DISTANCE,
            silent: true,
        });
    }

    getPathResultTarget(result, candidates) {
        const path = result?.path;
        const end = path && path.length ? path[path.length - 1] : null;
        if (!end) return this.target;

        const best = candidates.reduce((closest, candidate) => {
            const position = this.getTargetPosition(candidate);
            if (!position) return closest;
            const distance = this.getDistanceBetween(end, position).distance;
            return !closest || distance < closest.distance ? { target: candidate, distance } : closest;
        }, null);
        return best ? best.target : this.target;
    }

    onPathComplete(token, target, success) {
        if (token !== this.pathToken || this.state !== STATES.PATHING || !this.sameTarget(this.target, target)) return;

        this.pathTargetPosition = null;
        if (success && this.isTargetUsable(target)) {
            this.setState(STATES.FIGHTING);
            this.trackTarget();
            return;
        }

        this.blacklistTarget(target, PATH_FAILURE_BLACKLIST_MS);
        this.setTarget(null);
    }

    cancelPath() {
        this.pathToken++;
        this.pathTargetPosition = null;
        if (this.state === STATES.PATHING || Pathfinder.isPathing()) Pathfinder.resetPath();
    }

    pauseMovement() {
        if (this.state === STATES.IDLE && !this.trackedTarget) return;
        this.cancelPath();
        Client.stopMovement();
        Rotations.stop();
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

    bestTarget() {
        let best = null;
        let bestScore = Infinity;

        this.targets.forEach((target) => {
            if (!this.isTargetUsable(target)) return;
            const position = this.getTargetPosition(target);
            if (!position) return;

            const distance = this._getDistanceToPlayer(position).distance;
            const turn = angleToPlayer([position.x, position.y, position.z]).distance;
            const score = distance + turn * 0.025;
            if (score < bestScore) {
                best = target;
                bestScore = score;
            }
        });

        return best;
    }

    isTargetUsable(target) {
        if (!target) return false;

        try {
            const entity = target.toMC ? target.toMC() : target;
            if (!entity || entity.isRemoved?.() || entity.isDeadOrDying?.() || target.isDead?.()) return false;

            const uuid = this.getTargetUuid(target);
            if (uuid && this.blacklistedTargets.has(uuid)) return false;

            const position = this.getTargetPosition(target);
            if (!position) return false;

            return this.targets.some((candidate) => this.sameTarget(candidate, target));
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

    getCleanEntityName(entity) {
        return ChatLib.removeFormatting(String(entity.getName()?.getString?.() ?? entity.getName())).toLowerCase();
    }

    isVisibleOrRecent(entity) {
        const uuid = this.getTargetUuid(entity);
        if (!uuid) return false;

        if (this.canSeeTarget(entity)) {
            this.visibleUntil.set(uuid, Date.now() + VISIBILITY_GRACE_MS);
            return true;
        }

        return (this.visibleUntil.get(uuid) || 0) > Date.now();
    }

    getTargets() {
        const entities = World.getAllEntities();

        return [...new Map(entities.filter((entity) => {
            try {
                const name = this.getCleanEntityName(entity);
                if (!TARGET_NAMES.some((candidate) => name.includes(candidate))) return false;
                if (entity.toMC().isSpectator() || entity.isInvisible?.() || entity.isDead?.()) return false;
                return this.isVisibleOrRecent(entity);
            } catch (e) {
                return false;
            }
        }).map((target) => [this.getTargetUuid(target), target])).values()];
    }

    renderTargets() {
        const groups = new Map();
        this.targets.forEach((target) => {
            const blacklisted = this.blacklistedTargets.has(this.getTargetUuid(target));
            if (!blacklisted && !this.isTargetUsable(target)) return;

            const entity = target.toMC ? target.toMC() : target;
            const selected = this.sameTarget(target, this.target);
            const key = `${blacklisted}:${selected}`;
            if (!groups.has(key))
                groups.set(key, {
                    color: blacklisted ? new RenderColor(0, 0, 0, 150) : selected ? new RenderColor(255, 0, 0, 100) : new RenderColor(0, 70, 200, 100),
                    thickness: selected ? 7 : 3,
                    entities: [],
                });
            groups.get(key).entities.push(entity);
        });
        groups.forEach(({ entities, color, thickness }) => Render3D.drawHitboxes(entities, color, thickness, false));
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
        this.message('&aEnabled');
    }

    onDisable() {
        this.message('&cDisabled');

        this.cancelPath();
        Client.stopMovement();
        Rotations.stop();
        this.targets = [];
        this.target = null;
        this.trackedTarget = null;
        this.state = STATES.IDLE;
        this.nextAttackAt = 0;
        this.blacklistedTargets.clear();
        this.visibleUntil.clear();
    }
}

export const WolfSoulKiller = new WolfSoulKiller();