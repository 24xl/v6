import { drawInventoryHudBackground, drawStatsHud, getInventoryHudCacheKey, getStatsHudCacheKey, getStatsHudLines } from '../../gui/OverlayRenderers';
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
        this.statsCallback = () => this.renderStatsOverlay();
        this.statsRegistration = null;
        this.pendingPanels = null;

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
            this.statsRegistration = Render2D.registerV5CachedRender(this.statsCallback);
        } else if ((!visible || this.stats.enabled === false) && this.statsRegistration) {
            Render2D.unregisterV5Render(this.statsRegistration);
            this.statsRegistration = null;
        }
    }

    panelBounds(overlay) {
        const pad = overlay.scale + 1;
        return { x: overlay.x - pad, y: overlay.y - pad, width: overlay.width + pad * 2, height: overlay.height + pad * 2 };
    }

    disjoint(left, right) {
        return left.x + left.width <= right.x || right.x + right.width <= left.x || left.y + left.height <= right.y || right.y + right.height <= left.y;
    }

    enqueueInventory(overlay, key, callback) {
        const context = DrawContextHolder.currentContext;
        if (!context) return;
        const bounds = this.panelBounds(overlay);
        SkijaPIP.drawInventory(context, bounds.x, bounds.y, bounds.width, bounds.height, key, callback);
    }

    renderOverlay() {
        this.pendingPanels = null;
        const inventory = this.prepareOverlay('inventory');
        if (!inventory) return;

        try {
            const stats = this.prepareOverlay('stats');
            const lines = stats && getStatsHudLines().map(({ label, value, color }) => ({ label, value, color }));
            const inventoryBounds = this.panelBounds(inventory);
            const statsBounds = stats && this.panelBounds(stats);
            if (statsBounds && this.disjoint(inventoryBounds, statsBounds)) {
                const x = Math.min(inventoryBounds.x, statsBounds.x);
                const y = Math.min(inventoryBounds.y, statsBounds.y);
                const width = Math.max(inventoryBounds.x + inventoryBounds.width, statsBounds.x + statsBounds.width) - x;
                const height = Math.max(inventoryBounds.y + inventoryBounds.height, statsBounds.y + statsBounds.height) - y;
                const key = `${getInventoryHudCacheKey(inventory)}:${getStatsHudCacheKey(stats, lines)}`;
                const callback = () => {
                    drawInventoryHudBackground(inventory);
                    drawStatsHud(stats, lines);
                };
                this.pendingPanels = {
                    context: DrawContextHolder.currentContext,
                    x,
                    y,
                    width,
                    height,
                    stats: statsBounds,
                    key,
                    statsKey: getStatsHudCacheKey(stats, lines),
                    callback,
                };
                SkijaPIP.drawPanels(
                    DrawContextHolder.currentContext,
                    x,
                    y,
                    width,
                    height,
                    inventoryBounds.x,
                    inventoryBounds.y,
                    inventoryBounds.width,
                    inventoryBounds.height,
                    key,
                    callback
                );
            } else {
                this.enqueueInventory(inventory, getInventoryHudCacheKey(inventory), () => drawInventoryHudBackground(inventory));
            }
            Render2D.drawPlayerInventory(DrawContextHolder.currentContext, inventory.x, inventory.y, inventory.scale);
        } catch (e) {
            console.error(e);
        }
    }

    renderStatsOverlay() {
        const overlay = this.prepareOverlay('stats');
        if (!overlay) return;
        const panels = this.pendingPanels;
        this.pendingPanels = null;
        try {
            if (panels?.context === DrawContextHolder.currentContext && panels.statsKey === getStatsHudCacheKey(overlay, getStatsHudLines())) {
                const { x, y, width, height, stats, key, callback } = panels;
                SkijaPIP.drawPanels(DrawContextHolder.currentContext, x, y, width, height, stats.x, stats.y, stats.width, stats.height, key, callback);
                return;
            }
            const lines = getStatsHudLines().map(({ label, value, color }) => ({ label, value, color }));
            const bounds = this.panelBounds(overlay);
            SkijaPIP.drawStats(DrawContextHolder.currentContext, bounds.x, bounds.y, bounds.width, bounds.height, getStatsHudCacheKey(overlay, lines), () =>
                drawStatsHud(overlay, lines)
            );
        } catch (e) {
            console.error(e);
        }
    }
}

new HUD();
