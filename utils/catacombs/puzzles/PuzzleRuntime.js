// Connects the puzzle solvers to game events, like NoammAddons' PuzzleSolvers feature does.
// Every solver call goes through a guard, so one broken solver can never take down the others or the module load.

import { ClientboundPlayerPositionPacket } from '../../Packets';
import { chat } from '../../Chat';
import { DungeonEvents, scanner } from '../CatacombsCore';
import { getFloor, isInBoss, isInDungeon, onBossEnter } from '../DungeonLocation';
import { advanceClock, resetClock } from './PuzzleClock';
import { textOf } from './PuzzleUtils';
import { BlazeSolver } from './solvers/BlazeSolver';
import { BoulderSolver } from './solvers/BoulderSolver';
import { CreeperBeamSolver } from './solvers/CreeperBeamSolver';
import { IceFillSolver } from './solvers/IceFillSolver';
import { IcePathSolver } from './solvers/IcePathSolver';
import { LividSolver } from './solvers/LividSolver';
import { QuizSolver } from './solvers/QuizSolver';
import { TeleportMazeSolver } from './solvers/TeleportMazeSolver';
import { ThreeWeirdosSolver } from './solvers/ThreeWeirdosSolver';
import { TicTacToeSolver } from './solvers/TicTacToeSolver';
import { WaterBoardSolver } from './solvers/WaterBoardSolver';

const AddEntityPacket = net.minecraft.network.protocol.game.ClientboundAddEntityPacket;

export const SOLVERS = [
    BlazeSolver,
    BoulderSolver,
    CreeperBeamSolver,
    IceFillSolver,
    IcePathSolver,
    QuizSolver,
    TeleportMazeSolver,
    ThreeWeirdosSolver,
    TicTacToeSolver,
    WaterBoardSolver,
    LividSolver,
];

const errors = new Map();

function guarded(solver, hook, run) {
    try {
        run();
    } catch (error) {
        const key = solver.name + '.' + hook;
        const entry = errors.get(key);
        if (entry !== undefined) {
            entry.count++;
            return;
        }
        errors.set(key, { count: 1, message: String(error) });
        console.error('[Puzzles] ' + key + ' failed: ' + error + (error && error.stack ? '\n' + error.stack : ''));
        chat('&c' + solver.name + ' solver hit an error (' + hook + '). Details are in the console; the other solvers keep running.');
    }
}

function dispatch(hook, ...args) {
    if (!isInDungeon()) return;
    for (const solver of SOLVERS) {
        if (!solver.enabled()) continue;
        if (typeof solver[hook] !== 'function') continue;
        guarded(solver, hook, () => solver[hook](...args));
    }
}

function dispatchTo(solver, hook, ...args) {
    if (!isInDungeon() || !solver.enabled()) return;
    guarded(solver, hook, () => solver[hook](...args));
}

function resetAll(keepLivid) {
    for (const solver of SOLVERS) {
        if (keepLivid && solver === LividSolver) continue;
        guarded(solver, 'reset', () => solver.reset());
    }
}

DungeonEvents.on('roomEnter', (event) => {
    if (isInBoss()) return;
    dispatch('onRoomEnter', event.room);
});

DungeonEvents.on('roomExit', (event) => {
    dispatch('onRoomExit', event.room);
});

register('tick', () => {
    if (isInDungeon()) advanceClock();
    dispatch('onTick');
});

register('chat', (event) => {
    dispatch('onChat', textOf(event));
});

register('postRenderWorld', () => {
    dispatch('onRender');
});

register('playerInteract', (action, pos, event) => {
    if (!isInDungeon()) return;
    if (!String(action).includes('UseBlock')) return;
    const clicked = { x: pos.x, y: pos.y, z: pos.z };
    dispatch('onInteract', clicked, () => cancel(event));
});

register('packetReceived', (packet) => dispatchTo(TeleportMazeSolver, 'onPacket', packet)).setFilteredClasses([ClientboundPlayerPositionPacket]);
register('packetReceived', (packet) => dispatchTo(TicTacToeSolver, 'onPacket', packet)).setFilteredClasses([AddEntityPacket]);

onBossEnter(() => resetAll(true));

register('worldUnload', () => {
    resetAll(false);
    resetClock();
});

// Text for the /legit status command.
export function describeStatus() {
    const room = scanner.currentRoom;
    const lines = [
        'inDungeon=' + isInDungeon() + '  floor=' + getFloor() + '  boss=' + isInBoss(),
        'room=' + (room ? room.name : 'none') + '  rotation=' + (room ? room.rotation : '-') + '  scanned=' + scanner.hasScanned + '  rooms=' + scanner.uniqueRooms.size,
    ];
    for (const solver of SOLVERS) lines.push(solver.name + ': ' + (solver.enabled() ? 'ON' : 'off'));
    errors.forEach((entry, key) => lines.push('ERROR ' + key + ' x' + entry.count + ': ' + entry.message));
    return lines;
}
