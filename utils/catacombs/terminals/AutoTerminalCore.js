// AutoTerminal decision logic, ported from NoammAddons' AutoTerminal.kt.
//
// Effects are injected so the logic can be run against a simulated server:
//   deps.nowMs()                 -> milliseconds
//   deps.nowTicks()              -> server ticks
//   deps.transmit(click)         -> actually send the container-click packet
//   deps.scheduleClientTicks(n, fn) -> run fn after n client ticks
//   deps.rng()                   -> uniform [0, 1)

import { getBestClick, getWorstClick, resetHumanClickOrder } from './HumanClickOrder';

// Noam's MathUtils.gaussianRandom(min, max): clamped normal, truncated to an int.
export function gaussianRandom(min, max, rng = Math.random) {
    const u1 = 1 - rng();
    const u2 = 1 - rng();
    const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const mean = min + (max - min) / 2;
    const stdDev = (max - min) / 6;
    return Math.trunc(Math.max(min, Math.min(max, gaussian * stdDev + mean)));
}

export const CLICK_ORDER = Object.freeze({ NONE: 0, RANDOM: 1, HUMAN: 2, SKIZO: 3 });

export const DEFAULT_SETTINGS = Object.freeze({
    randomDelay: true,
    autoDelay: 150,
    minRandomDelay: 120,
    maxRandomDelay: 150,
    offtick: false,
    clickOrder: CLICK_ORDER.HUMAN,
    melody: true,
    melodyFcDelay: true,
    melodySkip: false,
    melodySkipMode: 0,
    melodySkipFirstRow: false,
    numbers: true,
    colors: true,
    rubix: true,
    redGreen: true,
    startWith: true,
});

const MELODY_MIN_GAP_MS = 250;

export class AutoTerminal {
    constructor(session, settings, deps) {
        this.session = session;
        this.settings = settings;
        this.deps = deps;
        this.lastClickTime = 0;
        this.lastClickTick = 0;
        this.lastClickedSlot = null;

        session.on('slotUpdate', (event) => {
            if (!this.settings.melody) return;
            if (event.handler.displayName !== 'Melody') return;
            this.lastClickedSlot = null;
        });
        session.on('break', () => {
            this.lastClickedSlot = null;
        });
        session.on('close', () => {
            this.lastClickedSlot = null;
            this.lastClickTime = 0;
            this.lastClickTick = 0;
            resetHumanClickOrder();
        });
    }

    enabledFor(handler) {
        switch (handler.displayName) {
            case 'Numbers':
                return this.settings.numbers;
            case 'Colors':
                return this.settings.colors;
            case 'Melody':
                return this.settings.melody;
            case 'Rubix':
                return this.settings.rubix;
            case 'Red Green':
                return this.settings.redGreen;
            case 'Starts With':
                return this.settings.startWith;
            default:
                return false;
        }
    }

    getDelay() {
        const s = this.settings;
        let delay;
        if (this.session.checkFcDelay()) {
            delay = this.session.deps.fcDelayTicks() * 50;
        } else if (s.randomDelay) {
            const min = Math.max(0, s.minRandomDelay);
            const max = Math.max(0, s.maxRandomDelay);
            delay = min === max ? min : gaussianRandom(Math.min(min, max), Math.max(min, max), this.deps.rng);
        } else {
            delay = s.autoDelay;
        }
        return Math.max(0, delay);
    }

    // TickEvent.Server
    serverTick() {
        if (!this.settings.offtick) this.autoTick();
        this.melodyTick();
    }

    // RenderWorldEvent: only does something with "Off Tick Clicks" on.
    frame() {
        if (!this.settings.offtick) return;
        const handler = this.session.currentHandler;
        if (handler === null) return;
        if (handler.displayName === 'Melody') return;
        if (!this.enabledFor(handler)) return;
        if (handler.solution.length === 0) return;
        if (this.session.checkFcDelay()) return;
        if (this.lastClickTick === this.deps.nowTicks()) return;
        if (this.deps.nowMs() - this.lastClickTime < this.getDelay()) return;
        this.lastClickTime = this.deps.nowMs();
        this.lastClickTick = this.deps.nowTicks();

        this.autoClick(handler);
    }

    autoTick() {
        const handler = this.session.currentHandler;
        if (handler === null) return;
        if (handler.displayName === 'Melody') return;
        if (!this.enabledFor(handler)) return;
        if (handler.solution.length === 0) return;
        if (this.session.checkFcDelay()) return;
        if (this.deps.nowMs() - this.lastClickTime < this.getDelay()) return;
        this.lastClickTime = this.deps.nowMs();

        this.autoClick(handler);
    }

    autoClick(handler) {
        const order = this.settings.clickOrder;
        let rawClick;
        if (handler.displayName === 'Numbers') rawClick = handler.solution[0];
        else if (order === CLICK_ORDER.RANDOM) rawClick = handler.solution[Math.floor(this.deps.rng() * handler.solution.length)];
        else if (order === CLICK_ORDER.HUMAN) rawClick = getBestClick(handler, this.deps.rng);
        else if (order === CLICK_ORDER.SKIZO) rawClick = getWorstClick(handler, this.deps.rng);
        else rawClick = handler.solution[0];

        const rubix = handler.displayName === 'Rubix';
        if (this.lastClickedSlot === rawClick.slotId && !rubix) return;

        const finalClick = rubix ? handler.getClickForSlot(rawClick.slotId) : rawClick;
        if (finalClick === null) return;

        this.lastClickedSlot = finalClick.slotId;
        handler.predict(finalClick);
        this.click(finalClick);
    }

    click(click) {
        this.session.sendClick(click, this.deps.transmit);
    }

    melodyTick() {
        const s = this.settings;
        if (!s.melody) return;
        if (s.melodyFcDelay && this.session.checkFcDelay()) return;
        const handler = this.session.currentHandler;
        if (handler === null || handler.displayName !== 'Melody') return;
        if (this.deps.nowMs() - this.lastClickTime < MELODY_MIN_GAP_MS) return;

        const current = handler.current;
        const correct = handler.correct;
        const buttonRow = handler.buttonRow;
        if (current === null || correct === null || buttonRow === null) return;
        if (current !== correct) return;

        const actualSlot = buttonRow * 9 + 16;
        if (this.lastClickedSlot === actualSlot) return;

        this.click({ slotId: actualSlot, btn: 0 });
        this.lastClickTime = this.deps.nowMs();
        this.lastClickedSlot = actualSlot;

        if (buttonRow === 2) return;
        if (!s.melodySkip) return;
        if (!s.melodySkipFirstRow && buttonRow === 0 && current !== 4) return;
        if (!(s.melodySkipMode === 1 || (s.melodySkipMode === 0 && (current === 0 || current === 4)))) return;

        const windowId = this.session.lastWindowId;
        const stillThere = () => this.session.inTerm && this.session.isMelody() && windowId === this.session.lastWindowId;
        if (buttonRow < 3) this.deps.scheduleClientTicks(1, () => stillThere() && this.click({ slotId: actualSlot + 9, btn: 0 }));
        if (buttonRow < 2) this.deps.scheduleClientTicks(2, () => stillThere() && this.click({ slotId: actualSlot + 18, btn: 0 }));
    }

    // ContainerEvent.MouseClick: manual clicks are blocked while an enabled terminal is open.
    shouldBlockMouseClick() {
        const handler = this.session.currentHandler;
        return handler !== null && this.enabledFor(handler);
    }

    // ContainerEvent.Keyboard: everything except the inventory key and Escape.
    shouldBlockKey(isInventoryOrEscape) {
        if (isInventoryOrEscape) return false;
        return this.shouldBlockMouseClick();
    }
}
