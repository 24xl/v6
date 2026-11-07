import { ModuleBase } from '../../utils/ModuleBase';
import { Categories } from '../../gui/categories/CategorySystem';
import { inCrystalHollows } from '../../utils/Area';
import { getConfigFile, writeConfigFile } from '../../utils/Utils';
import { Vec3d } from '../../utils/Constants';

const ClientboundAddEntityPacket = net.minecraft.network.protocol.game.ClientboundAddEntityPacket;
const ClientboundSetEntityDataPacket = net.minecraft.network.protocol.game.ClientboundSetEntityDataPacket;
const DataWatcher = net.minecraft.network.syncher.DataWatcher;
const DataWatcherObject = net.minecraft.network.syncher.DataWatcherObject;

const DEFAULT_COLOR = [0, 255, 0, 180];

const VISUAL_FEATURES = [
    {
        id: 'starMobEsp',
        name: 'Star Mob ESP',
        description: 'Draws 3D boxes around starred mobs (✯ Fels, ✯ Withermancer, Shadow Assassin)',
        defaultColor: [0, 255, 0, 180],
    },
    {
        id: 'witherDoorEsp',
        name: 'Wither Door ESP',
        description: 'Draws 3D boxes around upcoming wither/blood doors ahead of you',
        defaultColor: [255, 0, 0, 180],
    },
];

function makeBoxLines(x, y, z, w, h, d) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    return [
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
    ].map(([x, y, z]) => new Vec3d(x, y, z));
}

class DungeonVisuals extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Visuals',
            subcategory: 'Catacombs',
            description: 'Visual overlays for dungeon runs (star mobs, wither doors, etc.)',
            tooltip: 'Enable/disable individual visual features with custom colors.',
            showEnabledToggle: false,
        });

        this.starMobs = new Map();
        this.witherDoors = [];
        this.starMobRenderer = null;
        this.doorRenderer = null;
        this.lastDungeonCheck = 0;
        this.inDungeon = false;
        this.pendingStarMobIds = new Map();

        this.cfg = {
            features: {},
            colors: {},
        };

        this.loadSettings();

        this.addMultiToggle(
            'Features',
            VISUAL_FEATURES.map((f) => ({
                name: f.name,
                enabled: this.cfg.features[f.id] ?? false,
                val1: '',
                val2: '',
                placeholder1: '',
                placeholder2: '',
            })),
            false,
            (options) => {
                options.forEach((opt) => {
                    const feat = VISUAL_FEATURES.find((f) => f.name === opt.name);
                    if (feat) {
                        this.cfg.features[feat.id] = opt.enabled;
                        if (opt.enabled) this.enableFeature(feat.id);
                        else this.disableFeature(feat.id);
                    }
                });
                this.saveSettings();
            },
            'Toggle individual visual features',
            null
        );

        VISUAL_FEATURES.forEach((feat) => {
            this.addPopup(`${feat.name} Settings`, null, `Configure ${feat.name}`);
            this.addColorPicker(
                `${feat.name} Color`,
                new java.awt.Color(...feat.defaultColor),
                (c) => {
                    this.cfg.colors[feat.id] = [c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha()];
                    this.saveSettings();
                },
                'Color for this visual feature'
            );
        });

        this.bindToggleKey('Toggle Dungeon Visuals');
        this.registerEvents();
    }

    loadSettings() {
        const data = getConfigFile('catacombs/DungeonVisuals.json') || { features: {}, colors: {} };
        this.cfg.features = data.features || {};
        this.cfg.colors = data.colors || {};
        VISUAL_FEATURES.forEach((f) => {
            if (this.cfg.colors[f.id] == null) this.cfg.colors[f.id] = [...f.defaultColor];
        });
    }

    saveSettings() {
        writeConfigFile('catacombs/DungeonVisuals.json', {
            features: this.cfg.features,
            colors: this.cfg.colors,
        });
    }

    registerEvents() {
        register('tick', () => this.tick());
        register('worldUnload', () => this.cleanup());
    }

    tick() {
        const now = Date.now();
        if (now - this.lastDungeonCheck > 1000) {
            this.lastDungeonCheck = now;
            const wasInDungeon = this.inDungeon;
            this.inDungeon = inCrystalHollows();
            if (wasInDungeon !== this.inDungeon) {
                if (!this.inDungeon) this.cleanup();
                else this.refreshRenderers();
            }
        }

        if (!this.inDungeon) return;

        if (this.cfg.features.starMobEsp) this.updateStarMobs();
        if (this.cfg.features.witherDoorEsp) this.updateWitherDoors();
    }

    enableFeature(id) {
        if (!this.inDungeon) return;
        if (id === 'starMobEsp') this.registerStarMobPackets();
        if (id === 'witherDoorEsp') this.refreshDoors();
    }

    disableFeature(id) {
        if (id === 'starMobEsp') this.unregisterStarMobPackets();
        if (id === 'witherDoorEsp') this.clearDoorRenderer();
    }

    refreshRenderers() {
        if (this.cfg.features.starMobEsp) this.registerStarMobPackets();
        if (this.cfg.features.witherDoorEsp) this.refreshDoors();
    }

    cleanup() {
        this.unregisterStarMobPackets();
        this.clearDoorRenderer();
        this.starMobs.clear();
        this.witherDoors = [];
    }

    getColor(id) {
        const c = this.cfg.colors[id] || DEFAULT_COLOR;
        return { r: c[0], g: c[1], b: c[2], a: c[3] };
    }

    updateStarMobs() {
        const entities = World.getAllEntities();
        const found = new Map();
        for (const e of entities) {
            const name = e.getName?.()?.removeFormatting?.() || '';
            if (!name) continue;

            if (name === 'Shadow Assassin') {
                found.set(e.getId(), { entity: e, height: 1.8, dy: 1.8 });
            } else if (name.includes('✯')) {
                const clean = name.replace(/§./g, '').replace('✯ ', '');
                let height = 2, dy = 0;
                if (/Fels$/.test(clean)) height = 3;
                else if (/Withermancer$/.test(clean)) height = 3;
                else if (/Shadow Assassin/.test(clean)) dy = 2;
                found.set(e.getId(), { entity: e, height, dy });
            }
        }
        this.starMobs = found;
        this.toggleStarMobRenderer(found.size > 0);
    }

    registerStarMobPackets() {
        if (this.starMobPacketReg) return;
        this.starMobPacketReg = register('packetReceived', (packet) => {
            if (!this.inDungeon) return;
            const watcher = packet.getEntityMetadata?.();
            if (!watcher) return;
            for (const entry of watcher) {
                if (entry.getType?.() !== 4) continue;
                const val = entry.getValue?.();
                if (!(val instanceof java.lang.String) || val.trim() === '') continue;
                const match = val.toString().match(/§6✯\s*([\w\s]+)§r.+§c❤|^(Shadow Assassin)$/);
                if (match) {
                    const entId = packet.getEntityId?.();
                    if (entId != null) {
                        this.pendingStarMobIds.set(entId, { height: 2, dy: 0 });
                    }
                }
            }
        }).setFilteredClass(ClientboundAddEntityPacket);
    }

    unregisterStarMobPackets() {
        if (this.starMobPacketReg) {
            this.starMobPacketReg.unregister();
            this.starMobPacketReg = null;
        }
        this.pendingStarMobIds.clear();
    }

    toggleStarMobRenderer(enabled) {
        if (enabled && !this.starMobRenderer) {
            this.starMobRenderer = register('renderWorld', (pticks) => this.renderStarMobs(pticks));
        } else if (!enabled && this.starMobRenderer) {
            this.starMobRenderer.unregister();
            this.starMobRenderer = null;
        }
    }

    renderStarMobs(pticks) {
        if (!this.cfg.features.starMobEsp || this.starMobs.size === 0) return;
        const { r, g, b, a } = this.getColor('starMobEsp');
        const color = new RenderColor(r, g, b, a);

        for (const [, mob] of this.starMobs) {
            const ex = mob.entity.getRenderX(pticks);
            const ey = mob.entity.getRenderY(pticks) - mob.dy;
            const ez = mob.entity.getRenderZ(pticks);
            const lines = makeBoxLines(ex, ey, ez, 0.6, mob.height, 0.6);
            Render3D.drawLines(lines, color, 2, true);
        }
    }

    updateWitherDoors() {
        if (!this.cfg.features.witherDoorEsp) return;
        const doors = [];
        const entities = World.getAllEntities();
        for (const e of entities) {
            const name = e.getName?.()?.removeFormatting?.() || '';
            if (name.includes('Wither Door') || name.includes('Blood Door')) {
                doors.push({ x: e.getX(), y: e.getY(), z: e.getZ(), type: name.includes('Blood') ? 'blood' : 'wither' });
            }
        }
        this.witherDoors = doors;
        this.toggleDoorRenderer(doors.length > 0);
    }

    refreshDoors() {
        this.updateWitherDoors();
    }

    toggleDoorRenderer(enabled) {
        if (enabled && !this.doorRenderer) {
            this.doorRenderer = register('renderWorld', () => this.renderDoors());
        } else if (!enabled && this.doorRenderer) {
            this.doorRenderer.unregister();
            this.doorRenderer = null;
        }
    }

    clearDoorRenderer() {
        if (this.doorRenderer) {
            this.doorRenderer.unregister();
            this.doorRenderer = null;
        }
    }

    renderDoors() {
        if (!this.cfg.features.witherDoorEsp || this.witherDoors.length === 0) return;
        const { r, g, b, a } = this.getColor('witherDoorEsp');
        const color = new RenderColor(r, g, b, a);
        for (const d of this.witherDoors) {
            const lines = makeBoxLines(d.x, d.y + 2, d.z, 3, 4, 3);
            Render3D.drawLines(lines, color, 2, true);
        }
    }

    onDisable() {
        this.cleanup();
    }
}

new DungeonVisuals();