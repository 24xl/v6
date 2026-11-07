import { chat } from '../Chat';
import { DungeonCore } from './CatacombsCore';

const { scanner, graph, location, DoorTile, utils } = DungeonCore;

const requireDungeon = () => {
    if (location.inDungeon) return true;
    chat('&cNot in a dungeon');
    return false;
};

register('command', (sub) => {
    switch (String(sub ?? '').toLowerCase()) {
        case 'scan':
            if (!requireDungeon()) return;
            scanner.scan();
            chat(`&aScan complete. Rooms: ${scanner.uniqueRooms.size}, wither doors: ${scanner.witherDoors}`);
            break;

        case 'rooms':
            if (!requireDungeon()) return;
            for (const [name, room] of scanner.uniqueRooms) {
                chat(`&b${name} &7(${room.tiles.length} tiles, rot ${room.rotation ?? '?'}) &cSecrets: ${room.data.secrets}`);
            }
            break;

        case 'doors': {
            if (!requireDungeon()) return;
            let count = 0;
            for (const tile of scanner.dungeonList) {
                if (!(tile instanceof DoorTile)) continue;
                count++;
                chat(`&bDoor &7${tile.x}, ${tile.z} &f${tile.type} &cOpened: ${tile.opened}`);
            }
            chat(`&aTotal doors: ${count}`);
            break;
        }

        case 'graph': {
            if (!requireDungeon()) return;
            const path = graph.getBloodRush();
            chat(path.length ? '&aBlood rush: &f' + path.map((room) => room.name).join(' > ') : '&cNo blood rush path yet');
            break;
        }

        case 'here': {
            if (!requireDungeon()) return;
            const room = scanner.currentRoom;
            if (!room) return chat('&cNot inside a known room');
            chat(`&aRoom: &f${room.name} &7rot ${room.rotation ?? '?'} corner ${room.clayPos ? room.clayPos.x + ',' + room.clayPos.z : '?'}`);
            break;
        }

        case 'status':
            chat(
                `&7inDungeon=${location.inDungeon} floor=${location.floor} boss=${location.inBoss} ` +
                    `rooms=${scanner.uniqueRooms.size} scanned=${scanner.hasScanned} jsonRooms=${utils.getRoomCount()}`
            );
            break;

        case 'reset':
            scanner.reset();
            chat('&aScanner reset');
            break;

        default:
            chat('&b/dungeonscan <status|scan|rooms|doors|graph|here|reset>');
    }
}).setName('dungeonscan');
