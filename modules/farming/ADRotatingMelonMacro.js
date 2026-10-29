import { FarmingMacro } from './FarmingMacro';

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
        this.state = this.startState;
        this.ignoreTicks = 5;
        this.leftYaw = this.snapYaw(player.getYRot(), 45) - (this.state === STATES.RIGHT ? 90 : 0);
        this.rotateTo(this.state === STATES.LEFT ? this.leftYaw : this.leftYaw + 90, 42);
    }

    updateFarmState(player) {
        if (this.state === STATES.ROTATING || this.consumeIgnoreTicks(player)) return;
        if (!this.isStationaryForTicks(player, 2)) return;

        this.nextState = this.state === STATES.LEFT ? STATES.RIGHT : STATES.LEFT;
        this.state = STATES.ROTATING;
        this.rotateTo(this.nextState === STATES.LEFT ? this.leftYaw : this.leftYaw + 90, 42, () => {
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
