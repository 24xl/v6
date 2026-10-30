import { ModuleBase } from '../../utils/ModuleBase';
import { wrapTo180 } from '../../utils/Math';
import { getModule } from '../../utils/MacroState';
import { forceGrab, releaseForcedGrab } from '../../utils/Ungrab';
import { mc } from '../../utils/Utils';

const Perspective = net.minecraft.client.CameraType;

class Freelook extends ModuleBase {
    constructor() {
        super({
            name: 'Freelook',
            subcategory: 'Visuals',
            description: 'Look around independently while the camera stays with your player.',
            tooltip: 'Client-side third-person freelook.',
            theme: '#5fb0ff',
            autoDisableOnWorldUnload: true,
            showEnabledToggle: false,
        });

        this.bindToggleKey();

        // Mode setting: 'toggle' (default) or 'hold'
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

        if (mc.options.getCameraType() !== Perspective.THIRD_PERSON_BACK) {
            mc.options.setCameraType(Perspective.THIRD_PERSON_BACK);
        }
    }

    onKeyPress(key) {
        // Handle key press for freelook toggle
        if (key === this.freelookKey) {
            if (this.freelookMode === 'toggle') {
                this.toggle(false);
            }
            // In hold mode, key press enables freelook, release disables it
            // (handled by the keybind system)
        }
    }

    toggleMode() {
        // Switch between toggle and hold modes
        this.freelookMode = this.freelookMode === 'toggle' ? 'hold' : 'toggle';
    }
}

new Freelook();