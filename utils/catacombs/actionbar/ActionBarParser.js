let currentSecrets = 0;
let maxSecrets = 0;

register('actionBar', (message) => {
    const text = ChatLib.removeFormatting(message);
    const match = text.match(/(\d+)\/(\d+)\s*Secrets?/i);
    if (match) {
        currentSecrets = parseInt(match[1]);
        maxSecrets = parseInt(match[2]);
    }
});

export function getSecrets() {
    return currentSecrets;
}

export function getMaxSecrets() {
    return maxSecrets;
}

export function getSecretsPercent() {
    if (maxSecrets === 0) return 0;
    return currentSecrets / maxSecrets;
}

register('worldUnload', () => {
    currentSecrets = 0;
    maxSecrets = 0;
});

register('chat', (msg) => {
    const text = ChatLib.removeFormatting(msg);
    if (text.includes('Secrets Found:') || text.includes('secret') || text.includes('Secret')) {
        const match = text.match(/(\d+)\/(\d+)/);
        if (match) {
            currentSecrets = parseInt(match[1]);
            maxSecrets = parseInt(match[2]);
        }
    }
}).setCriteria(/.*[Ss]ecret.*/);