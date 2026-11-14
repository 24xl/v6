// In-game adapter that connects Minecraft packets/events to the ported
// TerminalSession + AutoTerminal (utils/catacombs/terminals/*).
//
// Noam's TerminalListener/AutoTerminal run as always-on listeners; here the whole
// feature is gated on autoTerminalSettings.enabled (the Cheats > Auto Terminal toggle).

import { terminalFromTitle, setSpecialGlintItems } from './Terminals';
import { TerminalSession } from './TerminalSession';
import { AutoTerminal } from './AutoTerminalCore';
import { autoTerminalSettings } from './AutoTerminalSettings';
import { isInDungeon } from '../DungeonLocation';
import {
    ClientboundOpenScreenPacket,
    ClientboundContainerSetContentPacket,
    ClientboundContainerSetSlotPacket,
    ClientboundContainerClosePacket,
    ServerboundContainerClosePacket,
    ServerboundInteractPacket,
    ServerboundAttackPacket,
} from '../../Packets';
import { ScriptKey, DataComponents } from '../../Constants';
import { ScheduleTask } from '../../ScheduleTask';

let totalServerTicks = 0;
let adapterInstance = null;

const emptyItem = { id: 'minecraft:air', name: '', count: 0, glint: false };

// Turn a real ItemStack (raw or wrapped) into the plain descriptor the solvers expect.
export function itemToDescriptor(item) {
    if (!item) return emptyItem;
    const mcStack = item.toMC ? item.toMC() : item;
    if (!mcStack || mcStack.isEmpty()) return emptyItem;

    let id = '';
    try {
        id = item.type?.getRegistryName?.() || String(mcStack.getItem().toString());
    } catch (e) {
        id = String(mcStack.getItem?.()?.toString?.() ?? 'minecraft:air');
    }
    if (id && !id.includes(':')) id = 'minecraft:' + id;

    let name = '';
    try {
        name = ChatLib.removeFormatting(String(item.getName ? item.getName() : mcStack.getHoverName().getString()));
    } catch (e) {
        name = '';
    }

    let count = 1;
    try {
        count = typeof mcStack.getCount === 'function' ? mcStack.getCount() : item.getStackSize ? item.getStackSize() : 1;
    } catch (e) {}

    // Noam's hasGlint() is the explicit glint-override component, not the enchantment check.
    let glint = false;
    try {
        glint = mcStack.has(DataComponents.ENCHANTMENT_GLINT_OVERRIDE) === true;
    } catch (e) {
        try {
            glint = item.isEnchanted ? item.isEnchanted() : false;
        } catch (_) {}
    }

    return { id, name, count, glint };
}

function getContainerItemsMap() {
    const map = new Map();
    const container = Player.getContainer();
    if (!container) return map;
    const size = container.getSize();
    for (let i = 0; i < size; i++) map.set(i, itemToDescriptor(container.getStackInSlot(i)));
    return map;
}

// Terminals are F7-only; the titles are unique. Be permissive on location so it also
// works in p3sim / singleplayer testing (where the scoreboard floor may be absent).
function canRun() {
    if (isInDungeon()) return true;
    const ip = String(Server.getIP() || '').toLowerCase();
    return ip.includes('p3sim') || ip.includes('localhost') || ip === '';
}

// Populate specialGlintItems the way Noam does: every item whose default components
// carry a glint override, plus golden apple (added by setSpecialGlintItems itself).
function initSpecialGlintItems() {
    try {
        const BuiltInRegistries = Java.type('net.minecraft.core.registries.BuiltInRegistries');
        const ids = [];
        const it = BuiltInRegistries.ITEM.iterator();
        while (it.hasNext()) {
            const entry = it.next();
            try {
                if (entry.components().has(DataComponents.ENCHANTMENT_GLINT_OVERRIDE)) {
                    ids.push(String(BuiltInRegistries.ITEM.getKey(entry).toString()));
                }
            } catch (e) {}
        }
        if (ids.length) setSpecialGlintItems(ids);
    } catch (e) {}
}

export class TerminalAdapter {
    constructor() {
        initSpecialGlintItems();

        this.deps = {
            nowMs: () => Date.now(),
            nowTicks: () => totalServerTicks,
            fcDelayTicks: () => autoTerminalSettings.firstClickDelay,
            breakTimeoutMs: () => autoTerminalSettings.breakTimeout,
            getContainerItems: () => getContainerItemsMap(),
            transmit: (click) => this.transmitClick(click),
            scheduleClientTicks: (ticks, fn) => ScheduleTask(ticks, fn),
            rng: Math.random,
        };

        this.session = new TerminalSession(this.deps);
        this.autoTerminal = new AutoTerminal(this.session, autoTerminalSettings, this.deps);
        this.pending = null;

        this.registerEvents();
    }

    transmitClick(click) {
        const container = Player.getContainer();
        if (!container) return;
        // Noam: btn 0 -> button 2 (CLONE), btn 1 -> button 1 (PICKUP).
        container.click(click.slotId, false, click.btn === 0 ? 'MIDDLE' : 'RIGHT');
    }

    registerEvents() {
        register('tick', () => {
            totalServerTicks++;
            if (this.session.inTerm && !autoTerminalSettings.enabled) {
                this.session.reset();
                return;
            }
            this.session.serverTick();
            this.autoTerminal.serverTick();
        });

        // Offtick auto-click runs per render frame (Noam's RenderWorldEvent), not per server tick.
        register('step', () => this.autoTerminal.frame());

        // --- Container open detection (Noam accumulates items, then fires "fully open") ---
        register('packetReceived', (packet) => {
            if (!autoTerminalSettings.enabled) return;
            const titleComp = packet.getTitle();
            const title = titleComp ? ChatLib.removeFormatting(titleComp.getString()) : '';
            const terminal = terminalFromTitle(title);
            if (!terminal || !canRun()) return;

            this.pending = {
                windowId: packet.getContainerId(),
                title,
                terminal,
                slotCount: terminal.slotCount,
                items: new Map(),
                fired: false,
            };
        }).setFilteredClass(ClientboundOpenScreenPacket);

        register('packetReceived', (packet) => {
            const p = this.pending;
            if (!p || p.fired) return;
            if (packet.containerId() !== p.windowId) return;

            const stacks = packet.items();
            for (let i = 0; i < stacks.length; i++) {
                const stack = stacks[i];
                if (stack && !stack.isEmpty()) p.items.set(i, itemToDescriptor(stack));
            }
            this.fireOpen(p);
        }).setFilteredClass(ClientboundContainerSetContentPacket);

        register('packetReceived', (packet) => {
            const p = this.pending;
            if (!p || p.fired) return;
            if (packet.getContainerId() !== p.windowId) return;

            const slot = packet.getSlot();
            const stack = packet.getItem();
            if (stack && !stack.isEmpty()) p.items.set(slot, itemToDescriptor(stack));

            if (slot === p.slotCount - 1) this.fireOpen(p);
        }).setFilteredClass(ClientboundContainerSetSlotPacket);

        // --- In-terminal slot updates (deferred so the local container reflects the packet) ---
        register('packetReceived', (packet) => {
            if (!this.session.inTerm) return;
            const containerId = packet.getContainerId();
            if (containerId !== this.session.lastWindowId) return;

            const slot = packet.getSlot();
            const desc = itemToDescriptor(packet.getItem());
            ScheduleTask(1, () => this.session.slotUpdate(containerId, slot, desc));
        }).setFilteredClass(ClientboundContainerSetSlotPacket);

        // --- Close / reset ---
        register('packetReceived', (packet) => {
            if (this.session.inTerm && packet.getContainerId() === this.session.lastWindowId) this.session.reset();
        }).setFilteredClass(ClientboundContainerClosePacket);

        register('packetSent', () => {
            if (this.session.inTerm) this.session.reset();
        }).setFilteredClass(ServerboundContainerClosePacket);

        register('guiClosed', () => {
            if (this.session.inTerm) this.session.reset();
        });

        register('worldUnload', () => this.session.reset());

        // --- Block manual input while a terminal is being solved ---
        register('guiMouseClick', (mouseX, mouseY, button, isPressed, screen, event) => {
            if (isPressed && this.autoTerminal.shouldBlockMouseClick()) cancel(event);
        });

        register('guiKey', (char, keyCode, screen, event) => {
            if (keyCode === ScriptKey.ESCAPE) return;
            const invKey = Client.getMinecraft().options.keyInventory.getDefaultKey();
            if (invKey && typeof invKey.getValue === 'function' && invKey.getValue() === keyCode) return;
            if (this.autoTerminal.shouldBlockKey(false)) cancel(event);
        });

        // --- Cancel hits on the "Inactive Terminal" stand per Noam's interactCooldown ---
        const handleStandClick = (packet, event) => {
            const entityId = packet.entityId();
            const world = World.toMC();
            if (!world) return;
            const entity = world.getEntity(entityId);
            if (!entity) return;

            let name = '';
            try {
                name = ChatLib.removeFormatting(String(entity.getCustomName?.()?.getString?.() ?? ''));
            } catch (e) {}
            const isInactiveStand = name.includes('Inactive Terminal');

            if (this.session.shouldCancelStandHit(isInactiveStand)) cancel(event);
        };

        register('packetSent', handleStandClick).setFilteredClass(ServerboundInteractPacket);
        register('packetSent', handleStandClick).setFilteredClass(ServerboundAttackPacket);
    }

    fireOpen(p) {
        p.fired = true;
        this.session.open(p.title, p.windowId, p.items, true);
        this.pending = null;
    }
}

export function initTerminalAdapter() {
    if (!adapterInstance) adapterInstance = new TerminalAdapter();
    return adapterInstance;
}
