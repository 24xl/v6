import { scanner } from './scanner/DungeonScanner';
import { graph } from './graph/DungeonGraph';
import { starMobs } from '../esp/StarMobESP';
import { secrets } from '../secrets/Secrets';

register('tick', () => {
    scanner.tick();
});

register('renderWorld', (pticks) => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    if (starMobs?.renderStarMobs) starMobs.renderStarMobs(pticks);
});

register('renderWorld', () => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    graph?.renderDoors?.();
});

register('renderWorld', () => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    secrets?.renderSecrets?.();
});

register('worldUnload', () => {
    scanner.reset();
});

export const DungeonCore = {
    scanner,
    graph,
    getScanner: () => scanner,
    getGraph: () => graph,
    getStarMobs: () => starMobs,
    getSecrets: () => secrets,
};