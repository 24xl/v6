import Pathfinder from '../../../utils/pathfinder/PathFinder';
import { chat } from '../../../utils/Chat';
import { ArmorStandEntity } from '../../../utils/Constants';
import { clickItem, closeInventory } from '../../../utils/player/Inventory';
import { Rotations } from '../../../utils/player/Rotations';
import { farmingSettings } from '../FarmingSettings';
import { rewarpSettings } from './RewarpSettings';
import { angleToPlayer } from '../../../utils/Math';
import { stripTabFormatting, getTabListNames } from '../../../utils/TabListUtils';
import { getGardenPestStatus } from '../../../utils/Utils';
import { registerSkyblockEvent } from '../../../utils/SkyblockEvents';

const cleanText = (value) => ChatLib.removeFormatting(String(value ?? '')).trim();

const TRAP_BOX_COLOR = new RenderColor(0, 255, 0, 120);

const TELEPORT_TIMEOUT_MS = 10_000;
const AIM_TIMEOUT_MS = 2_500;
const OPEN_TIMEOUT_MS = 3_000;
const OPEN_ATTEMPTS = 2;
const STAND_ATTEMPTS = 1;
const APPROACH_DISTANCE = 3;
const APPROACH_TIMEOUT_MS = 25_000;
const RELEASE_WAIT_MS = 1_500;
const SCAN_GATHER_MS = 8_000;
const REOPEN_HOLD_COOLDOWN_MS = 400;
const AIM_PRECISION = 3;
const PEST_TRAPS_RE = /^Pest Traps:\s*(\d+)\s*\/\s*\d+$/;
const FULL_TRAPS_RE = /^Full Traps:\s*(.*)$/;

const STATES = {
    IDLE: 'Idle',
    TELEPORTING: 'Teleporting to trap plot',
    LANDING: 'Landing',
    SCANNING: 'Scanning for traps',
    APPROACHING: 'Approaching trap',
    AIMING: 'Aiming at trap',
    OPENING: 'Opening trap',
    RELEASING: 'Releasing pests',
    CLOSING: 'Closing trap',
    WAITING_DEATH: 'Waiting for pests to die',
};

class PestTraps {
    constructor() {
        this.running = false;
        this.state = STATES.IDLE;
        this.nextActionAt = 0;
        this.pathToken = 0;

        register('postRenderWorld', () => {
            if (!this.running || !this.stands?.length) return;
            const mc = [];
            for (const entry of this.stands) {
                if (!entry.stand?.isDead?.()) mc.push(entry.stand.toMC());
            }
            if (mc.length) Render3D.drawHitboxes(mc, TRAP_BOX_COLOR, 5, false);
        });

        registerSkyblockEvent('plotteleport', () => {
            if (this.running && this.state === STATES.TELEPORTING) this.plotArrived = true;
        });
    }

    readTab() {
        let placed = 0;
        let fullIds = [];
        for (const line of getTabListNames()) {
            const text = stripTabFormatting(line?.getName?.() ?? line).trim();
            if (!text) continue;
            const placedMatch = text.match(PEST_TRAPS_RE);
            if (placedMatch) {
                placed = Number(placedMatch[1]);
                continue;
            }
            const fullMatch = text.match(FULL_TRAPS_RE);
            if (fullMatch) fullIds = this.parseTrapIds(fullMatch[1]);
        }
        return { placed, fullIds };
    }

    parseTrapIds(rest) {
        const text = String(rest ?? '').trim();
        if (!text || /^none$/i.test(text)) return [];
        return (text.match(/#(\d+)/g) || []).map((token) => Number(token.slice(1)));
    }

    plotFromSetting() {
        const input = String(rewarpSettings.getTrapPlot() ?? '').trim();
        const match = input.match(/^\s*(\d{1,2})\s*$/);
        return match ? Number(match[1]) : null;
    }

    start() {
        this.running = true;
        this.state = STATES.IDLE;
        this.pathToken = 0;
        this.standAttempts = 0;
        this.standIndex = 0;
        this.cleared = 0;
        this.clearedIds = new Set();
        this.plotArrived = false;

        const enabled = rewarpSettings.isPestTrapsEnabled();
        const plot = this.plotFromSetting();
        if (!enabled || plot === null) {
            this.running = false;
            return false;
        }
        const { fullIds } = this.readTab();
        console.log('[PestTraps] start:', JSON.stringify({ enabled, plot, fullIds }));
        if (!fullIds.length) {
            this.running = false;
            return false;
        }
        this.trapIds = [...fullIds].sort((a, b) => a - b);
        this.plot = plot;
        farmingSettings.selectVacuum();

        chat(`&fPest traps full (${this.trapIds.join(', ')}) - clearing.`);

        const { currentPlot } = getGardenPestStatus();
        if (currentPlot === this.plot) {
            this.transition(STATES.LANDING);
            return;
        }
        ChatLib.command(`tptoplot ${this.plot}`);
        this.transition(STATES.TELEPORTING, TELEPORT_TIMEOUT_MS);
    }

    tick(player) {
        if (!this.running) return true;
        switch (this.state) {
            case STATES.TELEPORTING:
                if (this.plotArrived) {
                    this.plotArrived = false;
                    return this.transition(STATES.LANDING);
                }
                if (Date.now() >= this.nextActionAt) return this.finish();
                if (player.getAbilities().flying) Client.setKey('shift', true);
                return false;
            case STATES.LANDING:
                if (player.getAbilities().flying) {
                    Client.setKey('shift', true);
                    return false;
                }
                Client.setKey('shift', false);
                this.scanDeadline = Date.now() + SCAN_GATHER_MS;
                return this.transition(STATES.SCANNING);
            case STATES.SCANNING:
                return this.beginScan();
            case STATES.APPROACHING:
                if (Date.now() >= this.nextActionAt) this.failStand();
                return false;
            case STATES.AIMING:
                return this.tickAim();
            case STATES.OPENING:
                return this.tickOpen();
            case STATES.RELEASING:
                return this.tickRelease();
            case STATES.CLOSING:
                return this.tickClose();
            case STATES.WAITING_DEATH:
                return this.tickWaitDeath();
        }
        return false;
    }

    beginScan() {
        this.stands = this.findTrapStands();
        if (!this.stands.length) {
            if (Date.now() < this.scanDeadline) return false;
            return this.finish();
        }
        this.standIndex = 0;
        this.standAttempts = 0;
        this.currentStand = this.stands[0];
        return this.beginApproach();
    }

    findTrapStands() {
        if (!this.trapIds?.length) return [];
        const all = World.getAllEntitiesOfType(ArmorStandEntity) || [];
        const result = [];
        for (const id of this.trapIds) {
            if (this.clearedIds?.has(id)) continue;
            const match = all.find((entity) => this.matchesStand(entity, id));
            if (match) result.push({ stand: match, id });
        }
        return result;
    }

    matchesStand(stand, id) {
        if (stand.isDead?.()) return false;
        const name = cleanText(stand.getName?.()).toLowerCase();
        if (!name.includes('trap')) return false;
        const match = name.match(/#\s*([1-3])\b/);
        return !!match && Number(match[1]) === id;
    }

    beginApproach() {
        farmingSettings.selectVacuum();
        const entry = this.currentStand;
        if (!entry) return this.failStand();
        if (entry.stand.distanceTo(Player.getPlayer()) < APPROACH_DISTANCE) return this.startAim(entry);

        this.transition(STATES.APPROACHING, APPROACH_TIMEOUT_MS);
        const token = ++this.pathToken;
        Pathfinder.resetPath(false);
        Pathfinder.findPath(
            this.standGoals(entry.stand),
            (success) => {
                if (!this.running || this.state !== STATES.APPROACHING || token !== this.pathToken) return;
                if (success) this.startAim(entry);
                else this.failStand();
            },
            true
        );
        return false;
    }

    standGoals(stand) {
        const x = Math.floor(stand.getX());
        const z = Math.floor(stand.getZ());
        const base = Math.floor(stand.getY());
        const goals = [];
        for (let y = base - 1; y <= base + 1; y++) goals.push([x, y, z]);
        return goals;
    }

    startAim(entry) {
        this.stopPath();
        this.transition(STATES.AIMING, AIM_TIMEOUT_MS);
        Rotations.lookAtVector(entry.stand, { precision: AIM_PRECISION });
        return false;
    }

    tickAim() {
        const entry = this.currentStand;
        if (!entry) return this.failStand();
        if (Date.now() >= this.nextActionAt) return this.failStand();
        if (angleToPlayer(entry.stand).distance > AIM_PRECISION) return false;
        Rotations.stop();
        Client.unpressKeys();
        this.transition(STATES.OPENING);
        this.openDeadline = Date.now() + OPEN_TIMEOUT_MS;
        this.nextOpenClickAt = 0;
        this.openAttempts = 0;
        return false;
    }

    tickOpen() {
        if (Date.now() >= this.openDeadline) return this.failStand();
        if (Client.isInGui()) {
            if (!this.hasReleaseButton()) {
                closeInventory();
                return this.failStand();
            }
            return this.transition(STATES.RELEASING);
        }
        if (this.openAttempts >= OPEN_ATTEMPTS) return this.failStand();
        if (Date.now() < this.nextOpenClickAt) return false;
        this.nextOpenClickAt = Date.now() + 350;
        this.openAttempts++;
        Client.rightClick();
        return false;
    }

    hasReleaseButton() {
        const items = Player.getContainer()?.getItems?.();
        if (!items) return false;
        return items.some((item) => item && cleanText(item.getName?.()).toLowerCase().includes('release all pests'));
    }

    tickRelease() {
        if (!Client.isInGui()) return this.failStand();
        if (!clickItem('Release All Pests')) {
            closeInventory();
            return this.failStand();
        }
        this.cleared++;
        if (this.currentStand?.id !== undefined) this.clearedIds.add(this.currentStand.id);
        closeInventory();
        return this.transition(STATES.CLOSING);
    }

    tickClose() {
        if (Client.isInGui()) {
            closeInventory();
            return false;
        }
        farmingSettings.selectVacuum();
        return this.transition(STATES.WAITING_DEATH, RELEASE_WAIT_MS);
    }

    tickWaitDeath() {
        if (Date.now() >= this.nextActionAt) {
            Client.setKey('rightclick', false);
            return this.nextStand();
        }
        if (Client.isInGui()) {
            Client.setKey('rightclick', false);
            closeInventory();
            this.nextHoldAt = Date.now() + REOPEN_HOLD_COOLDOWN_MS;
            return false;
        }
        if (Date.now() < this.nextHoldAt) return false;
        Client.setKey('rightclick', true);
        return false;
    }

    nextStand() {
        this.standAttempts = 0;
        this.scanDeadline = Date.now() + SCAN_GATHER_MS;
        this.stands = this.findTrapStands();
        if (!this.stands.length) {
            if (Date.now() < this.scanDeadline) {
                this.state = STATES.SCANNING;
                return false;
            }
            return this.finish();
        }
        this.standIndex = 0;
        this.currentStand = this.stands[0];
        return this.beginApproach();
    }

    failStand() {
        this.stopPath();
        Rotations.stop();
        if (Client.isInGui()) closeInventory();
        else Client.unpressKeys();
        if (this.standAttempts < STAND_ATTEMPTS) {
            this.standAttempts++;
            return this.beginApproach();
        }
        this.standAttempts = 0;
        this.standIndex++;
        if (this.standIndex >= this.stands.length) return this.finish();
        this.currentStand = this.stands[this.standIndex];
        return this.beginApproach();
    }

    finish(silent = false) {
        this.running = false;
        this.state = STATES.IDLE;
        this.stopPath();
        Rotations.stop();
        if (Client.isInGui()) closeInventory();
        else Client.unpressKeys();
        if (!silent) {
            if (this.cleared > 0) chat(`&aCleared &b${this.cleared}/${this.trapIds?.length ?? 0}&a traps.`);
            else chat('&7Traps skipped - continuing.');
        }
        return true;
    }

    stopPath() {
        this.pathToken++;
        if (Pathfinder.isPathing()) Pathfinder.resetPath();
    }

    transition(state, delay = 0) {
        this.state = state;
        this.nextActionAt = Date.now() + delay;
        return false;
    }

    stop() {
        if (!this.running) return;
        this.finish(true);
    }
}

export const pestTraps = new PestTraps();