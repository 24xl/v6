import scanner from './scanner/DungeonScanner';
import graph from './graph/DungeonGraph';
import starMobs from './esp/StarMobESP';
import doorESP from './esp/DoorESP';
import secretsAPI from './secrets/Secrets';

register('tick', () => {
    scanner.tick();
});

register('renderWorld', (pticks) => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    if (starMobs?.renderStarMobs) starMobs.renderStarMobs(pticks);
});

register('renderWorld', () => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    doorESP.renderDoors?.();
});

register('renderWorld', () => {
    if (!scanner.isInDungeon() || scanner.isInBoss()) return;

    secretsAPI.renderSecrets?.();
});

register('worldUnload', () => {
    scanner.reset();
});

const DungeonCore = {
    scanner,
    graph,
    starMobs,
    doorESP,
    secretsAPI,
    getScanner: () => scanner,
    getGraph: () => graph,
    getStarMobs: () => starMobs,
    getDoorESP: () => doorESP,
    getSecrets: () => secretsAPI,
};

module.exports = DungeonCore;