import { scanner } from '../scanner/DungeonScanner';

export function getSecretsFound() {
    return scanner.secretCount;
}

export function getTotalSecrets() {
    return scanner.uniqueRooms ? [...scanner.uniqueRooms.values()].reduce((sum, r) => sum + (r.data.secrets || 0), 0) : 0;
}

export function getCrypts() {
    return scanner.cryptCount;
}

export function getWitherDoors() {
    return scanner.witherDoors;
}

export function getFloor() {
    const lines = Scoreboard.getLines?.() || [];
    for (const line of lines) {
        const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
        const m = text.match(/\(([FM])(\d)\)/i);
        if (m) return parseInt(m[2]);
    }
    return 0;
}

export function isPaul() {
    return getFloor() === 7;
}

export function getDeathPenalty() {
    const lines = Scoreboard.getLines?.() || [];
    for (const line of lines) {
        const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
        const m = text.match(/Team Deaths:\s*(\d+)/);
        if (m) {
            const deaths = parseInt(m[1]);
            return -deaths * 2;
        }
    }
    return 0;
}

export function getScore() {
    const lines = Scoreboard.getLines?.() || [];
    for (const line of lines) {
        const text = ChatLib.removeFormatting(String(line.getName?.() ?? line)).trim();
        const m = text.match(/Cleared:.*\((\d+)\)/);
        if (m) return parseInt(m[1]);
    }
    return 0;
}

export function isMimicKilled() {
    return scanner.mimicRoom?.hasMimic === false;
}

export function getMimicKilled() {
    return isMimicKilled();
}

export function getSecretsPercentNeeded() {
    return 0.5;
}

export function getMinSecrets() {
    const total = getTotalSecrets();
    const mimic = getMimicKilled() ? 2 : 0;
    const crypts = getCrypts();
    const deathPenalty = getDeathPenalty();
    const paul = isPaul() ? 10 : 0;

    const needed = Math.ceil(total * ((40 - paul - mimic - (crypts > 5 ? 5 : crypts) + deathPenalty) / 40));
    return needed;
}

register('worldUnload', () => {
    scanner.reset();
});