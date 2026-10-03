import { findItemInHotbar } from '../../utils/player/Inventory';

const ROOF_SCAN_MIN_OFFSET = 2;
const ROOF_SCAN_MAX_Y = 76;
const ROOF_SCAN_BOTTOM = 0;

export class RoofEtherwarp {
    constructor() {
        this.enabled = false;
    }

    findHighestRoofBlock() {
        const player = Player.getPlayer();
        if (!player) return null;

        const x = Math.floor(player.getX());
        const z = Math.floor(player.getZ());
        const bottom = Math.max(ROOF_SCAN_BOTTOM, Math.floor(player.getY()) + ROOF_SCAN_MIN_OFFSET);
        let highest = null;

        for (let y = bottom; y <= ROOF_SCAN_MAX_Y; y++) {
            const name = World.getBlockAt(x, y, z)?.type?.getRegistryName?.();
            if (name && name !== 'minecraft:air') highest = { x, y, z, name };
        }

        return highest;
    }

    hasRoofAbove() {
        const player = Player.getPlayer();
        if (!player) return false;
        const roof = this.findHighestRoofBlock();
        return !!roof && roof.y > Math.floor(player.getY()) + 1;
    }

    findAotvSlot() {
        const aotv = findItemInHotbar('Aspect of the Void');
        return aotv === -1 ? null : aotv;
    }

    climbGoals() {
        const player = Player.getPlayer();
        if (!player) return [];
        const x = Math.floor(player.getX());
        const z = Math.floor(player.getZ());
        const goals = [];
        for (let y = 66; y <= ROOF_SCAN_MAX_Y; y++) goals.push([x, y, z]);
        return goals;
    }
}

export const roofEtherwarp = new RoofEtherwarp();