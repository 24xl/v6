// The six F7 terminals, ported from NoammAddons (floor7/terminals/impl/*.kt).
//
// Everything here is pure logic: it never touches Minecraft. Items are plain descriptors
//   { id: 'minecraft:red_stained_glass_pane', name: 'Display Name', count: 3, glint: false }
// and "items" is a Map of slot -> descriptor. An in-game adapter turns real ItemStacks into descriptors.

export const EMPTY_ITEM = { id: 'minecraft:air', name: '', count: 0, glint: false };

export const makeClick = (slotId, btn = 0) => ({ slotId, btn });
export const sameClick = (a, b) => a.slotId === b.slotId && a.btn === b.btn;

const pane = (color) => 'minecraft:' + color + '_stained_glass_pane';
const PANE_BLACK = pane('black');
const PANE_RED = pane('red');
const PANE_LIME = pane('lime');
const PANE_MAGENTA = pane('magenta');

// Items whose default components force an enchantment glint. Noam builds this from the item registry
// at runtime plus the golden apple; the in-game adapter must call setSpecialGlintItems with the real list.
let specialGlintItems = new Set(['minecraft:golden_apple']);
export const setSpecialGlintItems = (ids) => {
    specialGlintItems = new Set(ids);
    specialGlintItems.add('minecraft:golden_apple');
};

// Slot order matters (Noam iterates a map that is ascending by slot).
const sortedEntries = (items) => Array.from(items.entries()).sort((a, b) => a[0] - b[0]);

class TerminalBase {
    constructor(spec) {
        this.titleRegex = spec.titleRegex;
        this.slotCount = spec.slotCount;
        this.gridSize = spec.gridSize;
        this.displayName = spec.displayName;
        this.trackProgress = spec.trackProgress !== false;
        this.solution = [];
        this.totalClicks = -1;
    }

    solve(items, title, updatedSlot, updatedItem) {
        this.solution.length = 0;
        if (!this.onSlotUpdate(items, title, updatedSlot, updatedItem)) return false;
        if (this.trackProgress) this.refreshProgress();
        return true;
    }

    onSlotUpdate() {
        return true;
    }

    onSlotClick() {}

    getClickForSlot(slot) {
        return this.solution.find((click) => click.slotId === slot) ?? null;
    }

    predict(click) {
        const index = this.solution.findIndex((candidate) => sameClick(candidate, click));
        if (index !== -1) this.solution.splice(index, 1);
    }

    reset() {
        this.solution.length = 0;
        this.totalClicks = -1;
    }

    remainingClicks() {
        return this.solution.length;
    }

    maxClicks() {
        return this.totalClicks > 0 ? this.totalClicks : null;
    }

    completedClicks() {
        return this.totalClicks === -1 ? 0 : this.totalClicks - this.remainingClicks();
    }

    refreshProgress() {
        if (this.totalClicks === -1) this.totalClicks = this.remainingClicks();
    }
}

class NumbersTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^Click in order!$/, displayName: 'Numbers', gridSize: [5, 2], slotCount: 36 });
        this.slotCounts = new Map();
    }

    onSlotUpdate(items) {
        const reds = sortedEntries(items)
            .filter((entry) => entry[1].id === PANE_RED)
            .map((entry, index) => ({ slot: entry[0], count: entry[1].count, index }))
            .sort((a, b) => a.count - b.count || a.index - b.index);

        for (const red of reds) {
            this.slotCounts.set(red.slot, red.count);
            this.solution.push(makeClick(red.slot));
        }
        return true;
    }

    getClickForSlot(slot) {
        const first = this.solution[0];
        return first && first.slotId === slot ? first : null;
    }

    reset() {
        super.reset();
        this.slotCounts.clear();
    }
}

const DYE_COLORS = ['WHITE', 'ORANGE', 'MAGENTA', 'LIGHT_BLUE', 'YELLOW', 'LIME', 'PINK', 'GRAY', 'LIGHT_GRAY', 'CYAN', 'PURPLE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'BLACK'];

const validPrefixes = (color) => {
    switch (color) {
        case 'BLACK':
            return ['black', 'ink'];
        case 'BLUE':
            return ['blue', 'lapis'];
        case 'BROWN':
            return ['brown', 'cocoa'];
        case 'WHITE':
            return ['white', 'bone', 'wool'];
        case 'GREEN':
            return ['green', 'cactus'];
        case 'RED':
            return ['red', 'rose'];
        case 'YELLOW':
            return ['yellow', 'dandelion'];
        case 'LIGHT_GRAY':
            return ['silver', 'light gray'];
        default:
            return [color.toLowerCase().split('_').join(' ')];
    }
};

class ColorsTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^Select all the ([\w ]+) items!$/, displayName: 'Colors', gridSize: [7, 4], slotCount: 54 });
    }

    onSlotUpdate(items, title) {
        const match = this.titleRegex.exec(title);
        if (!match) return false;

        const wanted = match[1].split('SILVER').join('LIGHT GRAY').toLowerCase();
        const color = DYE_COLORS.find((name) => name.split('_').join(' ').toLowerCase() === wanted);
        if (color === undefined) return false;

        const prefixes = validPrefixes(color);
        for (const entry of sortedEntries(items)) {
            const stack = entry[1];
            if (stack.id === PANE_BLACK) continue;
            if (stack.glint) continue;
            const name = stack.name.toLowerCase();
            if (prefixes.some((prefix) => name.startsWith(prefix))) this.solution.push(makeClick(entry[0]));
        }
        return true;
    }
}

class RedGreenTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^Correct all the panes!$/, displayName: 'Red Green', gridSize: [5, 3], slotCount: 45 });
    }

    onSlotUpdate(items) {
        for (const entry of sortedEntries(items)) {
            if (entry[1].id === PANE_RED) this.solution.push(makeClick(entry[0]));
        }
        return true;
    }
}

class StartWithTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^What starts with: '(\w)'\?$/, displayName: 'Starts With', gridSize: [7, 3], slotCount: 45 });
        this.solved = new Set();
        this.clicked = new Set();
    }

    onSlotUpdate(items, title, updatedSlot) {
        const match = this.titleRegex.exec(title);
        if (!match) return false;
        const letter = match[1].toLowerCase();

        if (this.clicked.delete(updatedSlot)) this.solved.add(updatedSlot);

        for (const entry of sortedEntries(items)) {
            const index = entry[0];
            const stack = entry[1];
            if (!stack.name.toLowerCase().startsWith(letter)) continue;
            if (this.solved.has(index)) continue;
            if (!stack.glint || specialGlintItems.has(stack.id)) this.solution.push(makeClick(index));
        }
        return true;
    }

    onSlotClick(slot) {
        this.clicked.add(slot);
    }

    reset() {
        super.reset();
        this.solved.clear();
        this.clicked.clear();
    }

    getClickForSlot(slot) {
        const click = super.getClickForSlot(slot);
        return click && !this.solved.has(click.slotId) ? click : null;
    }
}

const RUBIX_ORDER = ['red', 'orange', 'yellow', 'green', 'blue'].map(pane);
const RUBIX_SLOTS = [12, 13, 14, 21, 22, 23, 30, 31, 32];

class RubixTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^Change all to same color!$/, displayName: 'Rubix', gridSize: [3, 3], slotCount: 45 });
    }

    onSlotUpdate(items) {
        const panes = sortedEntries(items).filter((entry) => RUBIX_SLOTS.includes(entry[0]) && RUBIX_ORDER.includes(entry[1].id));

        const costs = [0, 0, 0, 0, 0];
        for (let i = 0; i < 5; i++) {
            for (const entry of panes) {
                const itemIndex = RUBIX_ORDER.indexOf(entry[1].id);
                const dist = Math.abs(i - itemIndex);
                costs[i] += dist > 2 ? 5 - dist : dist;
            }
        }

        let origin = 0;
        for (let i = 1; i < 5; i++) if (costs[i] < costs[origin]) origin = i;

        for (const entry of panes) {
            const currentIndex = RUBIX_ORDER.indexOf(entry[1].id);
            if (currentIndex === origin) continue;
            let diff = origin - currentIndex;
            if (diff > 2) diff -= 5;
            if (diff < -2) diff += 5;
            this.solution.push(makeClick(entry[0], diff));
        }
        return true;
    }

    remainingClicks() {
        return this.solution.reduce((sum, click) => sum + Math.abs(click.btn), 0);
    }

    getClickForSlot(slot) {
        const found = this.solution.find((click) => click.slotId === slot);
        return found ? makeClick(slot, found.btn > 0 ? 0 : 1) : null;
    }

    predict(click) {
        const index = this.solution.findIndex((candidate) => candidate.slotId === click.slotId);
        if (index === -1) return;
        const change = click.btn === 0 ? -1 : 1;
        const newDiff = this.solution[index].btn + change;
        if (newDiff === 0) this.solution.splice(index, 1);
        else this.solution[index] = makeClick(click.slotId, newDiff);
    }
}

class MelodyTerminal extends TerminalBase {
    constructor() {
        super({ titleRegex: /^Click the button on time!$/, displayName: 'Melody', gridSize: [6, 3], slotCount: 54, trackProgress: false });
        this.claySlots = [16, 25, 34];
        this.buttonRow = null;
        this.current = null;
        this.correct = null;
    }

    onSlotUpdate(items, title, updatedSlot, updatedItem) {
        if (updatedItem.id !== PANE_LIME) return true;

        let newCorrect = null;
        for (const entry of sortedEntries(items)) {
            if (entry[1].id === PANE_MAGENTA) {
                newCorrect = entry[0] - 1;
                break;
            }
        }

        this.buttonRow = Math.floor(updatedSlot / 9) - 1;
        this.current = (updatedSlot % 9) - 1;
        if (newCorrect !== null) this.correct = newCorrect;
        return true;
    }

    getClickForSlot(slot) {
        const clay = this.claySlots[slot];
        return clay === undefined ? null : makeClick(clay);
    }

    maxClicks() {
        return this.gridSize[1];
    }

    completedClicks() {
        return this.buttonRow ?? 0;
    }

    reset() {
        super.reset();
        this.buttonRow = null;
        this.current = null;
        this.correct = null;
    }
}

export const NumberTerminal = new NumbersTerminal();
export const ColorsTerm = new ColorsTerminal();
export const RedGreenTerm = new RedGreenTerminal();
export const StartWithTerm = new StartWithTerminal();
export const RubixTerm = new RubixTerminal();
export const MelodyTerm = new MelodyTerminal();

export const ALL_TERMINALS = [NumberTerminal, ColorsTerm, MelodyTerm, RubixTerm, RedGreenTerm, StartWithTerm];

export const terminalFromTitle = (title) => ALL_TERMINALS.find((terminal) => terminal.titleRegex.test(title)) ?? null;
