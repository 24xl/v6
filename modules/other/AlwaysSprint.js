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
            try {
                const mc = Client.getMinecraft();
                const player = Player.getPlayer();
                if (!mc || !player) return;
                if (mc.thePlayer?.capabilities?.isCreativeMode) return;
                const movementInput = mc.thePlayer?.movementInput;
                if (!movementInput) return;
                if (movementInput.moveForward === 0 && movementInput.moveStrafe === 0) return;
                if (player.isSprinting()) return;
                mc.thePlayer.setSprinting(true);
            } catch (e) {
                // ignore
            }
        });
    }
}

new AlwaysSprint();
