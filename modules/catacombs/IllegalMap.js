import { ModuleBase } from '../../utils/ModuleBase';
import { OverlayManager } from '../../gui/OverlayUtils';
import { DataComponents } from '../../utils/Constants';
import { Overlays } from '../../gui/core/GuiState';
import { drawText, getTextWidth } from '../../gui/Utils';

// Port of UnclaimedBloom6/IllegalMap (MIT). Everything here runs off the hotbar map item, scoreboard and tab list,
// so it does not need BloomCore, Amaterasu, PogData or any 1.8.9 classes.

const MAP_SIZE = 128;
const MAP_PX = 125;
const DUNGEON_MIN = -200;
const DUNGEON_MAX = -10;

const RoomTypes = { NORMAL: 0, PUZZLE: 1, TRAP: 2, YELLOW: 3, BLOOD: 4, FAIRY: 5, RARE: 6, ENTRANCE: 7, UNKNOWN: 8 };
const Checkmark = { NONE: 0, WHITE: 1, GREEN: 2, FAILED: 3, UNEXPLORED: 4 };
const DoorTypes = { NORMAL: 0, WITHER: 1, BLOOD: 2, ENTRANCE: 3 };

const roomTypeFromColor = (color) => {
    if (color === 18) return RoomTypes.BLOOD;
    if (color === 30) return RoomTypes.ENTRANCE;
    if (color === 63) return RoomTypes.NORMAL;
    if (color === 82) return RoomTypes.FAIRY;
    if (color === 62) return RoomTypes.TRAP;
    if (color === 74) return RoomTypes.YELLOW;
    if (color === 66) return RoomTypes.PUZZLE;
    return null;
};

// Indexed by RoomTypes value; Rhino rejects computed object keys.
const ROOM_RGB = [
    [107, 58, 17],
    [117, 0, 133],
    [216, 127, 51],
    [254, 223, 0],
    [255, 0, 0],
    [224, 0, 255],
    [255, 203, 89],
    [20, 133, 0],
    [255, 176, 31],
];

const argb = (r, g, b, a = 255) => (((a & 255) << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)) | 0;
const strip = (text) => ChatLib.removeFormatting(String(text ?? ''));
const lineText = (line) => strip(line?.getName?.() ?? line).trim();

// Skia text has no shadow, so draw a dark copy underneath.
const shadowText = (str, x, y, size, color, align = 17) => {
    drawText(str, x + size * 0.08, y + size * 0.08, size, argb(0, 0, 0, 200), align);
    drawText(str, x, y, size, color, align);
};

const drawCheck = (x, y, s, color) => {
    Render2D.drawLine(x, y + s * 0.55, x + s * 0.35, y + s * 0.9, s * 0.22, color);
    Render2D.drawLine(x + s * 0.35, y + s * 0.9, x + s, y + s * 0.1, s * 0.22, color);
};

const drawCross = (x, y, s, color) => {
    Render2D.drawLine(x + s * 0.1, y + s * 0.1, x + s * 0.9, y + s * 0.9, s * 0.22, color);
    Render2D.drawLine(x + s * 0.9, y + s * 0.1, x + s * 0.1, y + s * 0.9, s * 0.22, color);
};

const state = {
    inDungeon: false,
    floor: 0,
    bossEntry: false,
    mapData: null,
    corner: null,
    roomSize: 0,
    gap: 0,
    rooms: [],
    doors: [],
    fullyScanned: false,
    info: { secrets: 0, crypts: 0, deaths: 0, score: 0, mimic: false, secretsLine: '' },
};

function resetState() {
    state.mapData = null;
    state.corner = null;
    state.roomSize = 0;
    state.gap = 0;
    state.rooms = [];
    state.doors = [];
    state.fullyScanned = false;
    state.bossEntry = false;
    state.info = { secrets: 0, crypts: 0, deaths: 0, score: 0, mimic: false, secretsLine: '' };
}

function updateDungeonInfo() {
    let inDungeon = false;
    let floor = 0;
    let score = state.info.score;
    for (const line of Scoreboard.getLines() || []) {
        const text = lineText(line);
        if (text.includes('The Catacombs')) {
            inDungeon = true;
            const m = text.match(/\(([FM])(\d)\)/i);
            if (m) floor = Number(m[2]);
        }
        const s = text.match(/Cleared:.*\((\d+)\)/);
        if (s) score = Number(s[1]);
    }
    state.inDungeon = inDungeon;
    state.floor = floor || state.floor;
    state.info.score = score;
    if (!inDungeon) return;

    for (const entry of TabList.getNames() || []) {
        const text = lineText(entry);
        let m = text.match(/Secrets Found:\s*(\d+)/);
        if (m) state.info.secrets = Number(m[1]);
        m = text.match(/Crypts:\s*(\d+)/);
        if (m) state.info.crypts = Number(m[1]);
        m = text.match(/Team Deaths:\s*(\d+)/);
        if (m) state.info.deaths = Number(m[1]);
    }
}

const dbg = { mapFound: false, mapId: 'none', colors: 0, lastError: '', errorShown: false };

function reportError(where, e) {
    dbg.lastError = where + ': ' + e + (e && e.stack ? ' @ ' + String(e.stack).split('
')[0] : '');
    console.error('[IllegalMap] ' + dbg.lastError);
    if (!dbg.errorShown) {
        dbg.errorShown = true;
        ChatLib.chat('&c[Dungeon Map] ' + dbg.lastError + ' &7(run /dmapdebug)');
    }
}

function getLevel() {
    return World.getWorld() || Client.getMinecraft().level;
}

function findMapColors() {
    dbg.mapFound = false;
    const level = getLevel();
    if (!level) return null;
    const inventory = Player.getInventory();
    if (!inventory) return null;
    for (let i = 0; i < 9; i++) {
        const item = inventory.getStackInSlot(i);
        if (!item) continue;
        const name = String(item.getType().getRegistryName());
        if (name.indexOf('filled_map') === -1) continue;
        const stack = item.toMC();
        if (!DataComponents.MAP_ID) throw new Error('DataComponents.MAP_ID does not exist on this Minecraft version');
        const mapId = stack.get(DataComponents.MAP_ID);
        dbg.mapId = String(mapId);
        if (!mapId) continue;
        const data = level.getMapData(mapId);
        if (data && data.colors) {
            dbg.mapFound = true;
            dbg.colors = data.colors.length;
            return data.colors;
        }
    }
    return null;
}

const px = (colors, x, y) => (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE ? 0 : colors[x + y * MAP_SIZE] & 0xff);

// The entrance room is always green (30). Its run length is the room size and the corner is that offset modulo room+gap.
function findCorner(colors) {
    for (let i = 0; i < colors.length; i++) {
        if ((colors[i] & 0xff) !== 30) continue;
        let run = 0;
        while (i + run < colors.length && (colors[i + run] & 0xff) === 30) run++;
        if (run < 16 || run > 20) continue;
        const x = i % MAP_SIZE;
        const y = Math.floor(i / MAP_SIZE);
        const gap = run + 4;
        state.roomSize = run;
        state.gap = gap;
        state.corner = [x % gap, y % gap];
        return true;
    }
    return false;
}

function scanMap(colors) {
    if (!state.corner && !findCorner(colors)) return;
    const [cx0, cy0] = state.corner;
    const size = state.roomSize;
    const gap = state.gap;
    const half = Math.floor(size / 2);

    const grid = [];
    const rooms = [];
    for (let cy = 0; cy < 6; cy++) {
        for (let cx = 0; cx < 6; cx++) {
            const x = cx0 + cx * gap;
            const y = cy0 + cy * gap;
            const color = px(colors, x + half, y + half + 1 + 4 - 4);
            const edge = px(colors, x + 1, y + 1);
            const roomColor = edge || color;
            if (roomColor === 0) continue;
            grid[cy * 6 + cx] = { cx, cy, roomColor, center: px(colors, x + half - 1, y + half + 1), room: null };
        }
    }

    const sameRoomRight = (c) => {
        const x = cx0 + c.cx * gap + size;
        const y = cy0 + c.cy * gap + 2;
        return px(colors, x + 1, y) !== 0 && px(colors, x + 1, y + size - 5) !== 0;
    };
    const sameRoomDown = (c) => {
        const x = cx0 + c.cx * gap + 2;
        const y = cy0 + c.cy * gap + size;
        return px(colors, x, y + 1) !== 0 && px(colors, x + size - 5, y + 1) !== 0;
    };

    for (const c of grid) {
        if (!c || c.room) continue;
        const room = { components: [], type: RoomTypes.UNKNOWN, checkmark: Checkmark.NONE, explored: true, secrets: 0 };
        const queue = [c];
        c.room = room;
        while (queue.length) {
            const cur = queue.shift();
            room.components.push([cur.cx, cur.cy]);
            const right = grid[cur.cy * 6 + cur.cx + 1];
            const down = grid[(cur.cy + 1) * 6 + cur.cx];
            if (right && cur.cx < 5 && !right.room && sameRoomRight(cur)) {
                right.room = room;
                queue.push(right);
            }
            if (down && !down.room && sameRoomDown(cur)) {
                down.room = room;
                queue.push(down);
            }
            const left = cur.cx > 0 ? grid[cur.cy * 6 + cur.cx - 1] : null;
            if (left && !left.room && sameRoomRight(left)) {
                left.room = room;
                queue.push(left);
            }
            const up = cur.cy > 0 ? grid[(cur.cy - 1) * 6 + cur.cx] : null;
            if (up && !up.room && sameRoomDown(up)) {
                up.room = room;
                queue.push(up);
            }
        }
        room.components.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        rooms.push(room);
    }

    for (const room of rooms) {
        const [fx, fy] = room.components[0];
        const x = cx0 + fx * gap;
        const y = cy0 + fy * gap;
        const roomColor = px(colors, x + 5, y + 5);
        const center = px(colors, x + half - 1, y + half + 1);
        const previous = state.rooms.find((r) => r.components[0][0] === fx && r.components[0][1] === fy);

        if (roomColor === 0 || roomColor === 85) {
            room.explored = false;
            room.type = previous ? previous.type : RoomTypes.UNKNOWN;
            room.checkmark = previous ? previous.checkmark : Checkmark.NONE;
            continue;
        }

        room.type = roomTypeFromColor(roomColor) ?? (previous ? previous.type : RoomTypes.NORMAL);
        if (room.components.length === 1 && room.type === RoomTypes.NORMAL && roomColor === 63) room.type = RoomTypes.NORMAL;

        let check = Checkmark.NONE;
        if (center === 30 && roomColor !== 30) check = Checkmark.GREEN;
        else if (center === 34) check = Checkmark.WHITE;
        else if (center === 18 && roomColor !== 18) check = Checkmark.FAILED;
        if (room.type === RoomTypes.BLOOD && check === Checkmark.NONE && previous) check = previous.checkmark;
        room.checkmark = check;
    }

    const doors = [];
    for (let dz = 0; dz < 11; dz++) {
        for (let dx = 0; dx < 11; dx++) {
            if ((dx + dz) % 2 === 0) continue;
            const odd = dx % 2 === 1;
            if (odd === (dz % 2 === 1)) continue;
            const x = cx0 + half + Math.floor(gap / 2) * dx;
            const y = cy0 + half + Math.floor(gap / 2) * dz;
            const color = px(colors, x, y);
            if (color === 0) continue;
            const a = odd ? grid[(dz / 2) * 6 + (dx - 1) / 2] : grid[((dz - 1) / 2) * 6 + dx / 2];
            const b = odd ? grid[(dz / 2) * 6 + (dx + 1) / 2] : grid[((dz + 1) / 2) * 6 + dx / 2];
            if (!a || !b || a.room === b.room) continue;
            let type = DoorTypes.NORMAL;
            if (color === 119) type = DoorTypes.WITHER;
            else if (color === 18) type = DoorTypes.BLOOD;
            else if (color === 30) type = DoorTypes.ENTRANCE;
            doors.push({ dx, dz, type, explored: color !== 85 });
        }
    }

    state.rooms = rooms;
    state.doors = doors;
    state.fullyScanned = rooms.length > 0;
}

const SAMPLE = {
    rooms: [
        { components: [[2, 5]], type: RoomTypes.ENTRANCE, checkmark: Checkmark.GREEN, explored: true },
        { components: [[2, 4]], type: RoomTypes.NORMAL, checkmark: Checkmark.WHITE, explored: true },
        { components: [[1, 4], [1, 3]], type: RoomTypes.PUZZLE, checkmark: Checkmark.NONE, explored: true },
        { components: [[3, 4]], type: RoomTypes.TRAP, checkmark: Checkmark.NONE, explored: false },
        { components: [[2, 3], [3, 3]], type: RoomTypes.YELLOW, checkmark: Checkmark.NONE, explored: false },
        { components: [[2, 2]], type: RoomTypes.BLOOD, checkmark: Checkmark.NONE, explored: false },
    ],
    doors: [
        { dx: 4, dz: 9, type: DoorTypes.NORMAL, explored: true },
        { dx: 3, dz: 8, type: DoorTypes.NORMAL, explored: true },
        { dx: 5, dz: 8, type: DoorTypes.WITHER, explored: false },
        { dx: 4, dz: 5, type: DoorTypes.BLOOD, explored: false },
    ],
    info: { secrets: 12, crypts: 5, deaths: 0, score: 300, mimic: false, secretsLine: '' },
};

class IllegalMap extends ModuleBase {
    constructor() {
        super({
            name: 'Dungeon Map',
            subcategory: 'Catacombs',
            description: 'IllegalMap port: legit dungeon map with room colours, checkmarks, doors, player heads and run info.',
            autoDisableOnWorldUnload: false,
        });

        this.cfg = {
            background: argb(0, 0, 0, 120),
            checkmarks: true,
            heads: true,
            names: true,
            info: true,
            darken: true,
            hideInBoss: false,
            roomLabels: true,
            doorsOn: true,
            witherColor: argb(0, 0, 0),
        };

        this.addToggle('Show Checkmarks', (v) => (this.cfg.checkmarks = v), 'Draw room clear checkmarks', true);
        this.addToggle('Show Player Heads', (v) => (this.cfg.heads = v), 'Draw player heads on the map', true);
        this.addToggle('Show Player Names', (v) => (this.cfg.names = v), 'Draw names under heads', true);
        this.addToggle('Show Doors', (v) => (this.cfg.doorsOn = v), 'Draw doors between rooms', true);
        this.addToggle('Show Dungeon Info', (v) => (this.cfg.info = v), 'Secrets, crypts, deaths and score under the map', true);
        this.addToggle('Darken Unexplored', (v) => (this.cfg.darken = v), 'Dim rooms you have not visited', true);
        this.addToggle('Hide In Boss', (v) => (this.cfg.hideInBoss = v), 'Hide the map once the boss fight starts', false);
        this.addColorPicker(
            'Background Color',
            new java.awt.Color(0, 0, 0, 120),
            (c) => (this.cfg.background = argb(c.getRed(), c.getGreen(), c.getBlue(), c.getAlpha())),
            'Map background colour and opacity'
        );

        OverlayManager.dungeonMapRenderer = (x, y, scale) => this.renderMap(SAMPLE.rooms, SAMPLE.doors, SAMPLE.info, x, y, scale, false);

        this.on('step', () => this.update()).setFps(4);
        this.on('renderOverlay', () => this.draw());
        register('worldUnload', () => resetState());
        register('command', () => {
            const lines = [
                'inDungeon=' + state.inDungeon + ' floor=' + state.floor + ' module enabled=' + this.enabled,
                'map item found=' + dbg.mapFound + ' mapId=' + dbg.mapId + ' colors=' + dbg.colors,
                'corner=' + JSON.stringify(state.corner) + ' roomSize=' + state.roomSize + ' gap=' + state.gap,
                'rooms=' + state.rooms.length + ' doors=' + state.doors.length + ' fullyScanned=' + state.fullyScanned,
                'overlay enabled=' + OverlayManager.dungeonMapSettings.enabled + ' x=' + OverlayManager.dungeonMapSettings.x + ' y=' + OverlayManager.dungeonMapSettings.y,
                'lastError=' + (dbg.lastError || 'none'),
            ];
            lines.forEach((l) => ChatLib.chat('&b[Dungeon Map] &f' + l));
        }).setName('dmapdebug');
    }

    update() {
        try {
            updateDungeonInfo();
            if (!state.inDungeon) {
                if (state.rooms.length) resetState();
                return;
            }
            const colors = findMapColors();
            if (colors) scanMap(colors);
        } catch (e) {
            reportError('update', e);
        }
    }

    draw() {
        try {
            const pos = OverlayManager.dungeonMapSettings;
            if (pos.enabled === false || Overlays.Gui.isOpen()) return;
            if (!state.inDungeon || !state.fullyScanned) return;
            if (this.cfg.hideInBoss && state.bossEntry) return;
            this.renderMap(state.rooms, state.doors, state.info, pos.x, pos.y, pos.scale || 1, true);
        } catch (e) {
            reportError('draw', e);
        }
    }

    renderMap(rooms, doors, info, x0, y0, scale, live) {
        try {
            const cell = 5 * scale;
            const unit = (v) => v * cell;
            const w = MAP_PX * scale;

            if ((this.cfg.background >>> 24) > 0) Render2D.drawRect(x0, y0, w, w, this.cfg.background);

            for (const room of rooms) {
                const [r, g, b] = ROOM_RGB[room.type] || ROOM_RGB[RoomTypes.UNKNOWN];
                const alpha = !room.explored && this.cfg.darken ? 110 : 255;
                const col = argb(r, g, b, alpha);
                const set = new Set(room.components.map((c) => c[0] + ',' + c[1]));
                for (const [cx, cy] of room.components) {
                    const rx = x0 + unit(1 + cx * 4);
                    const ry = y0 + unit(1 + cy * 4);
                    Render2D.drawRect(rx, ry, unit(3), unit(3), col);
                    if (set.has(cx + 1 + ',' + cy)) Render2D.drawRect(rx + unit(3), ry, unit(1), unit(3), col);
                    if (set.has(cx + ',' + (cy + 1))) Render2D.drawRect(rx, ry + unit(3), unit(3), unit(1), col);
                    if (set.has(cx + 1 + ',' + cy) && set.has(cx + ',' + (cy + 1)) && set.has(cx + 1 + ',' + (cy + 1)))
                        Render2D.drawRect(rx + unit(3), ry + unit(3), unit(1), unit(1), col);
                }
                const [fx, fy] = room.components[0];
                const mx = x0 + unit(1 + fx * 4 + 0.5);
                const my = y0 + unit(1 + fy * 4 + 0.5);
                if (this.cfg.checkmarks && room.checkmark !== Checkmark.NONE) {
                    if (room.checkmark === Checkmark.GREEN) drawCheck(mx, my, unit(2), argb(85, 255, 85));
                    else if (room.checkmark === Checkmark.WHITE) drawCheck(mx, my, unit(2), argb(255, 255, 255));
                    else drawCross(mx, my, unit(2), argb(255, 60, 60));
                } else if (!room.explored && room.type !== RoomTypes.UNKNOWN) {
                    shadowText('?', x0 + unit(1 + fx * 4 + 1.5), y0 + unit(1 + fy * 4 + 1.5), unit(2.4), argb(220, 220, 220), 18);
                }
            }

            if (this.cfg.doorsOn) {
                for (const d of doors) {
                    let c = argb(107, 58, 17);
                    if (d.type === DoorTypes.WITHER) c = argb(0, 0, 0);
                    else if (d.type === DoorTypes.BLOOD) c = argb(255, 0, 0);
                    else if (d.type === DoorTypes.ENTRANCE) c = argb(20, 133, 0);
                    if (!d.explored) c = argb(70, 40, 12, 140);
                    const odd = d.dx % 2 === 1;
                    const rx = x0 + unit(1 + Math.floor(d.dx / 2) * 4 + (odd ? 3 : 1));
                    const ry = y0 + unit(1 + Math.floor(d.dz / 2) * 4 + (odd ? 1 : 3));
                    Render2D.drawRect(rx, ry, unit(1), unit(1), c);
                }
            }

            if (this.cfg.heads && live) this.drawPlayers(x0, y0, w, scale);

            if (this.cfg.info) {
                const size = 6 * scale + 2;
                shadowText('Secrets: ' + info.secrets + '   Crypts: ' + info.crypts, x0, y0 + w + size, size, argb(255, 255, 255));
                const scoreColor = info.score >= 300 ? argb(85, 255, 85) : info.score >= 270 ? argb(255, 255, 85) : argb(255, 85, 85);
                shadowText('Deaths: ' + info.deaths + '   Score: ' + info.score, x0, y0 + w + size * 2.2, size, scoreColor);
            }
        } catch (e) {
            reportError('render', e);
        }
    }

    drawPlayers(x0, y0, w, scale) {
        const players = World.getAllPlayers();
        for (const p of players) {
            const name = p.getName();
            const x = p.getX();
            const z = p.getZ();
            if (x < DUNGEON_MIN || x > DUNGEON_MAX || z < DUNGEON_MIN || z > DUNGEON_MAX) continue;
            if (!/^\w{1,16}$/.test(name)) continue;
            const mx = x0 + ((x - DUNGEON_MIN) / (DUNGEON_MAX - DUNGEON_MIN)) * w;
            const my = y0 + ((z - DUNGEON_MIN) / (DUNGEON_MAX - DUNGEON_MIN)) * w;
            const size = 8 * scale;
            Render2D.drawImageFromUrl('https://mc-heads.net/avatar/' + name + '/32', mx - size / 2, my - size / 2, size, size, 2);
            if (this.cfg.names) {
                const ts = 5 * scale + 2;
                shadowText(name, mx - getTextWidth(name, ts) / 2, my + size / 2 + ts / 2 + 1, ts, argb(255, 255, 255));
            }
        }
    }
}

try {
    new IllegalMap();
} catch (e) {
    console.error('[IllegalMap] failed to initialise: ' + e + (e && e.stack ? '\n' + e.stack : ''));
}
