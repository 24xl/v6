import { ModuleBase } from '../../utils/ModuleBase';
import { wrapTo180 } from '../../utils/Math';
import { getModule } from '../../utils/MacroState';
import { forceGrab, releaseForcedGrab } from '../../utils/Ungrab';
import { mc } from '../../utils/Utils';
import { Client, Perspective } from '../../core/GuiRenderer';

class Freelook extends ModuleBase {
    constructor() {
        super({
            name: 'Freelook',
            subcategory: 'Visuals',
            description: 'Look around independently while the camera stays with your player.',
            theme: '#5fb0ff',
            showEnabledToggle: false,
        });

        // Button mode: 'toggle' (default) or 'hold'
        this.freelookMode = 'toggle';

        this.savedPerspective = null;
        this.on('renderWorld', () => this.updateCamera());
    }

    onEnable() {
        const player = Player.getPlayer();
        if (!World.isLoaded() || !player) return this.toggle(false);

        getModule('Freecam')?.toggle(false);

        // No chat message on enable

        this.savedPerspective = mc.options.getCameraType();
        forceGrab();
        Client.setCameraRotation(wrapTo180(player.getYRot()), player.getXRot());
        Client.setFreelookDistance(4.0);
        Client.setFreelook(true);
        mc.options.setCameraType(Perspective.THIRD_PERSON_BACK);
    }

    onDisable() {
        // No chat message on disable

        Client.setFreelook(false);
        Client.clearCameraRotation();

        if (this.savedPerspective) mc.options.setCameraType(this.savedPerspective);
        this.savedPerspective = null;
        releaseForcedGrab();
    }

    updateCamera() {
        const player = Player.getPlayer();
        if (!player) return;

        // In toggle mode, keep camera type as third-person back
        // In hold mode, we handle via key presses
        if (this.freelookMode === 'toggle') {
            if (mc.options.getCameraType() !== Perspective.THIRD_PERSON_BACK) {
                mc.options.setCameraType(Perspective.THIRD_PERSON_BACK);
            }
        }
    }

    toggleMode() {
        // Switch between toggle and hold modes
        this.freelookMode = this.freelookMode === 'toggle' ? 'hold' : 'toggle';
    }
}

new Freelook();