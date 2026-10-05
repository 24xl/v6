import { ClientboundLevelParticlesPacket, getLevelParticleData } from '../../../utils/Packets';
import Pathfinder from '../../../utils/pathfinder/PathFinder';
import { Rotations } from '../../../utils/player/Rotations';
import { readPests } from '../../../utils/TabListUtils';
import { getLoadedPests } from '../../visuals/PestESP';
import { farmingSettings } from '../FarmingSettings';
import { sunsetPests } from '../SunsetPests';
import { pestMacro } from '../PestMacro';
import { angleToPlayer } from '../../../utils/Math';
import { getGardenPestStatus } from '../../../utils/Utils';
import { findItemInHotbar, setItemSlot } from '../../../utils/player/Inventory';
import { registerSkyblockEvent } from '../../../utils/SkyblockEvents';
import { getLookingAt } from '../../../utils/Raytrace';
import { ParticleTypes } from '../../../utils/Constants';

const ANGRY_VILLAGER = ParticleTypes.ANGRY_VILLAGER;
const PEST_RANGE_SQ = 12.5 ** 2;
const PEST_ANGLE = 45;
const PARTICLE_SEARCH_MS = 1_000;
const PLOT_TIMEOUT_MS = 30_000;
const ROOF_TIMEOUT_MS = 2_000;
// How far the climb raycasts when looking for something solid. getLookingAt uses vanilla
// Entity.pick(distance), not the crosshair hitResult, so this is not capped at reach.
const ROOF_LOOK_DISTANCE = 24;
// Highest block that can be placed in a Hypixel SkyBlock garden, so standing on top of it
// puts the player's feet at 77. FarmingMacro.isPestColumnClear already scans to this 76.
const GARDEN_MAX_PLACEABLE_Y = 76;
// Aim first, then sneak, then cast. Same order as aether, and the only way to know the
// rotation actually landed is to read the player's own pitch back.
const ROOF_STAGES = {
    AIMING: 'Aiming',
    SNEAKING: 'Sneaking',
    CASTING: 'Casting',
};
const STATES = {
    SEARCHING: 'Searching',
    PATHING_PESTS: 'Pathing to pests',
    KILLING: 'Killing pest',
    WAITING_FOR_PLOT: 'Waiting for plot',
    SETTING_DAY: 'Setting day',
    PATHING_TO_ROOF: 'Pathing to roof',
    CAPTURING_PARTICLES: 'Capturing particles',
    PATHING_PARTICLES: 'Pathing to particles',
    PATHING_FORWARD: 'Pathing forward',
};

class PestKiller {
    constructor() {
        register('packetReceived', (packet) => this.onParticle(packet)).setFilteredClass(ClientboundLevelParticlesPacket);
        registerSkyblockEvent('plotteleport', () => this.onTeleport());
    }

    start() {
        this.running = true;
        this.state = STATES.SEARCHING;
        this.currentPlot = null;
        this.teleportedToPlot = false;
        this.visitedPlots = new Set();
        this.roofStartedAt = 0;
        this.roofOriginalSlot = -1;
        this.pathToken = 0;
        farmingSettings.originalSlot = Player.getHeldItemIndex();
    }

    tick() {
        if (!this.running) return true;
        const { gardenPests, currentPlot, currentPlotPests } = getGardenPestStatus();
        if (gardenPests === 0 || !gardenPests) {
            this.stop();
            return true;
        }

        if (currentPlot === this.currentPlot && currentPlotPests === 0) {
            this.completeCurrentPlot();
            return false;
        }
        if (this.state === STATES.WAITING_FOR_PLOT) {
            if (!this.teleportedToPlot) return false;
            this.state = STATES.PATHING_FORWARD;
            return false;
        }
        if (this.state === STATES.SETTING_DAY) {
            this.findNewPlot(currentPlot);
            return false;
        }
        if (this.state === STATES.PATHING_TO_ROOF) {
            this.pathToRoof();
            return false;
        }
        if (!this.currentPlot) {
            this.findNewPlot(currentPlot);
            return false;
        }
        if (Date.now() >= this.plotTimeoutAt) {
            this.completeCurrentPlot();
            return false;
        }

        const pests = getLoadedPests();
        const nearbyPest = pests.find((pest) => this.distanceSq(pest) <= PEST_RANGE_SQ);
        if (this.state === STATES.KILLING) {
            if (!nearbyPest) {
                this.stopKilling();
                return false;
            }
        }

        if (!pests.length && this.state === STATES.SEARCHING) {
            if (Client.isKeyDown('shift')) return;
            return this.startParticleSearch();
        }

        if (pests.length) {
            this.particleSearchGrace = Date.now() + 1000;
            if (nearbyPest) return this.kill(nearbyPest);
            if (this.state !== STATES.PATHING_PESTS || this.hasPestsChanged(pests)) this.pathToPests(pests);
            return false;
        }

        switch (this.state) {
            case STATES.PATHING_FORWARD:
                if (!Pathfinder.isPathing()) this.pathToForward();
                return false;
            case STATES.PATHING_PESTS:
                this.stopPath();
                if (Client.isKeyDown('shift')) return;
                return this.startParticleSearch();
            case STATES.PATHING_PARTICLES:
                return false;
            case STATES.CAPTURING_PARTICLES:
                if (Date.now() >= this.particleSearchEndsAt) this.finishParticleCapture();
                return false;
        }

        return false;
    }

    findNewPlot(currentPlot = null) {
        const { infestedPlots } = readPests();
        let plot = infestedPlots.find((candidate) => !this.visitedPlots.has(candidate));
        if (!plot && infestedPlots.length) {
            this.visitedPlots.clear();
            plot = infestedPlots[0];
        }
        if (!plot) return;
        if (this.state !== STATES.SETTING_DAY) {
            this.currentPlot = plot;
            this.teleportedToPlot = false;
            this.visitedPlots.add(plot);
        }
        if (!sunsetPests.isDone('day')) {
            this.state = STATES.SETTING_DAY;
            return false;
        }
        if (pestMacro.roofEtherwarp && plot === currentPlot) {
            this.state = STATES.PATHING_TO_ROOF;
            this.roofStartedAt = 0;
            this.roofOriginalSlot = -1;
            this.roofCasting = false;
            this.roofStage = ROOF_STAGES.AIMING;
            this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
            return false;
        }
        ChatLib.command(`tptoplot ${plot}`);
        this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
        this.state = STATES.WAITING_FOR_PLOT;
    }

    pathToPests(pests) {
        this.stopKilling();
        this.state = STATES.PATHING_PESTS;
        this.pathPestPositions = new Map();
        const goals = [];
        pests.forEach((pest) => {
            this.pathPestPositions.set(this.id(pest), { x: pest.getX(), y: pest.getY(), z: pest.getZ() });
            goals.push(...this.verticalGoals(pest.getX(), pest.getZ()));
        });
        this.startPath(goals, (success) => {
            this.state = STATES.SEARCHING;
        });
    }

    onTeleport() {
        if (!this.running || this.currentPlot === null) return;
        this.teleportedToPlot = true;
    }

    releaseRoofKeys() {
        this.roofCasting = false;
        this.roofStage = ROOF_STAGES.AIMING;
        Client.setKey('rightclick', false);
        Client.setKey('shift', false);
        Rotations.stop();
        if (this.roofOriginalSlot >= 0 && this.roofOriginalSlot <= 8) {
            setItemSlot(this.roofOriginalSlot);
            this.roofOriginalSlot = -1;
        }
    }

    pathToRoof() {
        if (this.roofOriginalSlot === -1) {
            const slot = findItemInHotbar('Aspect of the Void');
            if (slot === -1) {
                this.state = STATES.PATHING_FORWARD;
                return;
            }
            this.roofStartedAt = Date.now();
            this.roofOriginalSlot = Player.getHeldItemIndex();
            this.roofStage = ROOF_STAGES.AIMING;
            setItemSlot(slot);
        }

        // This is exactly what /v5 rotations rotateTo calls: the shared smooth rotation
        // manager, at the current yaw and our configured pitch. No options, same as the
        // command, so there is nothing left to tune here.
        const targetPitch = -pestMacro.getRoofPitch();
        Rotations.lookAtAngles(Player.getYaw(), targetPitch);

        if (this.roofStage === ROOF_STAGES.AIMING) {
            // Only sneak once the camera has genuinely arrived at the pitch.
            if (Math.abs(Player.getPitch() - targetPitch) <= 1) {
                this.roofStage = ROOF_STAGES.SNEAKING;
                this.roofStartedAt = Date.now();
                Client.setKey('shift', true);
            }
        } else if (this.roofStage === ROOF_STAGES.SNEAKING) {
            Client.setKey('rightclick', true);
            this.roofStage = ROOF_STAGES.CASTING;
        }

        if (this.roofStage !== ROOF_STAGES.CASTING) return;

        // Stop as soon as there is nothing solid in front of us, instead of always waiting
        // out the timeout. getLookingAt returns null for air, so that means we can see past
        // whatever we were aiming through.
        const cleared = getLookingAt(ROOF_LOOK_DISTANCE) === null;

        // The garden cannot be built above 76, so feet at 77 means we are on the top surface
        // no matter what the ray says. This is what guarantees the climb ends.
        const atCeiling = Player.getY() >= GARDEN_MAX_PLACEABLE_Y + 1;

        if (cleared || atCeiling) {
            this.releaseRoofKeys();
            this.state = STATES.PATHING_FORWARD;
            return;
        }

        if (Date.now() - this.roofStartedAt > ROOF_TIMEOUT_MS) {
            this.releaseRoofKeys();
            const plot = this.currentPlot;
            if (!plot) {
                this.state = STATES.PATHING_FORWARD;
                return;
            }
            // The climb did not get us up there, so do the plot teleport we replaced.
            ChatLib.command(`tptoplot ${plot}`);
            this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
            this.state = STATES.WAITING_FOR_PLOT;
        }
    }

    pathToForward() {
        const yaw = (Number(Player.getYaw()) * Math.PI) / 180;
        const x = Player.getX() - Math.sin(yaw) * 64;
        const z = Player.getZ() + Math.cos(yaw) * 64;
        this.state = STATES.PATHING_FORWARD;
        this.startPath([[Math.floor(x), 80, Math.floor(z)]], (success) => {
            this.state = STATES.SEARCHING;
        });
    }

    hasPestsChanged(pests) {
        if (pests.length !== this.pathPestPositions?.size) return true;
        return pests.some((pest) => {
            const start = this.pathPestPositions?.get(this.id(pest));
            if (!start) return true;
            const dx = pest.getX() - start.x;
            const dy = pest.getY() - start.y;
            const dz = pest.getZ() - start.z;
            return dx * dx + dy * dy + dz * dz > 4 ** 2;
        });
    }

    kill(pest) {
        this.stopPath();
        this.state = STATES.KILLING;
        Client.unpressKeys();
        if (!farmingSettings.selectVacuum()) return false;
        if (angleToPlayer(pest).distance >= PEST_ANGLE) Rotations.lookAtVector(pest, { precision: 5 });
        Client.setKey('rightclick', true);
        return false;
    }

    stopKilling() {
        if (this.state !== STATES.KILLING) return;
        Rotations.stop();
        Client.unpressKeys();
        this.state = STATES.SEARCHING;
    }

    finishArea() {
        this.currentPlot = null;
        this.teleportedToPlot = false;
        this.state = STATES.SEARCHING;
    }

    completeCurrentPlot() {
        this.stopPath();
        this.stopKilling();
        this.finishArea();
    }

    startParticleSearch() {
        if (this.particleSearchGrace >= Date.now()) return false;
        if (!farmingSettings.selectVacuum()) return false;
        this.firstParticle = null;
        this.lastParticle = null;
        this.state = STATES.CAPTURING_PARTICLES;
        this.particleSearchGrace = Date.now() + 3000;
        this.particleSearchEndsAt = Date.now() + PARTICLE_SEARCH_MS;
        Client.leftClick();
        return false;
    }

    onParticle(packet) {
        if (!this.running || this.state !== STATES.CAPTURING_PARTICLES) return;
        const data = getLevelParticleData(packet);
        const particle = data.particle;
        const type = particle?.getType?.() ?? particle;
        const position = { x: data.x, y: data.y, z: data.z };
        const isAngryVillager = type === ANGRY_VILLAGER;
        if (!isAngryVillager) return;

        if (!this.firstParticle) this.firstParticle = position;
        else this.lastParticle = position;
    }

    finishParticleCapture() {
        if (!this.lastParticle) return (this.state = STATES.SEARCHING);

        const dx = this.lastParticle.x - this.firstParticle.x;
        const dy = this.lastParticle.y - this.firstParticle.y;
        const dz = this.lastParticle.z - this.firstParticle.z;
        const length = Math.hypot(dx, dy, dz);
        if (!length) return (this.state = STATES.SEARCHING);

        const x = this.lastParticle.x + (dx / length) * 40;
        const z = this.lastParticle.z + (dz / length) * 40;
        this.state = STATES.PATHING_PARTICLES;
        this.startPath(this.verticalGoals(x, z), () => {
            this.state = STATES.SEARCHING;
        });
    }

    startPath(goals, onComplete) {
        const token = ++this.pathToken;
        Pathfinder.resetPath(false);
        if (!goals.length) return onComplete(false);
        Pathfinder.findPath(
            goals,
            (success) => {
                if (this.running && token === this.pathToken) onComplete(success);
            },
            true
        );
    }

    stopPath() {
        this.pathToken++;
        if (Pathfinder.isPathing()) Pathfinder.resetPath();
    }

    verticalGoals(x, z) {
        const goals = [];
        for (let y = 66; y < 78; y++) goals.push([Math.floor(x), y, Math.floor(z)]);
        return goals;
    }

    distanceSq(entity) {
        const dx = entity.getX() - Player.getX();
        const dy = entity.getY() - Player.getY();
        const dz = entity.getZ() - Player.getZ();
        return dx * dx + dy * dy + dz * dz;
    }

    id(entity) {
        return entity.getUUID().toString();
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        this.releaseRoofKeys();
        this.stopPath();
        Rotations.stop();
        Client.unpressKeys();
        farmingSettings.restoreSlot();
    }
}

export const pestKiller = new PestKiller();
