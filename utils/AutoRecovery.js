import { ClientboundDisconnectPacket, ClientboundLoginDisconnectPacket } from './Packets';
import { getArea, normalizeArea } from './Area';
import { subArea } from './Utils';
import { registerSkyblockEvent } from './SkyblockEvents';
import { closeInventory } from './player/Inventory';

const RECONNECT_HOST = 'mc.hypixel.net';
const RECONNECT_DELAYS_MS = [3000, 10000, 30000, 60000];
const UNLOADED_GRACE_MS = 8000;
const COMMAND_RETRY_MS = 5000;

const STATE = {
    READY: 'READY',
    RECONNECTING: 'RECONNECTING',
    JOINING_SKYBLOCK: 'JOINING_SKYBLOCK',
    GOING_ISLAND: 'GOING_ISLAND',
};

const sidebarTitle = () => {
    try {
        return ChatLib.removeFormatting(String(Scoreboard.getTitle?.() ?? ''))
            .trim()
            .toLowerCase();
    } catch (e) {
        return '';
    }
};

const sidebarLines = () => {
    try {
        return (Scoreboard.getLines() || []).map((line) =>
            ChatLib.removeFormatting(String(line?.getName?.() ?? line))
                .trim()
                .toLowerCase()
        );
    } catch (e) {
        return [];
    }
};

const areaText = () => {
    try {
        return String(getArea() || '')
            .trim()
            .toLowerCase();
    } catch (e) {
        return '';
    }
};

class AutoRecovery {
    constructor() {
        this.active = false;
        this.ready = true;
        this.owners = new Set();
        this.state = STATE.READY;
        this.notSkyBlock = false;
        this.lastCommandAt = 0;
        this.notLoadedSince = 0;
        this.kickedAt = 0;
        this.reconnectAttempts = 0;
        this.nextReconnectAt = 0;

        register('tick', () => this.tick());

        register('chat', (event) => {
            if (!this.active) return;
            const text = event?.message?.getUnformattedText?.() ?? '';
            if (/unknown command/i.test(String(text)) && /managebazaarorders|trades/i.test(String(text))) {
                this.notSkyBlock = true;
            }
        });

        registerSkyblockEvent('limbo', () => {
            if (this.active) this.notSkyBlock = true;
        });

        register('serverDisconnect', () => this.markDisconnected(false));

        register('packetReceived', () => this.markDisconnected(true)).setFilteredClasses([ClientboundDisconnectPacket, ClientboundLoginDisconnectPacket]);

        register('worldUnload', () => {
            if (this.active && !this.notLoadedSince) this.notLoadedSince = Date.now();
        });
    }

    markDisconnected(kicked) {
        if (!this.active) return;
        const now = Date.now();
        if (!this.notLoadedSince) this.notLoadedSince = now;
        if (kicked && !this.kickedAt) this.kickedAt = now;
    }

    isDisconnectedScreen() {
        try {
            const screen = Client.getCurrentScreen?.();
            return String(screen?.getClass?.()?.getName?.() ?? '').includes('DisconnectedScreen');
        } catch (e) {
            return false;
        }
    }

    setActive(value, owner = 'default') {
        if (value) this.owners.add(owner);
        else this.owners.delete(owner);
        const active = this.owners.size > 0;
        if (active === this.active) return;
        this.active = active;
        this.ready = !active;
        this.state = STATE.READY;
        this.notSkyBlock = false;
        this.notLoadedSince = 0;
        this.kickedAt = 0;
        this.lastCommandAt = 0;
        this.reconnectAttempts = 0;
        this.nextReconnectAt = 0;
        console.log(`[Recovery] active=${this.active} owners=${this.owners.size} ready=${this.ready}`);
    }

    isReady() {
        return !this.active || this.ready;
    }

    isRecovering() {
        return this.active && !this.ready;
    }

    inSkyBlock() {
        if (sidebarTitle().includes('skyblock')) return true;
        if (sidebarLines().some((line) => line.includes('skyblock'))) return true;
        const area = areaText();
        return !!area && area !== 'unknown';
    }

    onIsland() {
        if (normalizeArea(getArea()).includes('private island')) return true;
        return normalizeArea(subArea()).includes('your island');
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        console.log('[Recovery] state=' + state);
        console.log('[x-recovery] ' + state);
    }

    tryCommand(command) {
        const now = Date.now();
        if (now - this.lastCommandAt < COMMAND_RETRY_MS) return;
        this.lastCommandAt = now;
        this.notSkyBlock = false;
        try {
            closeInventory();
        } catch (e) {}
        console.log('[x-recovery] running /' + command);
        try {
            ChatLib.command(command);
        } catch (e) {
            console.error('[Recovery] /' + command + ' failed: ' + e);
        }
    }

    reconnectDelay(attempt) {
        return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
    }

    startReconnect(now) {
        this.reconnectAttempts++;
        this.nextReconnectAt = now + this.reconnectDelay(this.reconnectAttempts);
        console.log(`[x-recovery] reconnect attempt ${this.reconnectAttempts} to ${RECONNECT_HOST}`);
        try {
            Client.connect(RECONNECT_HOST);
        } catch (e) {
            console.error('[Recovery] connect failed: ' + e);
        }
    }

    tick() {
        if (!this.active) {
            this.ready = true;
            this.setState(STATE.READY);
            return;
        }

        const now = Date.now();
        const connected = World.isLoaded() && !!Player.getPlayer();

        if (!connected) {
            if (!this.notLoadedSince) this.notLoadedSince = now;
            if (!this.kickedAt && this.isDisconnectedScreen()) this.kickedAt = now;
            this.ready = false;
            this.setState(STATE.RECONNECTING);

            if (!this.nextReconnectAt) {
                const since = this.kickedAt || this.notLoadedSince;
                const grace = this.kickedAt ? RECONNECT_DELAYS_MS[0] : UNLOADED_GRACE_MS;
                if (now - since >= grace) this.startReconnect(now);
                return;
            }

            if (now >= this.nextReconnectAt) this.startReconnect(now);
            return;
        }

        this.notLoadedSince = 0;
        this.kickedAt = 0;
        this.nextReconnectAt = 0;

        if (!this.inSkyBlock() || this.notSkyBlock) {
            this.ready = false;
            this.setState(STATE.JOINING_SKYBLOCK);
            this.tryCommand('skyblock');
            return;
        }

        if (!this.onIsland()) {
            this.ready = false;
            this.setState(STATE.GOING_ISLAND);
            this.tryCommand('island');
            return;
        }

        if (!this.ready) console.log('[x-recovery] READY on ' + (areaText() || 'island'));
        this.reconnectAttempts = 0;
        this.ready = true;
        this.setState(STATE.READY);
    }
}

export const Recovery = new AutoRecovery();
