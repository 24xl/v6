import { Categories } from '../../gui/categories/CategorySystem';
import { ModuleBase } from '../../utils/ModuleBase';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { sunsetPests } from './SunsetPests';

const SETTING_MOVES = [
    ['Rewarp Settings', 'Auto Philip Bonus Settings', 'Farming Settings'],
    ['Farming Settings', 'Kill nearby pests while farming', 'Pest macro'],
    ['Farming Settings', 'Sprayonator While Farming', 'Pest macro'],
    ['Rewarp Settings', 'Pest Killer Settings', 'Pest macro'],
];

class PestMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Pest macro',
            subcategory: 'Farming',
            description: 'Pest control settings for farming.',
            showEnabledToggle: false,
        });

        this.roofEtherwarp = false;
        this.roofPitch = 52;
        this.roofPitchSlider = null;

        this.addToggle(
            'Sunset Pests',
            (value) => (sunsetPests.enableSunsetPests = !!value),
            'Changes the time for the sunset enchant bonus.'
        );

        const roofPopup = this.addPopup('Roof Etherwarp Settings', null, 'Climbs to the roof with Aspect of the Void.');
        roofPopup.addComponent(
            new ToggleButton(
                'Roof Etherwarp',
                0,
                0,
                undefined,
                undefined,
                (value) => (this.roofEtherwarp = !!value),
                this.roofEtherwarp
            ),
            'Replaces the plot teleport with an AOTV climb to the roof.'
        );
        this.roofPitchSlider = new Slider(
            'Pitch',
            0,
            90,
            0,
            0,
            undefined,
            undefined,
            this.roofPitch,
            (value) => (this.roofPitch = this.normalizeRoofPitch(value))
        );
        roofPopup.addComponent(this.roofPitchSlider, 'Upward angle for the AOTV. 52 is a common roof angle.');

        this.adoptPestSettings();
    }

    normalizeRoofPitch(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 52;
        return Math.max(0, Math.min(90, Math.abs(Math.round(numeric))));
    }

    getRoofPitch() {
        // Read the slider rather than the mirrored field: loadSettings writes
        // component.value directly, so the callback never fires on load.
        const source = this.roofPitchSlider ? this.roofPitchSlider.value : this.roofPitch;
        this.roofPitch = this.normalizeRoofPitch(source);
        return this.roofPitch;
    }

    adoptPestSettings() {
        SETTING_MOVES.forEach(([from, title, to]) => this.moveSetting(from, title, to));
    }

    moveSetting(from, title, to) {
        const source = Categories.findItem('Modules', from);
        const target = Categories.findItem('Modules', to);
        if (!source || !target) {
            console.error(`[PestMacro] move skipped: ${from} -> ${to} (item not found)`);
            return;
        }
        const index = source.components.findIndex((component) => component.title === title);
        if (index === -1) {
            console.error(`[PestMacro] move skipped: "${title}" not present in ${from}`);
            return;
        }
        const [component] = source.components.splice(index, 1);
        target.components.push(component);
        Categories.dataRevision++;
    }
}

export const pestMacro = new PestMacro();