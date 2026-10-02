import { Categories } from '../../gui/categories/CategorySystem';
import { ModuleBase } from '../../utils/ModuleBase';
import { getModule } from '../../utils/MacroState';
import { getConfigFile, writeConfigFile } from '../../utils/Utils';

const FARM_TYPES = ['W/S Crop Macro', 'W/S Flower Macro', 'W/S Melon Macro', 'W/S Mushroom Macro', 'W/S Sugar Cane Macro'];
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

        this.bindToggleKey('Toggle Farm type');
        this.addMultiToggle(
            'Farm Type',
            FARM_TYPES,
            true,
            (options) => this.setSelectedFarmType(options.find((option) => option.enabled)?.name),
            'The farming macro the keybind above will toggle.',
            this.selectedFarmType
        );

        this.adoptFarmTypeSettings();
    }

    setSelectedFarmType(name) {
        this.selectedFarmType = FARM_TYPES.includes(name) ? name : FARM_TYPES[0];
        writeConfigFile(SELECTED_PATH, this.selectedFarmType);
    }

    adoptFarmTypeSettings() {
        FARM_TYPES.forEach((name) => {
            const item = Categories.findItem('Modules', name);
            if (!item) return;
            const popup = this.addPopup(`${name} Settings`, null, 'Settings for this farm type.');
            const components = item.components.splice(0, item.components.length);
            components.forEach((component) => popup.addComponent(component, component.description));
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
