import { ModuleBase } from '../../utils/ModuleBase';
import { CombatNavigator } from '../../utils/combat/CombatNavigator';
import { CombatRotations } from '../../utils/combat/CombatRotations';
import { CombatWalker } from '../../utils/combat/CombatWalker';

class CombatNavigation extends ModuleBase {
    constructor() {
        super({
            name: 'Combat Navigation',
            subcategory: 'Combat',
            description: 'Standalone rotation and pathing for the combat bot.',
            tooltip: 'Independent of the shared pathfinder and rotations.',
            showEnabledToggle: false,
        });

        this.debug = false;
        this.rotationSpeed = 1;
        this.sprint = true;
        this.autoJump = true;
        this.lookAlongPath = true;
        this.arrivalRadius = 2.5;
        this.maxCompute = 500000;

        this.addToggle(
            'Debug Path',
            (value) => {
                this.debug = !!value;
                CombatWalker.setDebug(this.debug);
                CombatNavigator.setDebug(this.debug);
            },
            'Draw the followed path nodes, the current look-ahead point and the active segment.'
        );

        this.addSlider(
            'Rotation Speed',
            5,
            20,
            10,
            (value) => {
                this.rotationSpeed = value / 10;
                CombatRotations.setSpeedMultiplier(this.rotationSpeed);
            },
            'Multiplier for the humanized path rotation.'
        );

        this.addToggle(
            'Look Along Path',
            (value) => {
                this.lookAlongPath = !!value;
                CombatWalker.configure({ lookAlongPath: this.lookAlongPath });
            },
            'Aim the camera along the path while walking.',
            true
        );

        this.addToggle(
            'Sprint',
            (value) => {
                this.sprint = !!value;
                CombatWalker.configure({ sprint: this.sprint });
            },
            'Sprint while the path is straight.',
            true
        );

        this.addToggle(
            'Auto Jump',
            (value) => {
                this.autoJump = !!value;
                CombatWalker.configure({ autoJump: this.autoJump });
            },
            'Automatically jump for step-ups, gaps and obstacles.',
            true
        );

        this.addSlider(
            'Arrival Radius',
            1,
            6,
            3,
            (value) => {
                this.arrivalRadius = value;
                CombatWalker.configure({ arrivalRadius: this.arrivalRadius });
            },
            'Distance from the final node to hand off to the combat bot.'
        );

        this.addSlider(
            'Max Compute',
            100,
            1000,
            500,
            (value) => {
                this.maxCompute = Number(value) * 1000;
                CombatNavigator.setMaxCompute(this.maxCompute);
            },
            'Maximum native pathfinder iterations before giving up.'
        );

        this.apply();
    }

    apply() {
        CombatWalker.configure({
            sprint: this.sprint,
            autoJump: this.autoJump,
            lookAlongPath: this.lookAlongPath,
            arrivalRadius: this.arrivalRadius,
        });
        CombatRotations.setSpeedMultiplier(this.rotationSpeed);
        CombatNavigator.setMaxCompute(this.maxCompute);
        CombatWalker.setDebug(this.debug);
        CombatNavigator.setDebug(this.debug);
    }
}

new CombatNavigation();
