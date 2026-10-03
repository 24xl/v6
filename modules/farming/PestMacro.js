import { Categories } from '../../gui/categories/CategorySystem';
import { ModuleBase } from '../../utils/ModuleBase';
import { chat } from '../../utils/Chat';
import { v5Command } from '../../utils/V5Commands';
import { sunsetPests } from './SunsetPests';
import { roofEtherwarp } from './RoofEtherwarp';

const SETTING_MOVES = [
    ['Rewarp Settings', 'Auto Philip Bonus Settings', 'Farming Settings'],
    ['Farming Settings', 'Kill nearby pests while farming', 'Pest macro'],
    ['Farming Settings', 'Sprayonator While Farming', 'Pest macro'],
    ['Rewarp Settings', 'Pest Killer Settings', 'Pest macro'],
];

class PestMacro extends ModuleBase {
    constructor() {
        super({
            name: 'Pest macro',
            subcategory: 'Farming',
            description: 'Pest control settings for farming.',
            showEnabledToggle: false,
        });

        this.addToggle(
            'Enable Sunset Pests',
            (value) => (sunsetPests.enableSunsetPests = !!value),
            'Sets garden time to Day before each infested-plot teleport, and back to Night once pest killing finishes.'
        );
        this.addToggle(
            'Roof Etherwarp',
            (value) => (roofEtherwarp.enabled = !!value),
            'When the next infested plot is the one you are already on, climbs to the roof above you with Aspect of the Void pathfinding instead of teleporting.'
        );

        this.registerRoofDebugCommand();

        this.adoptPestSettings();
    }

    registerRoofDebugCommand() {
        v5Command(
            'testroof',
            (...args) => {
                const action = String(args[0] ?? '').replace(/^-+/, '').toLowerCase();
                if (action === 'go') return this.testRoofRun();
                if (action === 'stop') return this.testRoofStop();
                this.testRoofScan();
            },
            ['greedyString']
        );
    }

    testRoofScan() {
        const player = Player.getPlayer();
        if (!player) return chat('&cNo player.');

        const x = Math.floor(player.getX());
        const y = Math.floor(player.getY());
        const z = Math.floor(player.getZ());
        const roof = roofEtherwarp.findHighestRoofBlock();

        chat(`&bRoof scan &7at &f${x}, ${y}, ${z}&7, range &fy${y + 2} .. 76`);
        chat(`&7Roof Etherwarp enabled: &f${roofEtherwarp.enabled ? 'yes' : 'no'}`);
        chat(`&7AOTV in hotbar: &f${roofEtherwarp.findAotvSlot() === null ? 'no' : 'yes'}`);

        if (!roof) {
            chat('&eNo roof found above you - pest killing would start from the ground.');
            chat('&7Run &f/v5 testroof go&7 to start the climb anyway.');
            return;
        }

        const climb = roof.y - y;
        chat(`&aHighest block: &f${roof.y} &7(${roof.name})`);
        chat(`&7Blocks above you: &f${climb}`);
        if (climb > 1) {
            chat(`&7Run &f/v5 testroof go&7 to etherwarp up toward &f${roof.y}&7.`);
        } else {
            chat('&7You are already at or above the roof - no climb needed.');
        }
    }

    testRoofRun() {
        const player = Player.getPlayer();
        if (!player) return chat('&cNo player.');

        const y = Math.floor(player.getY());
        const result = roofEtherwarp.startTestClimb((success, stillRoof) => {
            if (!success) {
                chat('&cTest climb failed to reach the goal.');
                return;
            }
            if (stillRoof) {
                chat(`&7Arrived, roof still above. Run &f/v5 testroof go&7 again.`);
            } else {
                chat('&aArrived with no roof above - this is where pest killing would resume.');
            }
        });

        if (result === 'no-roof') {
            chat('&eNo roof found above you - nothing to climb.');
            return result;
        }
        if (result === 'already-pathing') {
            chat('&cAlready pathing. Use &f/v5 testroof stop&c first.');
            return result;
        }
        if (result === 'no-player') return result;

        chat(`&aEtherwarping up from y${y} - AOTV fires while the path is straight.`);
        chat('&7Use &f/v5 testroof stop&7 to cancel.');
        return result;
    }

    testRoofStop() {
        roofEtherwarp.stopTestClimb();
        chat('&7Test climb stopped.');
    }

    adoptPestSettings() {
        SETTING_MOVES.forEach(([from, title, to]) => this.moveSetting(from, title, to));
    }

    moveSetting(from, title, to) {
        const source = Categories.findItem('Modules', from);
        const target = Categories.findItem('Modules', to);
        if (!source || !target) {
            console.error(`[PestMacro] move skipped: ${from} -> ${to} (item not found)`);
            return;
        }
        const index = source.components.findIndex((component) => component.title === title);
        if (index === -1) {
            console.error(`[PestMacro] move skipped: "${title}" not present in ${from}`);
            return;
        }
        const [component] = source.components.splice(index, 1);
        target.components.push(component);
        Categories.dataRevision++;
    }
}

new PestMacro();