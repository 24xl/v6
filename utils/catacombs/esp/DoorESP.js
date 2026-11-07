import scanner from '../scanner/DungeonScanner';
import { DoorType, RoomState } from '../scan/DungeonScanUtils';

const DEFAULT_COLOR = new RenderColor(255, 0, 0, 180);
const KEY_COLOR = new RenderColor(0, 255, 0, 180);

let doorColor = DEFAULT_COLOR;
let enabled = false;
let keyColorEnabled = true;

import { getWitherKeys, getBloodKeys } from '../keys/DoorKeys';

export function renderDoors() {
    if (!enabled || !scanner.isInDungeon() || scanner.isInBoss()) return;

    let foundClosed = false;

    for (const tile of scanner.dungeonList) {
        if (!(tile instanceof DoorTile)) continue;
        if (tile.opened) continue;
        if (tile.doorType !== DoorType.WITHER && tile.doorType !== DoorType.BLOOD) continue;

        const shouldHide = !scanner.hasScanned && tile.uniqueRoom?.state === RoomState.UNDISCOVERED;
        if (shouldHide) continue;

        const hasKey = (tile.doorType === DoorType.BLOOD && getBloodKeys() > 0) ||
                       (tile.doorType === DoorType.WITHER && getWitherKeys() > 0);
        const color = (keyColorEnabled && hasKey) ? KEY_COLOR : doorColor;

        const lines = makeBoxLines(tile.x + 0.5, 69, tile.z + 0.5, 3, 4, 3);
        Render3D.drawLines(lines, color, 2, true);

        if (!tile.opened) foundClosed = true;
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

export function setEnabled(v) {
    enabled = v;
}

export function setColor(r, g, b, a) {
    doorColor = new RenderColor(r, g, b, a);
}

export function setKeyColor(r, g, b, a) {
    KEY_COLOR.setRed(r);
    KEY_COLOR.setGreen(g);
    KEY_COLOR.setBlue(b);
    KEY_COLOR.setAlpha(a);
}

export function setKeyColorEnabled(v) {
    keyColorEnabled = v;
}

export default { renderDoors, setEnabled, setColor, setKeyColor, setKeyColorEnabled };