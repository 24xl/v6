import { Color } from '../../Constants';
import { Render3D, RenderColor } from '../../Constants';
import { scanner } from '../scanner/DungeonScanner';

const starMobs = new Map();
const checkedMobs = new Set();

const DEFAULT_COLOR = new RenderColor(255, 255, 0, 180);

register('packetReceived', (packet) => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;
    if (!packet.getEntityMetadata) return;

    const watcher = packet.getEntityMetadata();
    if (!watcher) return;

    const entity = World.getEntityById(packet.getEntityId?.());
    if (!entity) return;

    for (const entry of watcher) {
        if (entry.getType?.() !== 4) continue;
        const val = entry.getValue?.();
        if (!(val instanceof java.lang.String) || val.trim() === '') continue;

        const name = val.toString().replace(/§./g, '');
        if (name.endsWith('❤') && name.includes('✯')) {
            checkStarMob(entity, name);
        }
    }
}).setFilteredClass(net.minecraft.network.protocol.game.ClientboundSetEntityDataPacket);

function checkStarMob(armorStand, name) {
    if (checkedMobs.has(armorStand.getId())) return;
    checkedMobs.add(armorStand.getId());

    const clean = name.replace(/§./g, '').replace('✯ ', '').toUpperCase();
    let offset = 1;
    if (clean.includes('WITHERMANCER')) offset = 3;

    const id = armorStand.getId() - offset;
    const mob = World.getEntityById(id);
    if (mob && mob !== armorStand && !starMobs.has(id)) {
        starMobs.set(id, { entity: mob, height: 2, dy: 0 });
        return;
    }

    const possible = World.getEntitiesInAABB(armorStand.getBoundingBox().expand(0, -1, 0));
    for (const e of possible) {
        if (e === armorStand || starMobs.has(e.getId())) continue;
        if (e instanceof net.minecraft.world.entity.player.Player) {
            const localPlayer = Player.getPlayer();
            if (e.isInvisible() || e.getUUID().version() !== 2 || (localPlayer && e === localPlayer)) continue;
        }
        if (e instanceof net.minecraft.world.entity.boss.wither.WitherBoss) continue;
        if (e instanceof net.minecraft.world.entity.projectile.arrow.AbstractArrow) continue;
        starMobs.set(e.getId(), { entity: e, height: 1.8, dy: 0 });
        break;
    }
}

register('entityUnload', (entity) => {
    starMobs.delete(entity.getId());
    checkedMobs.delete(entity.getId());
});

register('worldUnload', () => {
    starMobs.clear();
    checkedMobs.clear();
});

let starMobColor = DEFAULT_COLOR;

export function setStarMobColor(r, g, b, a) {
    starMobColor = new RenderColor(r, g, b, a);
}

export function renderStarMobs(pticks) {
    if (starMobs.size === 0) return;
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    for (const [, mob] of starMobs) {
        const ex = mob.entity.getRenderX(pticks);
        const ey = mob.entity.getRenderY(pticks) - mob.dy;
        const ez = mob.entity.getRenderZ(pticks);
        const h = mob.height;

        const lines = makeBoxLines(ex, ey, ez, 0.6, h, 0.6);
        Render3D.drawLines(lines, starMobColor, 2, true);
    }
}

function makeBoxLines(x, y, z, w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const corners = [
        [x - hw, y, z - hd], [x + hw, y, z - hd],
        [x + hw, y, z - hd], [x + hw, y, z + hd],
        [x + hw, y, z + hd], [x - hw, y, z + hd],
        [x - hw, y, z + hd], [x - hw, y, z - hd],
        [x - hw, y + h, z - hd], [x + hw, y + h, z - hd],
        [x + hw, y + h, z - hd], [x + hw, y + h, z + hd],
        [x + hw, y + h, z + hd], [x - hw, y + h, z + hd],
        [x - hw, y + h, z + hd], [x - hw, y + h, z - hd],
        [x - hw, y, z - hd], [x - hw, y + h, z - hd],
        [x + hw, y, z - hd], [x + hw, y + h, z - hd],
        [x + hw, y, z + hd], [x + hw, y + h, z + hd],
        [x - hw, y, z + hd], [x - hw, y + h, z + hd],
    ];
    return corners.map(([x, y, z]) => new net.minecraft.world.phys.Vec3(x, y, z));
}

export function getStarMobs() {
    return starMobs;
}