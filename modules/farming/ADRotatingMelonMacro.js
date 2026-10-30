import { FarmingMacro } from './FarmingMacro';
import { farmingSettings } from './FarmingSettings';
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
    ROTATING: 'Rotating',
};

class ADRotatingMelonMacro extends FarmingMacro {
    constructor() {
        super(
            {
                name: 'AD Rotating Melon Macro',
                description: 'Useful for default preset. Not recommended to use.',
            },
            'farming melon'
        );

        this.state = STATES.LEFT;
        this.startState = STATES.LEFT;

        this.addMultiToggle(
            'Direction',
            ['A', 'D'],
            true,
            (value) => {
                this.startState = value.find((option) => option.enabled)?.name === 'D' ? STATES.RIGHT : STATES.LEFT;
            },
            'Starting key. The macro swaps to the other key at every lane change.',
            'A'
        );
        // Lane switch delay is now global (configured in FarmType)
    }

    onFarmStart(player) {
        const live = getFarmTypeYawPitch('AD Rotating Melon Macro');
        this.pitchMin = this.pitchMax = live.pitch;
        this.yawMin = this.yawMax = live.yaw;

        this.state = this.startState;
        this.ignoreTicks = 5;
        this.leftYaw = this.snapYaw(player.getYRot(), this.yawMin) - (this.state === STATES.RIGHT ? 90 : 0);
        const pitch = farmingSettings.useMousemat ? (this.pitchMin + this.pitchMax) / 2 : 0;
        this.rotateTo(this.state === STATES.LEFT ? this.leftYaw : this.leftYaw + 90, pitch);
    }

    updateFarmState(player) {
        if (this.state === STATES.ROTATING || this.consumeIgnoreTicks(player)) return;
        if (!this.isStationaryForTicks(player, 2)) return;

        this.nextState = this.state === STATES.LEFT ? STATES.RIGHT : STATES.LEFT;
        this.state = STATES.ROTATING;
        this.rotateTo(this.nextState === STATES.LEFT ? this.leftYaw : this.leftYaw + 90, 0, () => {
            if (!this.enabled) return;
            this.state = this.nextState;
            this.ignoreTicks = this.getLaneSwitchDelayTicks();
        });
    }

    invokeFarmState() {
        if (this.state === STATES.ROTATING) return this.hold();
        this.hold(this.state === STATES.LEFT ? 'a' : 'd');
    }
}

new ADRotatingMelonMacro();