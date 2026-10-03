import Pathfinder from '../../utils/pathfinder/PathFinder';
import { findItemInHotbar } from '../../utils/player/Inventory';

const ROOF_SCAN_MIN_OFFSET = 2;
const ROOF_SCAN_MAX_Y = 76;
const ROOF_SCAN_BOTTOM = 0;
const CLIMB_OVERSHOOT = 12;
const CLIMB_MAX_GOALS = 40;

export class RoofEtherwarp {
    constructor() {
        this.enabled = false;
        this.testToken = 0;
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

    /**
     * Vertical column from just above the player up past the roof.
     * Goals must never start below the player or Pathfinder reports the
     * destination reached on the first tick and nothing moves. The top
     * overshoots the roof so the run is longer than AOTE_MIN_GAIN, since
     * AOTV is refused on paths shorter than that.
     */
    climbGoals(roofY) {
        const player = Player.getPlayer();
        if (!player) return [];
        const x = Math.floor(player.getX());
        const z = Math.floor(player.getZ());
        const bottom = Math.floor(player.getY()) + 1;
        const top = Math.max(roofY + CLIMB_OVERSHOOT, bottom + 1);
        const goals = [];
        for (let y = bottom; y <= top && goals.length < CLIMB_MAX_GOALS; y++) goals.push([x, y, z]);
        return goals;
    }

    startTestClimb(onComplete) {
        if (Pathfinder.isPathing()) return 'already-pathing';

        const roof = this.findHighestRoofBlock();
        if (!roof) return 'no-roof';

        const goals = this.climbGoals(roof.y);
        if (!goals.length) return 'no-player';

        const token = ++this.testToken;
        Pathfinder.resetPath(false);
        Pathfinder.findPath(
            goals,
            (success) => {
                if (token !== this.testToken) return;
                onComplete(success, this.hasRoofAbove());
            },
            true
        );
        return 'started';
    }

    stopTestClimb() {
        this.testToken++;
        if (Pathfinder.isPathing()) Pathfinder.resetPath();
    }
}

export const roofEtherwarp = new RoofEtherwarp();