import { Categories } from '../../gui/categories/CategorySystem';
import { ModuleBase } from '../../utils/ModuleBase';
import { getModule } from '../../utils/MacroState';
import { getConfigFile, writeConfigFile } from '../../utils/Utils';

const FARM_TYPES = [
    'W/S Crop Macro',
    'W/S Flower Macro',
    'W/S Melon Macro',
    'W/S Mushroom Macro',
    'W/S Sugar Cane Macro',
    'S-Shape Macro',
    'Forward S-Shape Cocoa Macro',
    'S-Shape Sugar Cane Macro',
    'SDS Staircase Mushroom Macro',
    'A/D Cactus Macro',
    'A/D Cocoa Macro',
    'A/D Crop Macro',
    'AD Rotating Melon Macro',
    'Vertical Crop Macro',
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

const SELECTED_PATH = 'FarmType/selected_farm_type.json';

function readOldSliderValue(allSettings, macroName, componentTitle) {
    const macroSettings = allSettings[macroName];
    if (!macroSettings) return null;
    const value = macroSettings[componentTitle];
    if (value === undefined) return null;
    if (typeof value === 'object' && value.low !== undefined && value.high !== undefined) {
        return (value.low + value.high) / 2;
    }
    return value;
}

class FarmType extends ModuleBase {
    constructor() {
        super({
            name: 'Farm type',
            subcategory: 'Farming',
            description: 'Toggle any farming macro with a single keybind.',
            showEnabledToggle: false,
        });

        const saved = getConfigFile(SELECTED_PATH);
        this.selectedFarmType = FARM_TYPES.includes(saved) ? saved : FARM_TYPES[0];

        const allSettings = getConfigFile('config.json') || {};
        const farmTypeSettings = allSettings['Farm type'] || {};
        const savedOptions = farmTypeSettings['Farm Type'] || [];

        this.bindToggleKey('Toggle Farm type');
        const options = FARM_TYPES.map((name) => {
            const savedOpt = savedOptions.find((o) => o.name === name);
            const defaults = FARM_DEFAULTS[name] || { yaw: 0, pitch: 0 };

            let yawVal = savedOpt?.val1;
            let pitchVal = savedOpt?.val2;

            if (yawVal === undefined) {
                const oldYaw = readOldSliderValue(allSettings, name, 'Yaw Offset');
                if (oldYaw !== null) yawVal = String(oldYaw);
            }
            if (pitchVal === undefined) {
                const oldPitch = readOldSliderValue(allSettings, name, 'Pitch');
                if (oldPitch !== null) pitchVal = String(oldPitch);
            }

            return {
                name,
                enabled: name === this.selectedFarmType,
                val1: yawVal ?? String(defaults.yaw),
                val2: pitchVal ?? String(defaults.pitch),
                placeholder1: 'Yaw (-180 to 180)',
                placeholder2: 'Pitch (-90 to 90)',
            };
        });
        this.addMultiToggle(
            'Farm Type',
            options,
            true,
            (options) => this.setSelectedFarmType(options.find((option) => option.enabled)?.name),
            'The farming macro the keybind above will toggle. Each has Yaw/Pitch inputs.',
            this.selectedFarmType
        );

        this.adoptRewarpStyle();
        this.adoptFarmTypeSettings();
    }

    setSelectedFarmType(name) {
        this.selectedFarmType = FARM_TYPES.includes(name) ? name : FARM_TYPES[0];
        writeConfigFile(SELECTED_PATH, this.selectedFarmType);
    }

    adoptRewarpStyle() {
        const source = Categories.findItem('Modules', 'Rewarp Settings');
        const target = Categories.findItem('Modules', 'Farm type');
        if (!source || !target) return;
        const index = source.components.findIndex((component) => component.title === 'Rewarp Style');
        if (index === -1) return;
        const [component] = source.components.splice(index, 1);
        target.components.splice(1, 0, component);
        Categories.dataRevision++;
    }

    adoptFarmTypeSettings() {
        FARM_TYPES.forEach((name) => {
            const item = Categories.findItem('Modules', name);
            if (!item) return;
            const popup = this.addPopup(`${name} Settings`, null, 'Settings for this farm type.');
            const prefix = name.replace(/\s+Macro$/, '');
            const components = item.components.splice(0, item.components.length);
            components.forEach((component) => {
                if (component.title.includes('Yaw') || component.title.includes('Pitch') || component.title.includes('Lane Switch Delay')) return;
                component.title = `${prefix} · ${component.title}`;
                popup.addComponent(component, component.description);
            });
            this.removeCategoryItem(name);
        });
    }

    removeCategoryItem(title) {
        const modules = Categories.categories.find((category) => category.name === 'Modules');
        if (!modules) return;
        modules.items.forEach((group) => {
            if (group.type === 'separator' && Array.isArray(group.items)) {
                const index = group.items.findIndex((item) => item.title === title);
                if (index !== -1) group.items.splice(index, 1);
            }
        });
        Categories.dataRevision++;
    }

    requestToggleFromUser() {
        const target = getModule(this.selectedFarmType);
        if (!target) return false;
        return target.requestToggleFromUser();
    }
}

new FarmType();