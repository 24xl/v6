import { DungeonEvents } from './DungeonEvents';
import { location } from './DungeonLocation';
import scanner, { DoorTile, RoomTile, UniqueRoom, UnknownTile, getRoomFromPos } from './scanner/DungeonScanner';
import graph from './graph/DungeonGraph';
import * as ScanUtils from './scan/DungeonScanUtils';
import * as DoorKeys from './keys/DoorKeys';

register('tick', () => {
    scanner.tick();
});

register('worldUnload', () => {
    scanner.reset();
});

register('worldLoad', () => {
    scanner.reset();
});

export const DungeonCore = {
    location,
    events: DungeonEvents,
    scanner,
    graph,
    keys: DoorKeys,
    utils: ScanUtils,
    RoomType: ScanUtils.RoomType,
    DoorType: ScanUtils.DoorType,
    RoomState: ScanUtils.RoomState,
    SecretType: ScanUtils.SecretType,
    DoorTile,
    RoomTile,
    UniqueRoom,
    UnknownTile,
    getRoomFromPos,
    getScanner: () => scanner,
    getGraph: () => graph,
};

export { scanner, graph, location, DungeonEvents, DoorTile, RoomTile, UniqueRoom, UnknownTile, getRoomFromPos };
export default DungeonCore;
