import { ModuleBase } from '../../utils/ModuleBase';

class PestMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Pest macro',
            subcategory: 'Farming',
            description: 'Pest control settings for farming.',
            showEnabledToggle: false,
        });
    }
}

new PestMacro();
