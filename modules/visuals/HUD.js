import { drawInventoryHudBackground, drawStatsHud, getStatsHudLines } from '../../gui/OverlayRenderers';
import { ModuleBase } from '../../utils/ModuleBase';
import { OverlayManager } from '../../gui/OverlayUtils';
import { GuiState } from '../../gui/core/GuiState';
import { saveSettings } from '../../gui/GuiSave';
import { SkijaPIP } from '../../utils/Constants';
import { oreRouteEditor } from '../../gui/OreRouteEditor';
import { chat } from '../../utils/Chat';
import { v5Command } from '../../utils/V5Commands';

const DrawContextHolder = com.chattriggers.ctjs.api.render.DrawContextHolder;

class HUD extends ModuleBase {
    constructor() {
        super({
            name: 'HUD',
            subcategory: 'Visuals',
            description: 'Different GUI components',
            tooltip: 'GUI overlays like FPS counter or Inventory HUD',
            showEnabledToggle: false,
        });

        this.worldLoaded = World.isLoaded();
        this.nextFpsWarningAt = Date.now() + 300000;

        this.fpsWarningToggle = this.addToggle('FPS Warning', null, 'Warns when low FPS may be improved by disabling HUDs', true);

        this.stats = OverlayManager.hudSettings.stats;
        this.inventory = OverlayManager.hudSettings.inventory;

        this.when(
            () => this.inventory.enabled !== false,
            'renderOverlay',
            () => this.renderOverlay()
        );
        this.when(
            () => this.inventory.enabled !== false,
            'postGuiRender',
            () => this.renderOverlay()
        );
        this.inventoryOverlay = null;
        this.inventoryBackgroundCallback = () => drawInventoryHudBackground(this.inventoryOverlay);
        this.statsCallback = () => this.renderStatsOverlay();
        this.statsRegistration = null;

        register('gameUnload', () => OverlayManager.saveHudSettings());
        register('guiClosed', () => OverlayManager.saveHudSettings());
        register('tick', () => {
            this.worldLoaded = World.isLoaded();
            this.updateRenderRegistrations();
        });
        register('step', () => this.warnLowFps()).setFps(1);
        v5Command('hud fps-warning disable', () => this.disableFpsWarning());
        v5Command('hud disable', () => this.disableHuds());
        this.updateRenderRegistrations();
    }

    warnLowFps() {
        const now = Date.now();
        if (
            now < this.nextFpsWarningAt ||
            !this.worldLoaded ||
            !this.fpsWarningToggle.enabled ||
            (this.stats.enabled === false && this.inventory.enabled === false) ||
            Client.getFPS() >= 120
        )
            return;

        this.nextFpsWarningAt = now + 300000;
        chat(
            new TextComponent(
                { text: 'Low FPS detected. Disabling HUDs may improve performance. ', color: 'red' },
                {
                    text: '[Disable warning]',
                    color: 'yellow',
                    underline: true,
                    clickEvent: { action: 'run_command', value: '/v5 hud fps-warning disable' },
                },
                ' ',
                {
                    text: '[Disable both HUDs]',
                    color: 'yellow',
                    underline: true,
                    clickEvent: { action: 'run_command', value: '/v5 hud disable' },
                }
            )
        );
    }

    disableFpsWarning() {
        this.fpsWarningToggle.enabled = false;
        saveSettings();
    }

    disableHuds() {
        OverlayManager.hudSettings.stats.enabled = false;
        OverlayManager.hudSettings.inventory.enabled = false;
        OverlayManager.saveHudSettings();
        this.updateRenderRegistrations();
    }

    onDisable() {
        OverlayManager.saveHudSettings();
    }

    prepareOverlay(kind) {
        if (GuiState.myGui.isOpen() || oreRouteEditor.isOpen() || OverlayManager.drawingGUI || !this[kind].enabled || !this.worldLoaded) return null;

        const sw = Render2D.screen.getWidth();
        const sh = Render2D.screen.getHeight();
        if (sw <= 0 || sh <= 0) return null;

        return OverlayManager.getHudOverlay(kind, sw, sh);
    }

    updateRenderRegistrations() {
        const visible = this.worldLoaded && !GuiState.myGui.isOpen() && !oreRouteEditor.isOpen() && !OverlayManager.drawingGUI;
        if (visible && this.stats.enabled !== false && !this.statsRegistration) {
            this.statsRegistration = Render2D.registerV5Render(this.statsCallback);
        } else if ((!visible || this.stats.enabled === false) && this.statsRegistration) {
            Render2D.unregisterV5Render(this.statsRegistration);
            this.statsRegistration = null;
        }
    }

    drawInventoryHudItems(overlay) {
        const inventory = Player.getPlayer()?.getInventory();
        const context = DrawContextHolder.currentContext;
        if (!inventory || !context) return;

        const { x, y, scale } = overlay;
        const pose = context.pose();

        pose.pushMatrix();
        pose.translate(x + 7 * scale, y + 7 * scale);
        pose.scale(scale, scale);

        try {
            for (let i = 0; i < 27; i++) {
                const stack = inventory.getItem(i + 9);
                if (!stack.isEmpty()) context.item(stack, (i % 9) * 18, Math.floor(i / 9) * 18);
            }

            for (let i = 0; i < 9; i++) {
                const stack = inventory.getItem(i);
                if (!stack.isEmpty()) context.item(stack, i * 18, 58);
            }
        } finally {
            pose.popMatrix();
        }
    }

    renderOverlay() {
        this.inventoryOverlay = this.prepareOverlay('inventory');
        if (!this.inventoryOverlay) return;

        try {
            SkijaPIP.draw(DrawContextHolder.currentContext, this.inventoryBackgroundCallback, false);
            this.drawInventoryHudItems(this.inventoryOverlay);
        } catch (e) {
            console.error(e);
        }
    }

    renderStatsOverlay() {
        const overlay = this.prepareOverlay('stats');
        if (!overlay) return;
        try {
            drawStatsHud(overlay, getStatsHudLines());
        } catch (e) {
            console.error(e);
        }
    }
}

new HUD();
