import { Rotations } from '../../../utils/player/Rotations';
import { readPests } from '../../../utils/TabListUtils';
import { farmingSettings } from '../FarmingSettings';
import { sunsetPests } from '../SunsetPests';
import { pestMacro } from '../PestMacro';
import { getGardenPestStatus } from '../../../utils/Utils';
import { findItemInHotbar, setItemSlot } from '../../../utils/player/Inventory';
import { registerSkyblockEvent } from '../../../utils/SkyblockEvents';
import { getLookingAt } from '../../../utils/Raytrace';
import { ungrab, regrab } from '../../../utils/Ungrab';
import { chat } from '../../../utils/Chat';

const PLOT_TIMEOUT_MS = 30_000;
const ROOF_TIMEOUT_MS = 2_000;
const CLEAR_DEBOUNCE_TICKS = 10;
const ROOF_LOOK_DISTANCE = 24;
const GARDEN_MAX_PLACEABLE_Y = 76;
const ROOF_STAGES = {
    AIMING: 'Aiming',
    SNEAKING: 'Sneaking',
    CASTING: 'Casting',
};
const STATES = {
    SEARCHING: 'Searching',
    WAITING_FOR_PLOT: 'Waiting for plot',
    SETTING_DAY: 'Setting day',
    PATHING_TO_ROOF: 'Pathing to roof',
    WAITING_FOR_USER: 'Waiting for user',
};

class ManualPestKiller {
    constructor() {
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
        this.manualActive = false;
        this.clearedTicks = 0;
        farmingSettings.originalSlot = Player.getHeldItemIndex();
    }

    tick() {
        if (!this.running) return true;

        if (this.manualActive) {
            const { gardenPests } = getGardenPestStatus();
            const alivePestCount = readPests().alivePestCount;
            if (gardenPests === 0 && alivePestCount === 0) {
                this.clearedTicks++;
                if (this.clearedTicks >= CLEAR_DEBOUNCE_TICKS) {
                    this.stop();
                    return true;
                }
            } else {
                this.clearedTicks = 0;
            }
            return false;
        }

        const { gardenPests, currentPlot } = getGardenPestStatus();
        if (gardenPests === 0 || !gardenPests) {
            this.stop();
            return true;
        }

        if (this.state === STATES.WAITING_FOR_PLOT) {
            if (!this.teleportedToPlot) return false;
            return this.handOff();
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
            this.currentPlot = null;
            this.teleportedToPlot = false;
            this.state = STATES.SEARCHING;
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
            this.committedScoreboardPlot = undefined;
            this.visitedPlots.add(plot);
        }
        if (!sunsetPests.isDone('day')) {
            this.state = STATES.SETTING_DAY;
            return false;
        }
        // Read the toggle live: a saved-on Roof Etherwarp used to read as false here.
        // Latch the scoreboard plot once we commit to it, so a scoreboard refresh landing
        // mid-tick cannot disagree with the tab list and skip the roof.
        if (this.committedScoreboardPlot === undefined) this.committedScoreboardPlot = currentPlot;
        const onThisPlot = plot === this.committedScoreboardPlot;
        if (pestMacro.isRoofEtherwarpEnabled() && onThisPlot) {
            this.state = STATES.PATHING_TO_ROOF;
            this.roofStartedAt = 0;
            this.roofOriginalSlot = -1;
            this.roofCasting = false;
            this.roofStage = ROOF_STAGES.AIMING;
            this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
            return false;
        }
        if (onThisPlot) return this.handOff();
        ChatLib.command(`tptoplot ${plot}`);
        this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
        this.state = STATES.WAITING_FOR_PLOT;
        return false;
    }

    onTeleport() {
        if (!this.running || this.currentPlot === null) return;
        this.teleportedToPlot = true;
    }

    // Pause all automation and hand the mouse/keyboard to the player at the plot/roof.
    handOff() {
        Client.unpressKeys();
        Rotations.stop();
        farmingSettings.selectVacuum();
        this.state = STATES.WAITING_FOR_USER;
        this.manualActive = true;
        this.clearedTicks = 0;
        regrab();
        chat('&eManual pest killer: clear the pests, the macro resumes when the garden is clear.');
        return false;
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

    // Every way out of the climb that is not a successful arrival ends here: do the plot
    // teleport the roof gate replaced, so a failed climb can never skip the plot.
    fallbackToPlotTeleport() {
        this.releaseRoofKeys();
        const plot = this.currentPlot;
        if (!plot) return this.handOff();
        ChatLib.command(`tptoplot ${plot}`);
        this.plotTimeoutAt = Date.now() + PLOT_TIMEOUT_MS;
        this.state = STATES.WAITING_FOR_PLOT;
        return false;
    }

    pathToRoof() {
        if (this.roofOriginalSlot === -1) {
            const slot = findItemInHotbar('Aspect of the Void');
            if (slot === -1) return this.fallbackToPlotTeleport();
            this.roofStartedAt = Date.now();
            this.roofOriginalSlot = Player.getHeldItemIndex();
            this.roofStage = ROOF_STAGES.AIMING;
            setItemSlot(slot);
        }

        const targetPitch = -pestMacro.getRoofPitch();
        Rotations.lookAtAngles(Player.getYaw(), targetPitch);

        if (this.roofStage === ROOF_STAGES.AIMING) {
            if (Math.abs(Player.getPitch() - targetPitch) <= 1) {
                this.roofStage = ROOF_STAGES.SNEAKING;
                this.roofStartedAt = Date.now();
                Client.setKey('shift', true);
            }
        } else if (this.roofStage === ROOF_STAGES.SNEAKING) {
            Client.setKey('rightclick', true);
            this.roofStage = ROOF_STAGES.CASTING;
        }

        if (Date.now() - this.roofStartedAt > ROOF_TIMEOUT_MS) {
            return this.fallbackToPlotTeleport();
        }

        if (this.roofStage !== ROOF_STAGES.CASTING) return;

        const cleared = getLookingAt(ROOF_LOOK_DISTANCE) === null;
        const atCeiling = Player.getY() >= GARDEN_MAX_PLACEABLE_Y + 1;

        if (cleared || atCeiling) {
            this.releaseRoofKeys();
            return this.handOff();
        }
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        this.releaseRoofKeys();
        Rotations.stop();
        Client.unpressKeys();
        farmingSettings.restoreSlot();
        if (this.manualActive) {
            this.manualActive = false;
            ungrab();
        }
    }
}

export const manualPestKiller = new ManualPestKiller();
