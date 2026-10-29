import { FarmingMacro } from './FarmingMacro';
import { farmingSettings } from './FarmingSettings';
import { randomFloat } from '../../utils/Utils';
import { getConfigFile } from '../../utils/Utils';

const LANE_DELAY = 'lane';
const WS_MOVEMENTS = [
    ['Forward', 'w'],
    ['Backward', 's'],
];
const AD_MOVEMENTS = [
    ['Forward', 'a'],
    ['Backward', 'd'],
];

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

class CycleMacro extends FarmingMacro {
    constructor(options, commandPrefix, config) {
        super(options, commandPrefix);
        const defaults = FARM_DEFAULTS[options.name] || { yaw: 0, pitch: 0 };
        this.yawMin = this.yawMax = ((((config.yaw + 45) % 90) + 90) % 90) - 45;
        this.pitchMin = this.pitchMax = config.pitch || 0;
        this.movements = config.movements;
        this.state = this.movements[0][0];
        this.initialDelay = config.initialDelay ?? 20;
        this.stationaryDelay = config.stationaryDelay ?? 2;
        this.switchDelay = config.switchDelay ?? 2;
        this.laneChangeKey = config.laneChangeKey;
        this.macroName = options.name;

        if ([this.stationaryDelay, this.switchDelay].includes(LANE_DELAY)) {
            // Lane switch delay is now global (configured in FarmType)
        }

    onFarmStart(player) {
        const live = getFarmTypeYawPitch(this.macroName);
        this.yawMin = this.yawMax = live.yaw;
        this.pitchMin = this.pitchMax = live.pitch;

        this.laneChanging = false;
        this.ignoreTicks = this.initialDelay;
        this.yaw = farmingSettings.useMousemat ? (this.yawMin + this.yawMax) / 2 : randomFloat(this.yawMin, this.yawMax);
        const pitch = farmingSettings.useMousemat ? (this.pitchMin + this.pitchMax) / 2 : randomFloat(this.pitchMin, this.pitchMax);
        this.rotateTo(this.snapYaw(player.getYRot(), this.yaw), pitch);
    }

    updateFarmState(player) {
        if (this.consumeIgnoreTicks(player)) return;

        this.laneChanging ||= Boolean(this.laneChangeKey) && this.state === this.movements[0][0] && this.isMovingInLaneChangeDirection(player);

        if (!this.stationaryTicks) this.stationaryDelayTicks = this.stationaryDelay === LANE_DELAY ? this.getLaneSwitchDelayTicks() : this.stationaryDelay;
        if (!this.isStationaryForTicks(player, this.stationaryDelayTicks)) return;

        const index = this.movements.findIndex(([state]) => state === this.state);
        this.state = this.movements[(index + 1) % this.movements.length][0];
        this.laneChanging = false;
        this.ignoreTicks = this.switchDelay === LANE_DELAY ? this.getLaneSwitchDelayTicks() : this.switchDelay;
    }

    isMovingInLaneChangeDirection(player) {
        const yaw = ((this.farmingRotation?.yaw ?? player.getYRot()) * Math.PI) / 180;
        const direction = this.laneChangeKey === 's' ? 1 : -1;
        return ((player.getX() - this.previousTickX) * Math.sin(yaw) - (player.getZ() - this.previousTickZ) * Math.cos(yaw)) * direction > 0.01;
    }

    invokeFarmState() {
        const movement = this.movements.find(([state]) => state === this.state)[1];
        this.hold(this.laneChanging ? `${movement}${this.laneChangeKey}` : movement);
    }
}

const garden = (name) => ({
    name,
    description: 'Designed for 16thGarden megafarm.',
    tooltip: '',
});

[
    [garden('A/D Cactus Macro'), 'farming ad cactus', -68.19, -17.4, true],
    [garden('A/D Cocoa Macro'), 'farming ad cocoa', -166.4, -79, true],
    [garden('A/D Crop Macro'), 'farming ad crop', 33.96, 0, true],
    [garden('W/S Crop Macro'), 'farming ws crop', -26.6],
    [garden('W/S Flower Macro'), 'farming ws flower', -106.88],
    [garden('W/S Melon Macro'), 'farming ws melon', -119.99, 25],
    [garden('W/S Mushroom Macro'), 'farming ws mushroom', -116.57],
    [garden('W/S Sugar Cane Macro'), 'farming ws cane', -123.61],
    [
        {
            name: 'Vertical Crop Macro',
            description: 'Designed for taunahi megafarm.',
            tooltip: 'Basic Vertical S-Shape Crop Macro.',
        },
        'farming ad vertical',
        0,
        0,
        true,
    ],
].forEach(([options, commandPrefix, yaw, pitch = 0, usesAD = false]) => {
    new CycleMacro(options, commandPrefix, {
        yaw,
        pitch,
        movements: usesAD ? AD_MOVEMENTS : WS_MOVEMENTS,
        stationaryDelay: LANE_DELAY,
        switchDelay: 5,
        adjustablePitch: true,
    });
});

new CycleMacro(
    {
        name: 'SDS Staircase Mushroom Macro',
        description: 'Staircase Mushroom Farming.',
    },
    'farming sds mushroom',
    {
        yaw: -16,
        pitch: 6.7,
        movements: [
            ['Left', 'a'],
            ['Right', 'sd'],
        ],
        laneChangeKey: 's',
        adjustablePitch: true,
    }
);

new CycleMacro(
    {
        name: 'S-Shape Sugar Cane Macro',
        description: '45° sugar cane S-Shape.',
    },
    'farming cane',
    {
        yaw: 45,
        movements: [
            ['Left', 'a'],
            ['Backward', 's'],
        ],
        initialDelay: 5,
        switchDelay: LANE_DELAY,
    }
);