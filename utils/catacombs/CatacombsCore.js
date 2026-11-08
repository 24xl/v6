import { DungeonEvents } from './DungeonEvents';
import { location } from './DungeonLocation';
import scanner, { DoorTile, RoomTile, UniqueRoom, UnknownTile, getRoomFromPos } from './scanner/DungeonScanner';
import graph from './graph/DungeonGraph';
import {
    DoorType,
    RoomState,
    RoomType,
    SecretType,
    coord,
    getAllRoomData,
    getBlockNameAt,
    getCore,
    getHighestY,
    getRealCoord,
    getRelativeCoord,
    getRoomCount,
    getRoomData,
    getRoomDataByName,
    getRoomGraf,
    isChunkLoaded,
    javaStringHash,
    rotate,
} from './scan/DungeonScanUtils';
import { getBloodKeys, getWitherKeys, hasBloodKey, hasWitherKey } from './keys/DoorKeys';

const ScanUtils = {
    coord,
    getAllRoomData,
    getBlockNameAt,
    getCore,
    getHighestY,
    getRealCoord,
    getRelativeCoord,
    getRoomCount,
    getRoomData,
    getRoomDataByName,
    getRoomGraf,
    isChunkLoaded,
    javaStringHash,
    rotate,
};
const DoorKeys = { getBloodKeys, getWitherKeys, hasBloodKey, hasWitherKey };

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
    RoomType,
    DoorType,
    RoomState,
    SecretType,
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
