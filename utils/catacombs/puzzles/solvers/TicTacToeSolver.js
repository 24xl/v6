// Tic Tac Toe puzzle. Ported from NoammAddons' TicTacToeSolver.kt.
// Reads the board from the map item frames, finds the best moves with minimax and highlights the buttons.

import { DataComponents } from '../../../Constants';
import { puzzleSettings, rgba } from '../PuzzleSettings';
import { drawBox } from '../PuzzleRender';
import { samePos } from '../PuzzleUtils';
import { isInBoss } from '../../DungeonLocation';
import { getBlockNameAt } from '../../scan/DungeonScanUtils';

const ItemFrameClass = net.minecraft.world.entity.decoration.ItemFrame;
const PhysBox = net.minecraft.world.phys.AABB;
const EntityTypeClass = net.minecraft.world.entity.EntityType;

export const UNPLAYED = '';
const WIN_SETS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [6, 4, 2],
];

export function isWon(board) {
    for (const set of WIN_SETS) {
        if (board[set[0]] !== UNPLAYED && board[set[0]] === board[set[1]] && board[set[0]] === board[set[2]]) return true;
    }
    return false;
}

const availableMoves = (board) => {
    const moves = [];
    for (let i = 0; i < board.length; i++) if (board[i] === UNPLAYED) moves.push(i);
    return moves;
};

function minimax(board, ai, opp, maximizing, depth) {
    const won = isWon(board);
    const moves = availableMoves(board);

    if (won || moves.length === 0) {
        if (won) return !maximizing ? 1 / depth : -1 / depth;
        return 0;
    }

    if (maximizing) {
        let result = -Infinity;
        for (const move of moves) {
            const sim = board.slice();
            sim[move] = ai;
            result = Math.max(result, minimax(sim, ai, opp, false, depth + 1));
        }
        return result;
    }

    let result = Infinity;
    for (const move of moves) {
        const sim = board.slice();
        sim[move] = opp;
        result = Math.min(result, minimax(sim, ai, opp, true, depth + 1));
    }
    return result;
}

// Player = 'O' (maximiser), AI = 'X' (minimiser). Returns every move that ties for the best score.
export function findBestMoves(board, player, opponent) {
    const moves = availableMoves(board);
    if (moves.length === 0) return [];

    const scores = [];
    let bestScore = -Infinity;
    for (const move of moves) {
        const sim = board.slice();
        sim[move] = player;
        const score = minimax(sim, player, opponent, false, 1);
        scores.push({ move, score });
        if (score > bestScore) bestScore = score;
    }
    return scores.filter((entry) => entry.score >= bestScore - 0.0001).map((entry) => entry.move);
}

export const newBoard = () => {
    const board = [];
    for (let i = 0; i < 9; i++) board.push(UNPLAYED);
    return board;
};

export function indexToPos(index, leftmostRow, facing, sign) {
    const row = index % 3;
    const col = Math.floor(index / 3);
    return {
        x: facing === 'X' ? leftmostRow.x - sign * row : leftmostRow.x,
        y: 72 - col,
        z: facing === 'Z' ? leftmostRow.z - sign * row : leftmostRow.z,
    };
}

// The button's flat face, by room rotation (fill only, like Noam's renderBoxBounds with outline = false).
export function buttonBounds(pos, rotation) {
    const halfWidth = 0.2;
    const halfHeight = 0.13;
    const thickness = 0.2;
    const minY = pos.y + 0.5 - halfHeight;
    const maxY = pos.y + 0.5 + halfHeight;

    switch (rotation) {
        case 0:
            return { minX: pos.x, maxX: pos.x + thickness, minY, maxY, minZ: pos.z + 0.5 - halfWidth, maxZ: pos.z + 0.5 + halfWidth };
        case 90:
            return { minX: pos.x + 0.5 - halfWidth, maxX: pos.x + 0.5 + halfWidth, minY, maxY, minZ: pos.z, maxZ: pos.z + thickness };
        case 180:
            return { minX: pos.x + 1 - thickness, maxX: pos.x + 1, minY, maxY, minZ: pos.z + 0.5 - halfWidth, maxZ: pos.z + 0.5 + halfWidth };
        case 270:
            return { minX: pos.x + 0.5 - halfWidth, maxX: pos.x + 0.5 + halfWidth, minY, maxY, minZ: pos.z + 1 - thickness, maxZ: pos.z + 1 };
        default:
            return null;
    }
}

const RED = rgba(255, 0, 0);

export const TicTacToeSolver = {
    name: 'Tic Tac Toe',
    enabled: () => puzzleSettings.ttt,

    inRoom: false,
    center: null,
    rotation: null,
    bestMoves: [],
    badMoves: [],
    prefireMoves: [],

    onRoomEnter(room) {
        if (room.name !== 'Tic Tac Toe') return;
        this.inRoom = true;
        this.center = room.centerPos;
        this.rotation = room.rotation;
        this.scheduleSolve();
    },

    onRoomExit() {
        this.reset();
    },

    // A new item frame appearing means a move was played (Noam listens for ClientboundAddEntityPacket).
    onPacket(packet) {
        if (!this.inRoom) return;
        if (!EntityTypeClass.ITEM_FRAME.equals(packet.getType())) return;
        this.scheduleSolve();
    },

    scheduleSolve() {
        Client.scheduleTask(3, () => this.solve());
    },

    // Reads the board from the game. Anything that is not a plain number comes straight from Minecraft.
    solve() {
        if (this.center === null) return;
        const center = this.center;
        const level = World.getWorld();
        const area = new PhysBox(center.x - 9, 65, center.z - 9, center.x + 9, 73, center.z + 9);

        const frames = [];
        const list = level.getEntitiesOfClass(ItemFrameClass, area);
        for (let i = 0; i < list.size(); i++) {
            const frame = list.get(i);
            const stack = frame.getItem();
            if (stack.get(DataComponents.MAP_ID) !== null && stack.get(DataComponents.MAP_ID) !== undefined) frames.push(frame);
        }

        if (frames.length === 8) {
            this.reset();
            return;
        }
        if (frames.length % 2 === 0) return;

        const board = newBoard();
        let leftmostRow = null;
        let facing = 'X';
        let sign = 1;

        for (const frame of frames) {
            const mapId = frame.getItem().get(DataComponents.MAP_ID);
            const mapData = level.getMapData(mapId);
            if (mapData === null || mapData === undefined) continue;

            const direction = String(frame.getDirection().getName());
            sign = direction === 'south' || direction === 'west' ? -1 : 1;

            const fx = Number(frame.getX());
            const fy = Number(frame.getY());
            const fz = Number(frame.getZ());
            const baseX = Math.floor(fx);
            const baseY = Math.floor(fy);
            const baseZ = Math.floor(fz);

            let row = 0;
            for (let i = 2; i >= 0; i--) {
                const realI = i * sign;
                let blockX = baseX;
                let blockZ = baseZ;
                if (fx % 0.5 === 0) {
                    blockX = baseX + realI;
                } else {
                    facing = 'Z';
                    blockZ = baseZ + realI;
                }

                const name = getBlockNameAt(blockX, baseY, blockZ);
                if (name === 'minecraft:stone_button' || name === 'minecraft:air') {
                    leftmostRow = { x: blockX, y: baseY, z: blockZ };
                    row = i;
                    break;
                }
            }

            const column = 72 - Math.trunc(fy);
            if (column < 0 || column > 2) continue;

            const byteColor = Number(mapData.colors[8256]) & 0xff;
            const index = column * 3 + row;
            if (byteColor === 114) board[index] = 'X';
            else if (byteColor === 33) board[index] = 'O';
        }

        if (leftmostRow === null) return;
        this.applyBoard(board, leftmostRow, facing, sign);
    },

    // Pure: turn a board into highlighted button positions.
    applyBoard(board, leftmostRow, facing, sign) {
        this.bestMoves = [];
        this.badMoves = [];
        this.prefireMoves = [];

        const playerBest = findBestMoves(board, 'O', 'X');
        for (const index of playerBest) this.bestMoves.push(indexToPos(index, leftmostRow, facing, sign));

        if (puzzleSettings.prediction && playerBest.length > 0) {
            const simBoard = board.slice();
            simBoard[playerBest[0]] = 'O';

            for (const aiIndex of findBestMoves(simBoard, 'X', 'O')) {
                this.badMoves.push(indexToPos(aiIndex, leftmostRow, facing, sign));

                const prefireBoard = simBoard.slice();
                prefireBoard[aiIndex] = 'X';
                if (!isWon(prefireBoard)) {
                    for (const preIndex of findBestMoves(prefireBoard, 'O', 'X')) {
                        const pos = indexToPos(preIndex, leftmostRow, facing, sign);
                        if (!this.prefireMoves.some((existing) => samePos(existing, pos))) this.prefireMoves.push(pos);
                    }
                }
            }
        }

        if (this.prefireMoves.length === 7) this.prefireMoves = [];
    },

    onInteract(pos, cancel) {
        if (!this.inRoom || !puzzleSettings.preventMissClick) return;
        if (isInBoss()) return;
        if (getBlockNameAt(pos.x, pos.y, pos.z) !== 'minecraft:stone_button') return;
        if (!this.bestMoves.some((move) => samePos(move, pos))) cancel();
    },

    onRender() {
        if (!this.inRoom || this.rotation === null) return;

        const boxes = new Map();
        const put = (pos, color) => boxes.set(pos.x + ',' + pos.y + ',' + pos.z, { pos, color });

        for (const pos of this.bestMoves) put(pos, puzzleSettings.tttColor);
        if (puzzleSettings.prediction) {
            for (const pos of this.badMoves) put(pos, RED);
            for (const pos of this.prefireMoves) put(pos, puzzleSettings.predictionColor);
        }

        boxes.forEach((entry) => {
            if (getBlockNameAt(entry.pos.x, entry.pos.y, entry.pos.z) !== 'minecraft:stone_button') return;
            const b = buttonBounds(entry.pos, this.rotation);
            if (b !== null) drawBox(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, entry.color, false, false);
        });
    },

    reset() {
        this.inRoom = false;
        this.bestMoves = [];
        this.prefireMoves = [];
        this.badMoves = [];
        this.center = null;
        this.rotation = null;
    },
};
