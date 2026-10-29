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
};

const SELECTED_PATH = 'FarmType/selected_farm_type.json';

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
            return {
                name,
                enabled: name === this.selectedFarmType,
                val1: savedOpt?.val1 ?? String(defaults.yaw),
                val2: savedOpt?.val2 ?? String(defaults.pitch),
                placeholder1: 'Yaw (-180 to 180)',
                placeholder2: 'Pitch (-90 to 90)',
            };
        });
        this.addMultiToggle(
            'Farm Type',
            options,
            true,
            (options) => this.setSelectedFarmType(options.find((option) => option.enabled)?.name),
            'The farming macro the keybind above will toggle. W/S Crop Macro has Yaw/Pitch inputs.',
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
            if (name === 'W/S Crop Macro') return;
            const item = Categories.findItem('Modules', name);
            if (!item) return;
            const popup = this.addPopup(`${name} Settings`, null, 'Settings for this farm type.');
            const prefix = name.replace(/\s+Macro$/, '');
            const components = item.components.splice(0, item.components.length);
            components.forEach((component) => {
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
