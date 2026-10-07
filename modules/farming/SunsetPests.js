import { ModuleBase } from '../../utils/ModuleBase';
import { clickSlot, closeInventory, getGuiName, stripItemFormatting } from '../../utils/player/Inventory';

const MENU_NAME = 'Garden Time';
const SELECT_LORE = 'Click to select!';
const DAY_SLOT = 11;
const NIGHT_SLOT = 13;
const OPEN_TIMEOUT_MS = 4_000;

const STATES = {
    IDLE: 'Idle',
    WAIT_MENU: 'Waiting for menu',
    CLOSING: 'Closing',
};

class SunsetPests extends ModuleBase {
    constructor() {
        super({
            name: 'Sunset Pests',
            subcategory: 'Farming',
            description: 'Sets garden time to Day before plot teleports and back to Night when farming resumes.',
            showEnabledToggle: false,
            hideInModules: true,
        });

        this.enableSunsetPests = true;
        this.state = STATES.IDLE;
        this.pendingTime = null;
        this.openedAt = 0;
    }

    isDone(mode) {
        if (!this.enableSunsetPests) return true;
        if (this.state === STATES.IDLE) {
            this.pendingTime = mode;
            this.openedAt = Date.now();
            ChatLib.command('islandtime');
            this.state = STATES.WAIT_MENU;
            return false;
        }
        if (this.state === STATES.WAIT_MENU) return this.clickTarget();
        if (this.state === STATES.CLOSING) return this.closeMenu();
        return true;
    }

    clickTarget() {
        if (this.attemptClick()) return false;

        // Any failure waits out the open window instead of bailing early. reset() closes the
        // GUI, so a failed/timeout attempt can never strand farming with the menu open.
        if (Date.now() - this.openedAt > OPEN_TIMEOUT_MS) return this.reset();
        return false;
    }

    attemptClick() {
        const container = Player.getContainer();
        if (!container || !getGuiName()?.includes(MENU_NAME)) return false;

        const slot = this.pendingTime === 'day' ? DAY_SLOT : NIGHT_SLOT;
        const item = container.getStackInSlot(slot);
        if (!item) return false;

        const lore = item.getLore?.() || [];
        if (!lore.some((line) => stripItemFormatting(String(line)).includes(SELECT_LORE))) return false;

        clickSlot(slot, false, 'LEFT');
        this.state = STATES.CLOSING;
        this.openedAt = Date.now();
        return true;
    }

    closeMenu() {
        if (Client.isInGui()) closeInventory();
        return this.reset();
    }

    reset() {
        if (Client.isInGui()) closeInventory();
        this.state = STATES.IDLE;
        this.pendingTime = null;
        return true;
    }
}

export const sunsetPests = new SunsetPests();