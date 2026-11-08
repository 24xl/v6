import { ModuleBase } from '../../utils/ModuleBase';
import { DungeonCore } from '../../utils/catacombs/CatacombsCore';
import { chat } from '../../utils/Chat';

const { scanner, graph, location, DoorTile, DoorType, SecretType, keys } = DungeonCore;
const BoundingBox = net.minecraft.world.phys.AABB;

const SECRET_COLORS = {
    [SecretType.CHEST]: new RenderColor(0, 255, 0, 255),
    [SecretType.ITEM]: new RenderColor(0, 170, 255, 255),
    [SecretType.BAT]: new RenderColor(255, 170, 0, 255),
    [SecretType.LEVER]: new RenderColor(255, 255, 255, 255),
    [SecretType.REDSTONE_KEY]: new RenderColor(255, 0, 0, 255),
    [SecretType.WITHER_ESSENCE]: new RenderColor(170, 0, 255, 255),
};

const toRenderColor = (color) => new RenderColor(color.getRed(), color.getGreen(), color.getBlue(), color.getAlpha());

class DungeonScannerModule extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Scanner',
            subcategory: 'Catacombs',
            description: 'Scans the dungeon grid and highlights doors / secrets using the shared catacombs API',
            tooltip: 'Backed by utils/catacombs. Use /dungeonscan for debug output.',
        });

        this.doorEsp = true;
        this.secretEsp = false;
        this.keyColor = new RenderColor(0, 255, 0, 255);
        this.noKeyColor = new RenderColor(255, 0, 0, 255);

        this.addToggle('Door ESP', (v) => (this.doorEsp = v), 'Outline unopened wither and blood doors', true);
        this.addColorPicker('Has Key Color', java.awt.Color.GREEN, (c) => (this.keyColor = toRenderColor(c)), 'Door color when you hold the matching key');
        this.addColorPicker('No Key Color', java.awt.Color.RED, (c) => (this.noKeyColor = toRenderColor(c)), 'Door color when you do not hold the key');
        this.addToggle('Secret ESP', (v) => (this.secretEsp = v), 'Outline known secret locations in the room you are standing in', false);
        this.addToggle('Mimic Detection', (v) => (scanner.mimicDetectionEnabled = v), 'Find the mimic room on F6/F7 by counting trapped chests', false);
        this.addButton('Rescan', () => scanner.reset(), 'Clear scanned data and scan again');
        this.addButton('Print Blood Rush', () => {
            const path = graph.getBloodRush();
            chat(path.length ? '&aBlood rush: &f' + path.map((room) => room.name).join(' > ') : '&cNo blood rush path yet');
        });

        this.on('postRenderWorld', () => this.render());
    }

    render() {
        if (!location.inDungeon || location.inBoss) return;
        if (this.doorEsp) this.renderDoors();
        if (this.secretEsp) this.renderSecrets();
    }

    renderDoors() {
        for (const tile of scanner.dungeonList) {
            if (!(tile instanceof DoorTile) || tile.opened) continue;
            if (tile.type !== DoorType.WITHER && tile.type !== DoorType.BLOOD) continue;

            const hasKey = tile.type === DoorType.BLOOD ? keys.hasBloodKey() : keys.hasWitherKey();
            const box = new BoundingBox(tile.aabb.minX, tile.aabb.minY, tile.aabb.minZ, tile.aabb.maxX, tile.aabb.maxY, tile.aabb.maxZ);
            Render3D.drawWireFrameBox(box, hasKey ? this.keyColor : this.noKeyColor, 2, false);
        }
    }

    renderSecrets() {
        const room = scanner.currentRoom;
        if (!room || room.rotation === null) return;

        for (const [type, positions] of room.secretCoords) {
            const color = SECRET_COLORS[type];
            for (const p of positions) {
                Render3D.drawWireFrameBox(new BoundingBox(p.x, p.y, p.z, p.x + 1, p.y + 1, p.z + 1), color, 2, false);
            }
        }
    }
}

new DungeonScannerModule();
