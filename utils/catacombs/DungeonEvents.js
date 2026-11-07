const listeners = new Map();

export function on(name, callback) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name)?.delete(callback);
}

export function emit(name, payload) {
    const set = listeners.get(name);
    if (!set) return;
    for (const callback of Array.from(set)) {
        try {
            callback(payload);
        } catch (error) {
            console.error('[Catacombs] listener for "' + name + '" threw: ' + error + (error?.stack ? '\n' + error.stack : ''));
        }
    }
}

export const DungeonEvents = {
    TILE_SCANNED: 'tileScanned',
    ROOM_ENTER: 'roomEnter',
    ROOM_EXIT: 'roomExit',
    ROOM_STATE_CHANGE: 'roomStateChange',
    ROTATION_FOUND: 'rotationFound',
    DUNGEON_START: 'dungeonStart',
    BOSS_ENTER: 'bossEnter',
    RESET: 'reset',
    on,
    emit,
};
