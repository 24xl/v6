// Drawing helpers for the puzzle solvers. Everything goes through V5's own Render3D calls
// (the same ones BlockVisual, ESP, CombatBot and the path walkers use).
// "phase = true" means visible through walls, which is Render3D's depth = false.
// Defaults mirror NoammAddons' Render3D helpers: boxes and lines are depth-tested unless told otherwise.

import { Vec3d } from '../../Constants';

const PhysBox = net.minecraft.world.phys.AABB;

const colorCache = new Map();

export const toRenderColor = (c, alpha) => {
    const a = alpha === undefined ? c.a : alpha;
    const key = c.r + ',' + c.g + ',' + c.b + ',' + a;
    let color = colorCache.get(key);
    if (color === undefined) {
        color = new RenderColor(c.r, c.g, c.b, a);
        colorCache.set(key, color);
    }
    return color;
};

export const vec = (x, y, z) => new Vec3d(x, y, z);

export function drawBox(minX, minY, minZ, maxX, maxY, maxZ, color, phase = false, outline = true) {
    const box = new PhysBox(minX, minY, minZ, maxX, maxY, maxZ);
    Render3D.drawFilledBox(box, toRenderColor(color), !phase);
    if (outline) Render3D.drawWireFrameBox(box, toRenderColor(color, 255), 2, !phase);
}

export const drawBlock = (x, y, z, color, phase = false) => drawBox(x, y, z, x + 1, y + 1, z + 1, color, phase);

export const drawLine = (ax, ay, az, bx, by, bz, color, thickness = 2, phase = false) =>
    Render3D.drawLine(vec(ax, ay, az), vec(bx, by, bz), toRenderColor(color), thickness, !phase);

export const drawTracer = (x, y, z, color, thickness = 2, phase = true) => Render3D.drawTracer(vec(x, y, z), toRenderColor(color), thickness, !phase);

export const drawText = (text, x, y, z, scale = 1, phase = false) => Render3D.drawText(ChatLib.addColor(text), vec(x, y, z), scale, true, false, phase);

export const drawEntityBox = (mcEntity, color, thickness = 2, phase = true) => Render3D.drawHitboxes([mcEntity], toRenderColor(color), thickness, !phase);

// NoammAddons' renderBox: x/z are the centre, y is the bottom, width applies to both horizontal axes.
export const drawCenteredBox = (x, y, z, width, height, color, phase = false) => drawBox(x - width / 2, y, z - width / 2, x + width / 2, y + height, z + width / 2, color, phase);
