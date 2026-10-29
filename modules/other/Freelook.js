import { ModuleBase } from '../../utils/ModuleBase';
import { wrapTo180 } from '../../utils/Math';
import { getModule } from '../../utils/MacroState';
import { forceGrab, releaseForcedGrab } from '../../utils/Ungrab';
import { mc } from '../../utils/Utils';

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

        this.savedPerspective = 0;
        this.on('renderWorld', () => this.updateCamera());
    }

    onEnable() {
        const player = Player.getPlayer();
        if (!World.isLoaded() || !player) return this.toggle(false);

        getModule('Freecam')?.toggle(false);

        // No chat message on enable

        this.savedPerspective = mc.options.getCameraType();
        forceGrab();
        mc.setCameraRotation(wrapTo180(Player.getYRot()), Player.getXRot());
        mc.setFreelookDistance(4.0);
        mc.setFreelook(true);
        // THIRD_PERSON_BACK = 0 in Minecraft's CameraType enum
        if (mc.options.getCameraType() !== 0) {
            mc.options.setCameraType(0);
        }
    }

    onDisable() {
        // No chat message on disable

        mc.setFreelook(false);
        mc.clearCameraRotation();

        // THIRD_PERSON_BACK = 0
        if (this.savedPerspective !== 0) mc.options.setCameraType(this.savedPerspective);
        this.savedPerspective = 0;
        releaseForcedGrab();
    }

    updateCamera() {
        const player = Player.getPlayer();
        if (!player) return;

        // In toggle mode, keep camera type as third-person back (0)
        if (this.freelookMode === 'toggle') {
            if (mc.options.getCameraType() !== 0) {
                mc.options.setCameraType(0);
            }
        }
    }

    toggleMode() {
        // Switch between toggle and hold modes
        this.freelookMode = this.freelookMode === 'toggle' ? 'hold' : 'toggle';
    }
}

new Freelook();