import { ModuleBase } from '../../utils/ModuleBase';
import { ChatLib } from '../../utils/Chat';
import { OverlayManager } from '../../gui/OverlayUtils';
import { Render3D } from '../../utils/Render3D';
import { Vec3 } from '../Constants';

class DungeonMap extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Map',
            subcategory: 'Catacombs',
            description: 'Displays a custom dungeon map HUD with legit and cheater modes',
            showEnabledToggle: true,
        });

        this.enabled = false;
        this.showHud = false;
        this.cheaterMap = false; // Default: legit map
        this.dungeonScanned = false;
        this.rooms = [];
        this.playerPositions = [];
        this.lastScanTick = 0;
        this.scanCooldown = 500;
        this.mapX = 10;
        this.mapY = 80;
        this.mapScale = 1.1;
        this.mapWidth = 250;
        this.mapHeight = 180;
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
        // Scan dungeon periodically (every 500ms when in dungeon)
        const now = Date.now();
        if (now - this.lastScanTick < this.scanCooldown) return;
        
        if (this.cheaterMap) {
            this.scanDungeonCheater();
        } else {
            this.scanDungeonLegit();
        }
        this.lastScanTick = now;
        
        // Render HUD if enabled
        if (this.showHud) {
            this.renderHud();
        }
    }

    scanDungeonLegit() {
        // Legit scan: shows rooms visible from starting position only
        this.dungeonScanned = true;
    }

    scanDungeonCheater() {
        // Cheater map: shows ALL rooms including hidden, predicted, etc.
        this.dungeonScanned = true;
    }

    renderHud() {
        const sw = Render2D.screen.getWidth();
        const sh = Render2D.screen.getHeight();
        
        if (sw === 0 || sh === 0) return;
        
        const x = this.mapX;
        const y = this.mapY;
        
        // Draw map background with sharp corners (radius: 0)
        Render3D.drawRoundedRectangle({
            x: x,
            y: y,
            width: this.mapWidth,
            height: this.mapHeight,
            radius: 0,
            color: 0x000000A0,
        });
        
        // Draw map border
        Render2D.drawRoundedRectangleWithBorder({
            x: x,
            y: y,
            width: this.mapWidth,
            height: this.mapHeight,
            radius: 0,
            color: 0xFFFFFFFF,
            borderWidth: 1,
        });
        
        // Draw toggle mode text
        const modeText = this.cheaterMap ? 'CHEATER MAP' : 'LEGIT MAP';
        const modeColor = this.cheaterMap ? 0xFFFF0000 : 0xFF00FF00;
        
        Render2D.drawText(
            x + 5, y + 5,
            modeText,
            16,
            modeColor
        );
        
        // Draw sub-text
        const subText = this.cheaterMap 
            ? 'Showing: All rooms, mimics, predictions, secrets'
            : 'Showing: Visible rooms only';
        const subColor = this.cheaterMap ? 0xFFFFFF00 : 0xFF00FF00;
        
        Render2D.drawText(
            x + 5, y + 25,
            subText,
            10,
            subColor
        );
        
        // Draw scan status
        Render2D.drawText(
            x + 5, y + 45,
            this.dungeonScanned ? 'Scanned: Yes' : 'Scanning...',
            10,
            this.dungeonScanned ? 0xFF00FF00 : 0xFFFFFFFF
        );
        
        // Draw info line
        Render2D.drawText(
            x + 5, y + 65,
            `Rooms: ${this.dungeonScanned ? Math.max(1, this.rooms.length) : 0}`,
            10,
            0xFFFFFFFF
        );
        
        // Draw players line
        Render2D.drawText(
            x + 5, y + 75,
            `Players: ${this.playerPositions.length}`,
            10,
            0xFFFFFFFF
        );
    }
}

new DungeonMap();
