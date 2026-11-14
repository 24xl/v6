// Teammate ESP: Highlights dungeon party members with class colors.

import { TeammateESPConfig, isTeammateESPEnabled } from './TeammateESPConfig';
import { isInDungeon, isInBoss } from '../DungeonLocation';
import { PlayerEntity } from '../../Constants';

const teammateCache = new Map();

function shouldRenderTeammates() {
    return isTeammateESPEnabled() && isInDungeon() && !isInBoss();
}

register('checkEntityGlow', (event) => {
    if (!shouldRenderTeammates()) return;
    if (!TeammateESPConfig.highlight) return;
    
    const entity = event.entity;
    if (!(entity instanceof PlayerEntity)) return;
    if (entity.getUUID?.()?.version?.() !== 4) return;

    // Check if entity is a dungeon teammate
    // This requires DungeonListener integration - for now skip
    // TODO: Integrate with DungeonListener.dungeonTeammates
});

register('postRenderWorld', (ctx) => {
    if (!shouldRenderTeammates()) return;
    if (!TeammateESPConfig.drawName) return;

    // Draw teammate names above heads
    // TODO: Integrate with DungeonListener.dungeonTeammatesNoSelf
    // for (const teammate of DungeonListener.dungeonTeammatesNoSelf) {
    //     const entity = teammate.entity;
    //     if (!entity) continue;
    //     // Draw name with class color
    // }
});

register('worldUnload', () => {
    // Clear caches
});