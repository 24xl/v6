// Terminal state machine, ported from NoammAddons' TerminalListener.kt.
//
// It knows nothing about packets or Minecraft. An in-game adapter feeds it events and supplies:
//   deps.nowMs()            -> milliseconds
//   deps.nowTicks()         -> server ticks (only counted while in a dungeon)
//   deps.fcDelayTicks()     -> "First Click Delay" setting (ticks)
//   deps.breakTimeoutMs()   -> "Break Timeout" setting (ms)
//   deps.getContainerItems() -> Map slot -> item descriptor for the open container (used to resync)

import { EMPTY_ITEM, ALL_TERMINALS, terminalFromTitle } from './Terminals';

const BLACK_PANE = 'minecraft:black_stained_glass_pane';
const INTERACT_COOLDOWN_TICKS = 15;

export class TerminalSession {
    constructor(deps) {
        this.deps = deps;
        this.inTerm = false;
        this.currentHandler = null;
        this.currentTitle = '';
        this.lastWindowId = -1;
        this.currentItems = new Map();
        this.clickedSlots = [];
        this.lastClick = null;
        this.initialOpenTick = 0;
        this.initialOpenTime = 0;
        this.interactCooldown = 0;
        this.listeners = { slotUpdate: [], break: [], close: [], open: [] };
    }

    on(name, callback) {
        this.listeners[name].push(callback);
    }

    emit(name, payload) {
        for (const callback of this.listeners[name].slice()) callback(payload);
    }

    // ContainerFullyOpenedEvent handler. Returns the terminal handler, or null if this is not a terminal.
    open(title, windowId, items, isF7Phase3) {
        if (!isF7Phase3) return null;

        const handler = terminalFromTitle(title);
        if (handler === null) {
            this.reset();
            return null;
        }
        if (this.inTerm) this.reset();

        this.inTerm = true;
        this.initialOpenTick = this.deps.nowTicks();
        this.initialOpenTime = this.deps.nowMs();
        this.currentTitle = title;
        this.lastWindowId = windowId;
        this.currentItems.clear();
        for (const entry of Array.from(items.entries()).sort((a, b) => a[0] - b[0])) this.currentItems.set(entry[0], entry[1]);
        this.clickedSlots.length = 0;
        this.currentHandler = handler;

        if (handler.displayName === 'Melody') {
            for (const entry of Array.from(this.currentItems.entries())) handler.solve(this.currentItems, this.currentTitle, entry[0], entry[1]);
        } else {
            handler.solve(this.currentItems, this.currentTitle, 0, EMPTY_ITEM);
        }

        this.emit('open', handler);
        return handler;
    }

    isMelody() {
        return this.currentHandler !== null && this.currentHandler.displayName === 'Melody';
    }

    isRubix() {
        return this.currentHandler !== null && this.currentHandler.displayName === 'Rubix';
    }

    // ClientboundContainerSetSlotPacket (after the client applied it).
    slotUpdate(windowId, slot, item) {
        if (!this.inTerm || windowId !== this.lastWindowId) return;
        const handler = this.currentHandler;
        if (handler === null) return;
        if (slot < 0 || slot >= handler.slotCount) return;
        if (item.id === BLACK_PANE) return;
        if (this.isRubix()) return;

        this.sync(handler, slot, item);

        if (!this.isMelody()) for (const click of this.clickedSlots.slice()) handler.predict(click);
        this.emit('slotUpdate', { handler, slot, item });
    }

    // Direct slot update for Melody: reads the packet item straight into currentItems and
    // calls solve() immediately. No container rebuild, no tick deferral. Melody panes arrive
    // one per tick and the button moves every tick, so any delay here desyncs the click.
    slotUpdateItem(windowId, slot, item) {
        if (!this.inTerm || windowId !== this.lastWindowId) return;
        const handler = this.currentHandler;
        if (!handler || handler.displayName !== 'Melody') return;
        if (slot < 0 || slot >= handler.slotCount) return;
        if (item.id === BLACK_PANE) return;

        this.currentItems.set(slot, item);
        handler.solve(this.currentItems, this.currentTitle, slot, item);
        this.emit('slotUpdate', { handler, slot, item });
    }

    // Re-read the whole container and rebuild the solution.
    sync(handler, slotId = 0, stack = EMPTY_ITEM) {
        const items = this.deps.getContainerItems();
        for (const entry of items.entries()) if (entry[0] < handler.slotCount) this.currentItems.set(entry[0], entry[1]);

        handler.solve(this.currentItems, this.currentTitle, slotId, stack);
        this.emit('break', handler);
    }

    checkFcDelay() {
        let delay = this.deps.fcDelayTicks();
        if (this.isMelody() && delay !== 0) delay += 3;

        return this.deps.nowTicks() - this.initialOpenTick < delay || this.deps.nowMs() - this.initialOpenTime < delay * 50;
    }

    // ServerboundContainerClickPacket about to be sent. Returns true if it must be cancelled.
    onClickPacketSent() {
        if (!this.inTerm) return false;
        const melody = this.isMelody();
        if (this.checkFcDelay() && !melody) return true;
        if (melody) return false;
        this.lastClick = this.deps.nowMs();
        return false;
    }

    // TerminalClick.send(): build, maybe transmit, then record. transmit(click) is only called when not cancelled.
    sendClick(click, transmit) {
        if (this.lastWindowId === -1) return false;

        if (!this.onClickPacketSent()) transmit(click);

        this.clickedSlots.push(click);
        if (this.currentHandler !== null) this.currentHandler.onSlotClick(click.slotId);
        return true;
    }

    // ServerboundInteract/Attack on an armor stand. Returns true if the packet must be cancelled.
    shouldCancelStandHit(isInactiveTerminalStand) {
        if (!isInactiveTerminalStand) return false;
        if (this.interactCooldown > 0 || this.lastWindowId !== -1) return true;
        this.interactCooldown = INTERACT_COOLDOWN_TICKS;
        return false;
    }

    // TickEvent.Server
    serverTick() {
        if (this.interactCooldown > 0) this.interactCooldown--;

        if (this.lastClick === null) return;
        const handler = this.currentHandler;
        if (handler === null) return;
        if (this.deps.nowMs() - this.lastClick < this.deps.breakTimeoutMs()) return;

        this.sync(handler);
        this.clickedSlots.length = 0;
        this.lastClick = this.deps.nowMs();
    }

    onCloseWindowPacketSent() {
        if (this.inTerm) this.reset();
    }

    reset() {
        this.inTerm = false;
        this.currentHandler = null;
        this.currentTitle = '';
        this.currentItems.clear();
        this.clickedSlots.length = 0;
        this.lastWindowId = -1;
        this.lastClick = null;
        this.initialOpenTick = 0;
        this.initialOpenTime = 0;

        for (const terminal of ALL_TERMINALS) terminal.reset();
        this.emit('close', null);
    }
}
