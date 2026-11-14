// Reveal Mobs: Reveals invisible mobs in dungeons (Fels, Shadow Assassins, Stealthy mobs).

import { RevealMobsConfig, isRevealMobsEnabled } from './RevealMobsConfig';
import { isInDungeon } from '../DungeonLocation';
import { EndermanEntity, PlayerEntity, GiantEntity, EquipmentSlot } from '../../Constants';
import { ClientboundSetEntityDataPacket } from '../../Packets';

const watcherMobs = new Set([
    'Watcher', 'Stealthy', // Add actual watcher mob names from DataDownloader
]);

function shouldRevealMobs() {
    return isRevealMobsEnabled() && isInDungeon();
}

register('packetReceived', (packet) => {
    if (!shouldRevealMobs()) return;
    if (!(packet instanceof ClientboundSetEntityDataPacket)) return;
    
    const entityId = packet.getEntityId ? packet.getEntityId() : packet.entityId();
    const world = World.toMC();
    if (!world) return;
    const entity = world.getEntity(entityId);
    if (!entity || !entity.isInvisible()) return;

    const name = entity.getCustomName?.()?.getString?.() ?? entity.getDisplayName?.()?.getString?.() ?? '';
    
    const isFel = entity instanceof EndermanEntity && RevealMobsConfig.showFels && name === 'Dinnerbone';
    const isSA = entity instanceof PlayerEntity && RevealMobsConfig.showShadowAssassins && name.includes('Shadow Assassin');
    const isStealthy = entity instanceof PlayerEntity && RevealMobsConfig.showStealthy && watcherMobs.has(name);
    const isGiant = entity instanceof GiantEntity && RevealMobsConfig.showStealthy && !entity.getItemBySlot?.(EquipmentSlot.FEET)?.isEmpty?.();

    if (isFel || isSA || isStealthy || isGiant) {
        entity.isInvisible = false;
    }
}).setFilteredClass(ClientboundSetEntityDataPacket);