import { FarmingMacro } from './FarmingMacro';
import { farmingSettings } from './FarmingSettings';
import { randomFloat } from '../../utils/Utils';
import { getConfigFile } from '../../utils/Utils';

const FARM_DEFAULTS = {
    'W/S Crop Macro': { yaw: -26.6, pitch: 0 },
    'W/S Flower Macro': { yaw: -106.88, pitch: 0 },
    'W/S Melon Macro': { yaw: -119.99, pitch: 25 },
    'W/S Mushroom Macro': { yaw: -116.57, pitch: 0 },
    'W/S Sugar Cane Macro': { yaw: -123.61, pitch: 0 },
    'S-Shape Macro': { yaw: 0, pitch: 0 },
    'Forward S-Shape Cocoa Macro': { yaw: 0, pitch: 0 },
    'S-Shape Sugar Cane Macro': { yaw: 45, pitch: 0 },
    'SDS Staircase Mushroom Macro': { yaw: -16, pitch: 6.7 },
    'A/D Cactus Macro': { yaw: -68.19, pitch: -17.4 },
    'A/D Cocoa Macro': { yaw: -166.4, pitch: -79 },
    'A/D Crop Macro': { yaw: 33.96, pitch: 0 },
    'AD Rotating Melon Macro': { yaw: 0, pitch: 0 },
    'Vertical Crop Macro': { yaw: 0, pitch: 0 },
};

function getFarmTypeYawPitch(macroName) {
    const allSettings = getConfigFile('config.json') || {};
    const farmTypeSettings = allSettings['Farm type'] || {};
    const savedOptions = farmTypeSettings['Farm Type'] || [];
    const savedOpt = savedOptions.find((o) => o.name === macroName);
    if (savedOpt) {
        return {
            yaw: Number.parseFloat(savedOpt.val1) || 0,
            pitch: Number.parseFloat(savedOpt.val2) || 0,
        };
    }
    const defaults = FARM_DEFAULTS[macroName] || { yaw: 0, pitch: 0 };
    return { yaw: defaults.yaw, pitch: defaults.pitch };
}

const STATES = {
    LEFT: 'Left',
    RIGHT: 'Right',
    SWITCHING_LANE: 'Switching lane',
};

class SShapeCropMacro extends FarmingMacro {
    constructor() {
        super(
            {
                name: 'S-Shape Macro',
                description: 'Simple horizonal S-Shape crop macro.',
            },
            'farming sshape'
        );

        this.laneChangeKey = 'w';
        this.alwaysHoldLaneChangeKey = false;
        this.state = STATES.LEFT;
        this.lastDirection = STATES.LEFT;
        // Lane switch delay is now global (configured in FarmType)
        this.addMultiToggle(
            'Lane Change Direction',
            ['Forward', 'Backward'],
            true,
            (value) => (this.laneChangeKey = value.find((option) => option.enabled)?.name === 'Backward' ? 's' : 'w'),
            null,
            'Forward'
        );
        this.addToggle('Always Hold Lane Change Key', (value) => (this.alwaysHoldLaneChangeKey = value));
    }

    onFarmStart(player) {
        const live = getFarmTypeYawPitch('S-Shape Macro');
        this.pitchMin = this.pitchMax = live.pitch;
        this.yawMin = this.yawMax = live.yaw;

        this.state = this.lastDirection;
        this.ignoreTicks = 10;
        this.yaw = this.snapYaw(player.getYRot(), this.yawMin);
        const pitch = farmingSettings.useMousemat ? (this.pitchMin + this.pitchMax) / 2 : randomFloat(this.pitchMin, this.pitchMax);
        this.rotateTo(this.yaw, pitch);
    }

    updateFarmState(player) {
        if (this.state === STATES.SWITCHING_LANE) return this.updateLaneSwitch(player);
        if (this.consumeIgnoreTicks(player)) return;

        if (!this.isStationaryForTicks(player, 2)) return;
        if (this.alwaysHoldLaneChangeKey) {
            this.state = this.lastDirection === STATES.RIGHT ? STATES.LEFT : STATES.RIGHT;
            this.lastDirection = this.state;
            return;
        }
        this.state = STATES.SWITCHING_LANE;
    }

    updateLaneSwitch(player) {
        if (!this.isStationaryForTicks(player, 2)) return;
        this.state = this.lastDirection === STATES.RIGHT ? STATES.LEFT : STATES.LEFT;
        this.lastDirection = this.state;
        this.ignoreTicks = this.getLaneSwitchDelayTicks();
    }

    invokeFarmState() {
        if (this.state === STATES.LEFT) return this.hold(`a${this.alwaysHoldLaneChangeKey ? this.laneChangeKey : ''}`);
        if (this.state === STATES.RIGHT) return this.hold(`d${this.alwaysHoldLaneChangeKey ? this.laneChangeKey : ''}`);
        this.hold(this.laneChangeKey);
    }
}

new SShapeCropMacro();