import { ModuleBase } from '../../utils/ModuleBase';
import { DungeonCore } from '../../utils/catacombs/CatacombsCore';

class DungeonScannerModule extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Scanner',
            subcategory: 'Catacombs',
            description: 'Scans dungeon rooms/doors, highlights star mobs, wither doors, secrets',
            tooltip: 'Toggle individual visual features below',
            showEnabledToggle: false,
        });

        this.addToggle(
            'Star Mob ESP',
            (v) => { DungeonCore.starMobs.enabled = v; },
            'Highlight starred mobs (✯ Fels, ✯ Withermancer, Shadow Assassin)',
            false
        );

        this.addColorPicker(
            'Star Mob Color',
            new java.awt.Color(255, 255, 0, 180),
            (c) => DungeonCore.starMobs.setColor(c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha()),
            'Color for starred mob boxes'
        );

        this.addToggle(
            'Wither Door ESP',
            (v) => { DungeonCore.doorESP.enabled = v; },
            'Highlight wither/blood doors ahead of you',
            false
        );

        this.addColorPicker(
            'Wither Door Color',
            new java.awt.Color(255, 0, 0, 180),
            (c) => DungeonCore.doorESP.setColor(c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha()),
            'Color for wither/blood door boxes'
        );

        this.addToggle(
            'Blood Door Color (Key)',
            (v) => { DungeonCore.doorESP.keyColorEnabled = v; },
            'Show doors green when you have the key',
            true
        );

        this.addColorPicker(
            'Key Highlight Color',
            new java.awt.Color(0, 255, 0, 180),
            (c) => DungeonCore.doorESP.setKeyColor(c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha()),
            'Color when you have the door key'
        );

        this.addToggle(
            'Secret Highlights',
            (v) => { DungeonCore.secretsAPI.enabled = v; },
            'Highlight secret chests when clicked',
            false
        );

        this.addColorPicker(
            'Secret Color',
            new java.awt.Color(0, 255, 0, 130),
            (c) => DungeonCore.secretsAPI.setColor(c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha()),
            'Color for secret highlights'
        );

        this.addSlider(
            'Secret Display Time (s)',
            1,
            10,
            3,
            (v) => DungeonCore.secretsAPI.setDisplayTime(v * 1000),
            'How long secret highlights stay visible'
        );

        this.addButton(
            'Scan Now',
            () => DungeonCore.scanner.scan(),
            'Manually trigger a full dungeon scan'
        );

        this.addButton(
            'Reset Scanner',
            () => DungeonCore.scanner.reset(),
            'Clear all scanned data'
        );

        this.addButton(
            'Debug: Blood Rush',
            () => {
                const path = DungeonCore.graph.getBloodRush();
                ChatLib.chat('&aBlood rush: ' + path.map(r => r.data.name).join(' > '));
            },
            'Print blood rush path to chat'
        );

        this.addButton(
            'Debug: Mimic Room',
            () => {
                const m = DungeonCore.scanner.mimicRoom;
                if (m) ChatLib.chat('&aMimic in: ' + m.data.name);
                else ChatLib.chat('&cNo mimic found');
            },
            'Print mimic room to chat'
        );

        this.bindToggleKey('Toggle Dungeon Scanner');
    }
}

new DungeonScannerModule();