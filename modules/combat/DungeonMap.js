import { ModuleBase } from '../../utils/ModuleBase';
import { chat } from '../../utils/Chat';
import { OverlayManager } from '../../gui/OverlayUtils';
import { Vec3d } from '../../utils/Constants';
import { File } from '../../utils/Constants';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { MultiToggle } from '../../gui/components/Dropdown';
import { Color } from '../../utils/Constants';

const DUNGEON_MAP_DIR = new File('./config/ChatTriggers/modules/V5Config/DungeonMap');
if (!DUNGEON_MAP_DIR.exists()) DUNGEON_MAP_DIR.mkdirs();

class DungeonMap extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Map',
            subcategory: 'Catacombs',
            description: 'Displays a custom dungeon map HUD (legit mode - shows explored rooms only)',
            showEnabledToggle: true,
        });

        this.enabled = false;
        this.showHud = false;
        this.showRoomNames = false;
        this.showSecrets = true;
        this.darkenUnexplored = true;
        this.showPlayerIcons = true;
        this.showPlayerNames = false;
        this.mapX = 10;
        this.mapY = 80;
        this.mapScale = 1.1;
        this.mapWidth = 250;
        this.mapHeight = 180;
        this.scanCooldown = 500;

        // Dungeon data
        this.rooms = [];
        this.doors = [];
        this.playerPositions = [];
        this.lastScanTick = 0;
        this.scanCooldown = 500;
        this.mapX = 10;
        this.mapY = 80;
        this.mapScale = 1.1;
        this.mapWidth = 250;
        this.mapHeight = 180;
        this.dungeonScanned = false;
        this.rooms = [];
        this.doors = [];
        this.playerPositions = [];
        this.lastScanTick = 0;
        this.scanCooldown = 500;
        this.mapX = 10;
        this.mapY = 80;
        this.mapScale = 1.1;
        this.mapWidth = 250;
        this.mapHeight = 180;

        // Settings
        this.addToggle(
            'Show HUD',
            (value) => { this.showHud = value; },
            'Toggle the dungeon map HUD display.',
            this.showHud
        );

        this.addToggle(
            'Show Room Names',
            (value) => { this.showRoomNames = value; },
            'Display room names on the map.',
            this.showRoomNames
        );

        this.addToggle(
            'Show Secrets',
            (value) => { this.showSecrets = value; },
            'Display secret counts on rooms.',
            this.showSecrets
        );

        this.addToggle(
            'Darken Unexplored',
            (value) => { this.darkenUnexplored = value; },
            'Darken unexplored rooms on the map.',
            this.darkenUnexplored
        );

        this.addToggle(
            'Show Player Icons',
            (value) => { this.showPlayerIcons = value; },
            'Show player icons on the map.',
            this.showPlayerIcons
        );

        this.addToggle(
            'Show Player Names',
            (value) => { this.showPlayerNames = value; },
            'Show player names on the map.',
            this.showPlayerNames
        );

        this.addSlider(
            'Map X Position',
            0,
            500,
            this.mapX,
            (value) => { this.mapX = Math.round(value); },
            'X coordinate of the map on screen.'
        );

        this.addSlider(
            'Map Y Position',
            0,
            500,
            this.mapY,
            (value) => { this.mapY = Math.round(value); },
            'Y coordinate of the map on screen.'
        );

        this.addSlider(
            'Map Scale',
            0.5,
            3.0,
            this.mapScale,
            (value) => { this.mapScale = Number(value.toFixed(1)); },
            'Scale of the map display.'
        );

        this.addSlider(
            'Map Width',
            100,
            500,
            this.mapWidth,
            (value) => { this.mapWidth = Math.round(value); },
            'Width of the map display.'
        );

        this.addSlider(
            'Map Height',
            100,
            500,
            this.mapHeight,
            (value) => { this.mapHeight = Math.round(value); },
            'Height of the map display.'
        );

        this.addSlider(
            'Scan Cooldown (ms)',
            100,
            2000,
            this.scanCooldown,
            (value) => { this.scanCooldown = Math.round(value); },
            'How often to scan the dungeon (milliseconds).'
        );

        this.addSlider(
            'Map Scale',
            0.5,
            3.0,
            this.mapScale,
            (value) => { this.mapScale = Number(value.toFixed(1)); },
            'Scale of the map display.'
        );
    }

    onEnable() {
        this.enabled = true;
        this.showHud = true;
        this.message('&aDungeon Map enabled.');
    }

    onDisable() {
        this.enabled = false;
        this.showHud = false;
        this.message('&cDungeon Map disabled.');
    }

    onTick() {
        if (!this.enabled) return;
        
        const now = Date.now();
        if (now - this.lastScanTick < this.scanCooldown) return;
        this.lastScanTick = now;
        
        this.scanDungeonLegit();
    }

    scanDungeonLegit() {
        // Legit mode: only scan visible areas, record player position
        const player = Player.getPlayer();
        if (!player) return;

        // Record player position for map rendering
        this.playerPositions.push({
            x: player.getX(),
            y: player.getY(),
            z: player.getZ(),
            timestamp: Date.now()
        });
        
        // Keep only last 1000 positions
        if (this.playerPositions.length > 1000) {
            this.playerPositions.shift();
        }

        // Scan visible rooms/doors in render distance
        this.scanVisibleAreas();
    }

    scanVisibleAreas() {
        // Scan visible rooms/doors in render distance using ChatTriggers API
        // This is a simplified legit scanner - only scans loaded chunks
        if (!World.isLoaded()) return;
        
        try {
            // Use ChatTriggers Dungeon API if available
            if (typeof Dungeon !== 'undefined' && Dungeon.inDungeon) {
                // Record player position for map rendering
                const player = Player.getPlayer();
                if (player) {
                    // Update player position tracking
                }
            }
        } catch (e) {
            // Silently fail if Dungeon API not available
        }
    }

    // Legacy cheater mode removed - only legit mode available
    // Cheater mode (seeing through walls) removed for fairness
}

new DungeonMap();
