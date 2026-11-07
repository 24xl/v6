import scanner from './scanner/DungeonScanner';
import graph from './graph/DungeonGraph';
import { DoorTile } from './scan/DungeonScanUtils';
import { ChatLib } from '../../utils/Chat';
import { register } from '../../utils/Utils';

register('command', (...args) => {
    const cmd = args[0]?.toLowerCase();
    
    switch (cmd) {
        case 'scan':
            if (!scanner.isInDungeon()) return ChatLib.chat('&cNot in dungeon');
            scanner.scan();
            ChatLib.chat('&aScan complete. Rooms: ' + scanner.uniqueRooms.size + ', Doors: ' + scanner.witherDoors);
            break;
            
        case 'rooms':
            if (!scanner.isInDungeon()) return ChatLib.chat('&cNot in dungeon');
            for (const [key, room] of scanner.uniqueRooms) {
                ChatLib.chat(`&b${key}&f: ${room.data.name} &7(${room.components.length} comps) &cSecrets: ${room.data.secrets || 0}`);
            }
            break;
            
        case 'doors':
            if (!scanner.isInDungeon()) return ChatLib.chat('&cNot in dungeon');
            let count = 0;
            for (const tile of scanner.dungeonList) {
                if (tile instanceof DoorTile) {
                    count++;
                    ChatLib.chat(`&bDoor &7${tile.x}, ${tile.z} &f${tile.doorType} &cOpened: ${tile.opened}`);
                }
            }
            ChatLib.chat('&aTotal doors: ' + count);
            break;
            
        case 'graph':
            if (!scanner.isInDungeon()) return ChatLib.chat('&cNot in dungeon');
            const path = graph.getBloodRush();
            ChatLib.chat('&aBlood rush path:');
            for (const room of path) {
                ChatLib.chat(`  &f${room.data.name} &7(${room.components.map(c => c.join(',')).join(';')})`);
            }
            if (graph.fairyRoom) {
                ChatLib.chat(`&dFairy room: ${graph.fairyRoom.data.name}`);
                ChatLib.chat(`&dBefore fairy: ${graph.roomBeforeFairy?.data.name}`);
                ChatLib.chat(`&dAfter fairy: ${graph.nextRoomAfterFairy?.data.name}`);
            }
            break;
            
        case 'mimic':
            if (!scanner.isInDungeon()) return ChatLib.chat('&cNot in dungeon');
            if (scanner.mimicRoom) {
                ChatLib.chat('&aMimic found in: ' + scanner.mimicRoom.data.name);
                ChatLib.chat('&aChests: ' + scanner.mimicRoom.trappedChestPositions.length);
            } else {
                ChatLib.chat('&cNo mimic found yet');
            }
            break;
            
        case 'reset':
            scanner.reset();
            ChatLib.chat('&aScanner reset');
            break;
            
        default:
            ChatLib.chat('&b/dungenscan <scan|rooms|doors|graph|mimic|reset>');
    }
}).setName('dungenscan');