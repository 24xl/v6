// Door ESP: Highlights doors in dungeons with key states, room names, and secrets.

import { DoorESPConfig, isDoorESPEnabled } from './DoorESPConfig';
import { isInDungeon, isInBoss } from '../DungeonLocation';
import { DungeonScanner } from '../scanner/DungeonScanner';
import { ScanUtils } from '../scan/DungeonScanUtils';
import { DungeonTree } from '../scan/DungeonTree';

const MODE_NAMES = ['Outline', 'Fill', 'Filled Outline'];

function shouldRenderDoors() {
    return isDoorESPEnabled() && isInDungeon() && !isInBoss();
}

function getDoorColor(tile) {
    if (tile.type === 'BLOOD' || tile.type === 'WITHER') {
        return tile.keys > 0 ? DoorESPConfig.hasKeyColor : DoorESPConfig.noKeyColor;
    }
    return DoorESPConfig.normalColor;
}

function shouldRenderBloodDoor(tile, currentRoom, hideUndiscovered, isFairy) {
    if (!DoorESPConfig.bloodRush) return false;
    if (hideUndiscovered && tile.state === 'UNDISCOVERED' && !isFairy) return false;
    if (DoorESPConfig.highlightAll && DungeonScanner.dungeonStarted) return true;
    return tile.state !== 'UNDISCOVERED' || isFairy;
}

function shouldRenderNormalDoor(tile, currentRoom, hideUndiscovered, isFairy) {
    if (!DoorESPConfig.normalDoors || !currentRoom) return false;
    if (hideUndiscovered && tile.state === 'UNDISCOVERED' && !isFairy) return false;
    const rooms = tile.roomTiles.map(t => t.uniqueRoom).filter(Boolean);
    if (!rooms.includes(currentRoom)) return false;
    if (tile.type === 'BLOOD' || tile.type === 'WITHER') return false;
    return true;
}

function shouldShowText(tile, currentRoom) {
    if (!DoorESPConfig.roomName && !DoorESPConfig.roomSecrets) return false;
    const rooms = tile.roomTiles.map(t => t.uniqueRoom).filter(Boolean);
    return rooms.find(r => r !== currentRoom);
}

register('postRenderWorld', (ctx) => {
    if (!shouldRenderDoors()) return;
    if (!DungeonScanner.initialized) return;

    const currentRoom = ScanUtils.currentRoom;
    if (!DoorESPConfig.bloodRush && !currentRoom) return;

    const hideUndiscovered = ScanUtils.dungeonMapEnabled && !ScanUtils.dungeonMapCheater;
    const isFairy = ScanUtils.currentRoom?.name === 'Fairy';

    const drawFill = DoorESPConfig.mode === 1 || DoorESPConfig.mode === 2;
    const drawOutline = DoorESPConfig.mode === 0 || DoorESPConfig.mode === 2;

    for (const tile of DungeonScanner.doorTiles) {
        if (tile.type === 'ENTRANCE') continue;
        const isFairyDoor = isFairy && DungeonTree.isFairy(tile);

        // Blood/Wither doors
        if (!tile.opened && (tile.type === 'BLOOD' || tile.type === 'WITHER')) {
            if (!shouldRenderBloodDoor(tile, currentRoom, hideUndiscovered, isFairyDoor)) continue;

            ctx.renderBoxBounds(
                tile.aabb,
                getDoorColor(tile),
                DoorESPConfig.mode === 0 || DoorESPConfig.mode === 2,
                DoorESPConfig.mode === 1 || DoorESPConfig.mode === 2,
                DoorESPConfig.phase,
                DoorESPConfig.lineWidth
            );
            continue;
        }

        // Normal doors
        if (!shouldRenderNormalDoor(tile, currentRoom, hideUndiscovered, isFairyDoor)) continue;
        if (tile.type === 'BLOOD' || tile.type === 'WITHER') continue;

        ctx.renderBoxBounds(
            tile.aabb,
            DoorESPConfig.normalColor,
            drawOutline,
            drawFill,
            DoorESPConfig.phase,
            DoorESPConfig.lineWidth
        );

        // Room name/secrets text
        const nextRoom = shouldShowText(tile, currentRoom);
        if (!nextRoom) continue;

        let textLines = [];
        let maxWidth = 0;

        if (DoorESPConfig.roomName) {
            const color = nextRoom.state === 'GREEN' ? '§a' : nextRoom.state === 'FAILED' ? '§c' : '§f';
            const line = color + nextRoom.name;
            textLines.push(line);
            maxWidth = Math.max(maxWidth, line.length);
        }
        if (DoorESPConfig.roomSecrets && nextRoom.secrets > 0) {
            const color = nextRoom.foundSecrets / nextRoom.secrets > 0.5 ? '§a' : '§c';
            const line = `${color}${nextRoom.foundSecrets}§f/§a${nextRoom.secrets}`;
            textLines.push(line);
            maxWidth = Math.max(maxWidth, line.length);
        }

        if (textLines.length === 0) continue;

        const scale = Math.min(2, 2.8 / (maxWidth * 0.025));
        const textPhase = DoorESPConfig.phase && (hideUndiscovered ? false : true);

        ctx.renderString(textLines.join('\n'), tile.aabb.center, scale, textPhase);
    }
});