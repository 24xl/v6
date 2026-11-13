// F5 Livid boss. Ported from NoammAddons' LividSolver.kt.
// The real Livid is the one matching the wool colour on the ceiling. Not tied to a room: it runs in the F5 boss room.
// Not ported: "Hide Wrong" (needs entity-render cancelling), the on-screen invulnerability HUD and the ice-spray sound.

import { lividSettings } from '../PuzzleSettings';
import { drawEntityBox, drawText, drawTracer } from '../PuzzleRender';
import { chat } from '../../../Chat';
import { getFloorNumber, isInBoss } from '../../DungeonLocation';
import { getBlockNameAt } from '../../scan/DungeonScanUtils';

export const LIVID_BY_WOOL = {
    'minecraft:green_wool': 'Frog Livid',
    'minecraft:purple_wool': 'Purple Livid',
    'minecraft:gray_wool': 'Doctor Livid',
    'minecraft:blue_wool': 'Scream Livid',
    'minecraft:lime_wool': 'Smile Livid',
    'minecraft:red_wool': 'Hockey Livid',
    'minecraft:magenta_wool': 'Crossed Livid',
    'minecraft:yellow_wool': 'Arcade Livid',
    'minecraft:white_wool': 'Vendetta Livid',
};

const WELCOME = "[BOSS] Livid: Welcome, you've arrived right on time. I am Livid, the Master of Shadows.";
const INVULNERABLE_TICKS = 340;
const SUFFIXES = [
    [1000000000000000000, 'e'],
    [1000000000000000, 'p'],
    [1000000000000, 't'],
    [1000000000, 'b'],
    [1000000, 'm'],
    [1000, 'k'],
];

// NumbersUtils.format: 1234 -> "1.2k", 3200000 -> "3.2m", 100000 -> "100k".
export function formatNumber(input) {
    let value = Math.trunc(input);
    if (value < 0) return '-' + formatNumber(-value);
    if (value < 1000) return String(value);

    for (const entry of SUFFIXES) {
        if (value >= entry[0]) {
            const truncated = Math.trunc(value / (entry[0] / 10));
            const hasDecimal = truncated < 100 && truncated / 10 !== Math.trunc(truncated / 10);
            return (hasDecimal ? String(truncated / 10) : String(Math.trunc(truncated / 10))) + entry[1];
        }
    }
    return String(value);
}

// ColorUtils.colorCodeByPercent (non-reversed): green > 75%, yellow > 50%, orange > 25%, red below.
export function healthColor(value, max) {
    const top = Math.max(max, 1);
    const current = Math.max(0, Math.min(value, top));
    const pct = (current / top) * 100;
    if (pct > 75) return '&a';
    if (pct > 50) return '&e';
    if (pct > 25) return '&6';
    return '&c';
}

// GameProfile exposes its name as name() in newer authlib versions and getName() in older ones.
function profileName(player) {
    const profile = player.getGameProfile();
    return String(typeof profile.name === 'function' ? profile.name() : profile.getName());
}

export const LividSolver = {
    name: 'Livid',
    enabled: () => lividSettings.enabled,

    livid: null,
    timer: -1,

    onChat(text) {
        if (!lividSettings.invulnerabilityTimer) return;
        if (getFloorNumber() !== 5) return;
        if (text !== WELCOME) return;
        this.timer = INVULNERABLE_TICKS;
    },

    onTick() {
        if (this.timer > 0) this.timer--;
        if (this.timer === 0) {
            if (lividSettings.iceSprayTitle) this.showTitle();
            this.timer = -1;
        }

        if (!isInBoss() || getFloorNumber() !== 5) return;
        const target = LIVID_BY_WOOL[getBlockNameAt(5, 108, 40)];
        if (target === undefined) return;

        const current = this.livid;
        if (current !== null && profileName(current) === target && current.isRemoved()) return;

        let found = null;
        for (const entity of World.getAllEntities()) {
            if (String(entity.getName()) !== target) continue;
            const mc = entity.toMC();
            if (typeof mc.getGameProfile !== 'function') continue;
            found = mc;
            break;
        }
        this.livid = found;
    },

    showTitle() {
        try {
            Client.showTitle(ChatLib.addColor('&bIce Spray Livid!'), '', 5, 40, 5);
        } catch (error) {
            chat('&bIce Spray Livid!');
        }
    },

    onRender() {
        const livid = this.livid;
        if (livid === null || livid.isDeadOrDying()) return;

        const x = Number(livid.getX());
        const y = Number(livid.getY());
        const z = Number(livid.getZ());

        drawEntityBox(livid, lividSettings.highlightColor, 2, true);
        if (lividSettings.tracer) drawTracer(x, y + 0.9, z, lividSettings.tracerColor);
        if (lividSettings.showHp) {
            const health = Number(livid.getHealth());
            drawText(healthColor(health, Number(livid.getMaxHealth())) + formatNumber(health), x, y + 3.0, z, 1.5);
        }
    },

    reset() {
        this.livid = null;
        this.timer = -1;
    },
};
