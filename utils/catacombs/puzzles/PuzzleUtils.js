// Small helpers shared by the puzzle solvers.

import { getStateAt } from '../scan/DungeonScanUtils';

export const blockPos = (x, y, z) => ({ x, y, z });
export const samePos = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
export const posKey = (p) => p.x + ',' + p.y + ',' + p.z;

// Vec3 fields can be exposed as a field or as a method depending on the version.
export const num = (value) => (typeof value === 'function' ? Number(value()) : Number(value));
export const vx = (vec) => num(vec.x);
export const vy = (vec) => num(vec.y);
export const vz = (vec) => num(vec.z);

export const isAirAt = (x, y, z) => {
    const state = getStateAt(x, y, z);
    return state === null ? true : !!state.isAir();
};

export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);

// Minecraft's Direction.Plane.HORIZONTAL order: NORTH, EAST, SOUTH, WEST.
export const HORIZONTAL = [
    { name: 'NORTH', dx: 0, dz: -1 },
    { name: 'EAST', dx: 1, dz: 0 },
    { name: 'SOUTH', dx: 0, dz: 1 },
    { name: 'WEST', dx: -1, dz: 0 },
];

export const textOf = (event) => {
    const message = event?.message;
    return String(message?.getUnformattedText?.() ?? message?.unformattedText ?? '');
};

export const javaListToArray = (list) => {
    const out = [];
    if (list === null || list === undefined) return out;
    const size = Number(list.size());
    for (let i = 0; i < size; i++) out.push(list.get(i));
    return out;
};
