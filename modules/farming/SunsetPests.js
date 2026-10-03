import { ModuleBase } from '../../utils/ModuleBase';
import { clickSlot, closeInventory, getGuiName, stripItemFormatting } from '../../utils/player/Inventory';

const MENU_NAME = 'Garden Time';
const SELECT_LORE = 'Click to select!';
const DAY_SLOT = 12;
const NIGHT_SLOT = 14;
const OPEN_TIMEOUT_MS = 4_000;
const CLOSE_TIMEOUT_MS = 2_000;

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
        });

        this.enableSunsetPests = true;
        this.addToggle(
            'Enable Sunset Pests',
            (value) => (this.enableSunsetPests = !!value),
            'Sets garden time to Day before each infested-plot teleport, and back to Night once pest killing finishes.'
        );

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
        const container = Player.getContainer();
        if (!container || !getGuiName()?.includes(MENU_NAME)) {
            if (Date.now() - this.openedAt > OPEN_TIMEOUT_MS) return this.reset();
            return false;
        }

        const slot = this.pendingTime === 'day' ? DAY_SLOT : NIGHT_SLOT;
        const item = container.getStackInSlot(slot);
        if (!item) return this.reset();

        const lore = item.getLore?.() || [];
        if (!lore.some((line) => stripItemFormatting(String(line)).includes(SELECT_LORE))) return this.reset();

        clickSlot(slot, false, 'LEFT');
        this.state = STATES.CLOSING;
        this.openedAt = Date.now();
        return false;
    }

    closeMenu() {
        if (Client.isInGui()) closeInventory();
        if (Date.now() - this.openedAt < CLOSE_TIMEOUT_MS) return false;
        return this.reset();
    }

    reset() {
        this.state = STATES.IDLE;
        this.pendingTime = null;
        return true;
    }
}

export const sunsetPests = new SunsetPests();