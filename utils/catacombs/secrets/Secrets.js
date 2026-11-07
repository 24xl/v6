import { Render3D, RenderColor } from '../../Constants';
import { scanner } from '../scanner/DungeonScanner';

const clickedSecrets = new Map();
let secretColor = new RenderColor(0, 255, 0, 130);
let displayTime = 3000;

register('chat', (pos) => {
    const [x, y, z] = pos.split(',').map(Number);
    if (x != null && y != null && z != null) {
        clickedSecrets.set(`${x},${y},${z}`, Date.now());
    }
}).setCriteria(/&7Secret found at &b(-?\d+), (-?\d+), (-?\d+)/);

register('chat', () => {
    clickedSecrets.clear();
}).setCriteria(/&7Cleared all secret highlights/);

register('worldUnload', () => {
    clickedSecrets.clear();
});

export function setSecretColor(r, g, b, a) {
    secretColor = new RenderColor(r, g, b, a);
}

export function setDisplayTime(ms) {
    displayTime = ms;
}

export function renderSecrets() {
    if (!scanner.isInDungeon()) return;

    const now = Date.now();
    for (const [key, time] of clickedSecrets) {
        if (time + displayTime < now) {
            clickedSecrets.delete(key);
            continue;
        }
        const [x, y, z] = key.split(',').map(Number);
        const lines = makeBoxLines(x + 0.5, y + 0.5, z + 0.5, 1, 1, 1);
        Render3D.drawLines(lines, secretColor, 2, true);
    }
}

function makeBoxLines(x, y, z, w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const corners = [
        [x - hw, y, z - hd], [x + hw, y, z - hd],
        [x + hw, y, z - hd], [x + hw, y, z + hd],
        [x + hw, y, z + hd], [x - hw, y, z + hd],
        [x - hw, y, z + hd], [x - hw, y, z - hd],
        [x - hw, y + h, z - hd], [x + hw, y + h, z - hd],
        [x + hw, y + h, z - hd], [x + hw, y + h, z + hd],
        [x + hw, y + h, z + hd], [x - hw, y + h, z + hd],
        [x - hw, y + h, z + hd], [x - hw, y + h, z - hd],
        [x - hw, y, z - hd], [x - hw, y + h, z - hd],
        [x + hw, y, z - hd], [x + hw, y + h, z - hd],
        [x + hw, y, z + hd], [x + hw, y + h, z + hd],
        [x - hw, y, z + hd], [x - hw, y + h, z + hd],
    ];
    return corners.map(([x, y, z]) => new net.minecraft.world.phys.Vec3(x, y, z));
}

export function highlightSecret(x, y, z) {
    clickedSecrets.set(`${x},${y},${z}`, Date.now());
}