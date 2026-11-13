// Keeps the room scanner running. Anything that needs "which room am I in" imports this once.
import scanner from './scanner/DungeonScanner';
import { DungeonEvents } from './DungeonEvents';

register('tick', () => {
    scanner.tick();
});

register('worldUnload', () => {
    scanner.reset();
});

register('worldLoad', () => {
    scanner.reset();
});

export { scanner, DungeonEvents };
