// Terminal ESP: Highlights terminal hitboxes in F7/M7.
// Detects ArmorStands named "Inactive Terminal" / "Terminal Active" in F7 Phase 3.

import { TerminalESPConfig, isTerminalESPEnabled } from './TerminalESPConfig';
import { isInDungeon, getF7Phase, getFloorNumber } from '../DungeonLocation';
import { ArmorStandEntity } from '../../Constants';
import {
    ClientboundSetEntityDataPacket,
    ServerboundInteractPacket,
    ServerboundAttackPacket,
} from '../../Packets';

const terminalPositions = [
    [ { x: 110, y: 113, z: 73 }, { x: 110, y: 119, z: 79 }, { x: 90, y: 112, z: 92 }, { x: 90, y: 122, z: 101 } ],
    [ { x: 68, y: 109, z: 122 }, { x: 59, y: 119, z: 123 }, { x: 47, y: 109, z: 122 }, { x: 39, y: 108, z: 142 }, { x: 40, y: 124, z: 123 } ],
    [ { x: -2, y: 109, z: 112 }, { x: -2, y: 119, z: 93 }, { x: 18, y: 123, z: 93 }, { x: -2, y: 109, z: 77 } ],
    [ { x: 41, y: 109, z: 30 }, { x: 44, y: 121, z: 30 }, { x: 67, y: 109, z: 30 }, { x: 72, y: 114, z: 47 } ],
];

const FLASH_ANIM_MS = 200;
const FLASH_HOLD_MS = 250;

const terminals = new Map();

function getTerminalSection(entity) {
    for (let section = 0; section < terminalPositions.length; section++) {
        for (const pos of terminalPositions[section]) {
            const dx = entity.getX() - pos.x;
            const dy = entity.getY() - pos.y;
            const dz = entity.getZ() - pos.z;
            if (dx * dx + dy * dy + dz * dz <= 2.25) return section + 1;
        }
    }
    return null;
}

function hitTerminal(entity) {
    const info = terminals.get(entity);
    if (info) info.lastHitTime = Date.now();
}

function shouldRenderTerminal() {
    return isTerminalESPEnabled() && isInDungeon() && getF7Phase() === 3;
}

function getCurrentSection() {
    return shouldRenderTerminal() ? terminalPositions.findIndex((_, i) => i === getFloorNumber() - 1) + 1 : null;
}

register('worldUnload', () => terminals.clear());

register('packetReceived', (packet) => {
    if (!shouldRenderTerminal()) return;
    const entityId = packet.getEntityId ? packet.getEntityId() : packet.entityId();
    const world = World.toMC();
    if (!world) return;
    const entity = world.getEntity(entityId);
    if (!(entity instanceof ArmorStandEntity)) return;

    const name = entity.getCustomName?.()?.getString?.() ?? '';
    if (name === 'Inactive Terminal') {
        const section = getTerminalSection(entity);
        if (section) terminals.set(entity, { section, lastHitTime: 0 });
    } else if (name === 'Terminal Active') {
        terminals.delete(entity);
    }
}).setFilteredClass(ClientboundSetEntityDataPacket);

register('packetSent', (packet) => {
    if (!TerminalESPConfig.flashOnHit) return;
    const entityId = packet.getEntityId ? packet.getEntityId() : packet.entityId();
    const world = World.toMC();
    if (!world) return;
    const entity = world.getEntity(entityId);
    if (entity instanceof ArmorStandEntity) hitTerminal(entity);
}).setFilteredClasses([ServerboundInteractPacket, ServerboundAttackPacket]);

function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const b = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | b;
}

register('postRenderWorld', (ctx) => {
    if (!shouldRenderTerminal()) return;
    const section = getCurrentSection();
    if (!section) return;

    const drawFill = TerminalESPConfig.mode === 1 || TerminalESPConfig.mode === 2;
    const drawOutline = TerminalESPConfig.mode === 0 || TerminalESPConfig.mode === 2;
    const now = Date.now();

    for (const [entity, info] of terminals) {
        if (info.section !== section) continue;

        let progress = 0;
        if (TerminalESPConfig.flashOnHit) {
            const elapsed = now - info.lastHitTime;
            if (elapsed < FLASH_HOLD_MS) {
                progress = Math.min(1, elapsed / FLASH_ANIM_MS);
            } else if (elapsed < FLASH_HOLD_MS + FLASH_ANIM_MS) {
                progress = Math.max(0, 1 - (elapsed - FLASH_HOLD_MS) / FLASH_ANIM_MS);
            }
        }

        const outline = progress > 0 ? lerpColor(TerminalESPConfig.outlineColor, TerminalESPConfig.flashColor, progress) : TerminalESPConfig.outlineColor;
        const fill = progress > 0 ? lerpColor(TerminalESPConfig.fillColor, TerminalESPConfig.flashColor, progress) : TerminalESPConfig.fillColor;

        const bb = entity.getBoundingBox();
        ctx.renderBoxBounds(
            bb,
            outline,
            fill,
            TerminalESPConfig.mode === 0 || TerminalESPConfig.mode === 2,
            TerminalESPConfig.mode === 1 || TerminalESPConfig.mode === 2,
            TerminalESPConfig.phase,
            TerminalESPConfig.lineWidth
        );
    }
});