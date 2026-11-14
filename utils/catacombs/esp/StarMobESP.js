// StarMob ESP: Highlights starred mobs in dungeons.
// Detects ArmorStands with star in name, Shadow Assassins, Lost Adventurers, etc.

import { StarMobESPConfig, isStarMobESPEnabled } from './StarMobESPConfig';
import { isInDungeon, isInBoss } from '../DungeonLocation';
import { ArmorStandEntity, PlayerEntity } from '../../Constants';
import { ClientboundSetEntityDataPacket } from '../../Packets';

const STAR_MOB_NAMES = new Set([
    'Shadow Assassin',
    'Lost Adventurer',
    'Diamond Guy',
    'King Midas',
]);

const BAT_HEALTHS = new Set([100, 200, 400, 800]);

const starMobs = new Set();
const checked = new Set();

function isStarredMob(entity) {
    if (entity instanceof ArmorStandEntity) {
        const name = entity.getCustomName?.()?.getString?.() ?? '';
        return name.includes('✯') && name.endsWith('§c❤');
    }
    if (entity instanceof PlayerEntity) {
        const name = entity.getDisplayName?.()?.getString?.() ?? '';
        return STAR_MOB_NAMES.has(name);
    }
    return false;
}

function getEntityColor(entity) {
    if (entity instanceof ArmorStandEntity) {
        const name = entity.getCustomName?.()?.getString?.() ?? '';
        if (name.includes('WITHERMANCER')) return StarMobESPConfig.felColor;
        return StarMobESPConfig.starColor;
    }
    return StarMobESPConfig.starColor;
}

function shouldRenderStarMobs() {
    return isStarMobESPEnabled() && isInDungeon() && !isInBoss();
}

register('worldUnload', () => {
    starMobs.clear();
    checked.clear();
});

register('packetReceived', (packet) => {
    if (!shouldRenderStarMobs()) return;
    if (!(packet instanceof ClientboundSetEntityDataPacket)) return;
    const entityId = packet.getEntityId ? packet.getEntityId() : packet.entityId();
    const world = World.toMC();
    if (!world) return;
    const entity = world.getEntity(entityId);
    if (!entity) return;

    if (entity instanceof ArmorStandEntity) {
        const name = entity.getCustomName?.()?.getString?.() ?? '';
        if (name.includes('✯') && name.endsWith('§c❤')) {
            checkStarMob(entity, name);
        }
    } else if (entity instanceof PlayerEntity) {
        const name = entity.getDisplayName?.()?.getString?.() ?? '';
        if (STAR_MOB_NAMES.has(name)) {
            starMobs.add(entity.getEntityId ? entity.getEntityId() : entity.getEntityId());
        }
    }
}).setFilteredClass(ClientboundSetEntityDataPacket);

function checkStarMob(armorStand, name) {
    const id = armorStand.getEntityId ? armorStand.getEntityId() : armorStand.getEntityId();
    if (checked.has(id)) return;
    checked.add(id);

    const unformatted = name.replace(/&[0-9a-fk-or]/gi, '').replace(/§[0-9a-fk-or]/gi, '').toUpperCase();
    const offset = unformatted.includes('WITHERMANCER') ? 3 : 1;
    const targetId = (armorStand.getEntityId ? armorStand.getEntityId() : armorStand.getEntityId()) - offset;

    const mob = armorStand.level?.()?.getEntity(targetId);
    if (mob && !(mob instanceof ArmorStandEntity) && !starMobs.has(targetId)) {
        starMobs.add(targetId);
        return;
    }

    // Search nearby entities
    const bb = armorStand.getBoundingBox().move(0, -1, 0);
    const entities = armorStand.level?.()?.getEntities(armorStand, bb, e => 
        !(e instanceof ArmorStandEntity) && !starMobs.has(e.getEntityId ? e.getEntityId() : e.getEntityId())
    ) ?? [];

    for (const entity of entities) {
        if (entity instanceof PlayerEntity) {
            if (!entity.isInvisible() && entity.getUUID?.()?.version?.() === 2 && entity !== Player.getPlayer()) {
                starMobs.add(entity.getEntityId ? entity.getEntityId() : entity.getEntityId());
                return;
            }
        } else if (entity.getMaxHealth && BAT_HEALTHS.has(entity.getMaxHealth())) {
            starMobs.add(entity.getEntityId ? entity.getEntityId() : entity.getEntityId());
            return;
        }
    }
}

register('entityUnload', (entity) => {
    if (!entity) return;
    const id = entity.getEntityId ? entity.getEntityId() : entity.getEntityId();
    starMobs.delete(id);
    checked.delete(id);
});

register('worldUnload', () => {
    starMobs.clear();
    checked.clear();
});

register('checkEntityGlow', (event) => {
    if (!StarMobESPConfig.enabled) return;
    if (!isInDungeon() || isInBoss()) return;

    const entity = event.entity;
    if (!entity) return;

    const entityId = entity.getEntityId ? entity.getEntityId() : entity.getEntityId();
    if (starMobs.has(entityId)) {
        event.color = getEntityColor(entity);
        return;
    }

    if (!StarMobESPConfig.highlightBats) return;
    if (!(entity instanceof PlayerEntity)) return; // Bat check needs proper class
    if (!BAT_HEALTHS.has(entity.getMaxHealth?.())) return;
    event.color = StarMobESPConfig.batColor;
});