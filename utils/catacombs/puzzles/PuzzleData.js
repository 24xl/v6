// Solution data for the puzzles that need it (assets/*.json). Loaded once, on first use.

const cache = {};

export function loadAsset(name) {
    if (cache[name] !== undefined) return cache[name];

    let parsed = null;
    try {
        const raw = FileLib.read('V5', 'assets/' + name);
        if (raw && raw.trim()) parsed = JSON.parse(raw);
        else console.error('[Puzzles] could not read V5/assets/' + name);
    } catch (error) {
        console.error('[Puzzles] failed to load ' + name + ': ' + error);
    }

    cache[name] = parsed;
    return parsed;
}
