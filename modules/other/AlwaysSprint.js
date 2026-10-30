import { ModuleBase } from '../../utils/ModuleBase';

class AlwaysSprint extends ModuleBase {
    constructor() {
        super({
            name: 'Always Sprint',
            subcategory: 'Other',
            description: 'Always sprint while moving',
        });

        this.on('tick', () => {
            if (!this.enabled) return;
            if (Client.isInGui()) return;
            if (!Player.getPlayer()) return;
            if (!Client.isKeyDown('sprint')) {
                Client.setKey('sprint', true);
            }
        });
    }
}

new AlwaysSprint();