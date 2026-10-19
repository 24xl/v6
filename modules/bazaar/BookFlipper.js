import requestV2 from '../../utils/Request';
import { DataComponents } from '../../utils/Constants';
import { getModule } from '../../utils/MacroState';
import { ModuleBase } from '../../utils/ModuleBase';
import { setSignLine } from '../../utils/Sign';
import { v5Command } from '../../utils/V5Commands';
import { clickSlot, closeInventory, getGuiName } from '../../utils/player/Inventory';
import { Recovery } from '../../utils/AutoRecovery';
import { readEnchantingFromContainer } from '../../utils/Skills';

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const COMMAND_CAPACITY = 10;
const COMMAND_RESTORE_TIME = 1_050;
const GUI_TIMEOUT = 10_000;
const STUCK_RETRY_DELAY = 1_000;
const REFRESH_MS = 60_000;
const FAIL_RETRY_MS = 30_000;
const SELL_TIER = 5;
const MAX_CLAIMS = 8;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const BOOK_LIMIT = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const BOOKS = [
    { key: 'rejuvenate', idPrefix: 'ENCHANTMENT_REJUVENATE_', name: 'Rejuvenate', names: ['Rejuvenate'], buyTiers: [1, 2, 3], required: 10 },
    { key: 'ultimate_wisdom', idPrefix: 'ENCHANTMENT_ULTIMATE_WISDOM_', name: 'Wisdom', names: ['Wisdom', 'Ultimate Wisdom'], buyTiers: [1, 2], required: 27 },
];
const bookId = (book, level) => `${book.idPrefix}${level}`;
const bookName = (book, level) => `${book.name} ${ROMAN[level - 1]}`;
const unitsFor = (input) => 2 ** (SELL_TIER - input);

const clean = (value) =>
    ChatLib.removeFormatting(String(value ?? ''))
        .trim()
        .replace(/^[^a-z0-9]+/i, '')
        .toLowerCase();
const lore = (item) => (item?.getLore?.() ?? []).map((line) => ChatLib.removeFormatting(String(line)).trim());
const formatCoins = (value) => {
    const unit = [
        { minimum: 1e9, suffix: 'B' },
        { minimum: 1e6, suffix: 'M' },
        { minimum: 1e3, suffix: 'K' },
    ].find((entry) => Math.abs(value) >= entry.minimum);
    return unit ? `${(value / unit.minimum).toFixed(2)}${unit.suffix}` : Math.round(value).toLocaleString();
};
const bidPrice = (product) => Number(product?.quick_status?.sellPrice) || 0;
const askPrice = (product) => Number(product?.quick_status?.buyPrice) || 0;
const bookFromText = (text) => {
    const value = clean(text);
    for (const book of BOOKS) {
        for (const name of book.names) {
            const prefix = clean(name);
            if (!value.startsWith(`${prefix} `)) continue;
            const rest = value.slice(prefix.length + 1).trim().split(/\s+/)[0];
            const index = BOOK_LIMIT.indexOf(rest);
            if (index !== -1) return { book, level: index + 1 };
        }
    }
    return null;
};
const bookFromItem = (item) => {
    if (!item) return null;
    for (const line of lore(item)) {
        const info = bookFromText(line);
        if (info) return info;
    }
    return bookFromText(item.getName?.());
};

class BookFlipper extends ModuleBase {
    constructor() {
        super({
            name: 'Book Flipper',
            subcategory: 'Bazaar',
            description: 'Cleans up, then buys Rejuvenate I/II/III and Wisdom I/II, combines to V, and sells the V books.',
            tooltip: 'Requires Cookie Buff and the Auto Combine module. Empty your inventory first. Wisdom needs Enchanting 27.',
            isMacro: true,
        });
        this.bindToggleKey();

        this.clickDelay = 350;
        this.addSlider('Click Delay (ms)', 50, 2_000, 350, (value) => (this.clickDelay = value), 'Delay between Bazaar clicks.');
        this.maxBuyOrders = 8;
        this.addSlider('Order Limit', 1, 28, 8, (value) => (this.maxBuyOrders = Math.round(value)), 'Maximum active buy orders (all books).');
        this.budget = 10_000_000;
        this.addSlider('Per-Order Budget (M)', 0.1, 100, 10, (value) => (this.budget = value * 1_000_000), 'Max coins per buy order (also capped by your purse).');
        this.taxPercent = 1.25;
        this.addSlider('Bazaar Tax (%)', 0, 3, 1.25, (value) => (this.taxPercent = value), 'Bazaar sell tax.');
        this.undercutPercent = 0.1;
        this.addSlider('Undercut (%)', 0, 5, 0.1, (value) => (this.undercutPercent = value), 'How far below the lowest sell offer to list.');
        this.minProfit = 0;
        this.addSlider('Min Profit per V', 0, 10_000_000, 0, (value) => (this.minProfit = value), 'Minimum coins profit per finished level V book.');
        this.skillGate = true;
        this.addToggle('Enchanting Skill Gate', (value) => (this.skillGate = !!value), 'Skip enchants whose required Enchanting level is above yours.', true);
        this.cleanOnEnable = true;
        this.addToggle('Clean Orders On Enable', (value) => (this.cleanOnEnable = !!value), 'Cancel/claim/combine existing book orders before trading.', true);
        this.addButton('Refresh Prices', () => this.setAction(this.fetchPrices, 'Refreshing', 0, 25_000), 'Re-fetch Bazaar prices now.');
        this.addButton('Read Enchanting', () => this.setAction(this.readSkills, 'Reading Enchanting', 0, 15_000), 'Re-read your Enchanting level from /skills.');

        this.createOverlay([
            {
                title: 'Book Flipper',
                data: {
                    State: () => this.status,
                    Enchanting: () => (this.enchantingLevel == null ? '—' : `${this.enchantingLevel}`),
                    Purse: () => {
                        const purse = this.readPurse();
                        return purse == null ? '—' : formatCoins(purse);
                    },
                    Books: () => this.enabledBooks().map((book) => book.name).join(', ') || '—',
                },
            },
            {
                title: 'Next',
                data: {
                    Book: () => (this.target ? this.target.name : 'None'),
                    Buy: () => (this.target && this.target.orderPrice ? `${formatCoins(this.target.orderPrice)}` : '—'),
                    Orders: () => `${this.activeTargets.length}/${this.maxBuyOrders}`,
                    'To Sell': () => this.enabledBooks().map((book) => `${book.name[0]}V x${this.countLevel(book, SELL_TIER)}`).join(' '),
                },
            },
        ]);

        this.commandTokens = COMMAND_CAPACITY;
        this.commandRefillAt = Date.now();
        this.on('tick', () => this.tick());
        this.on('chat', (event) => this.onChat(event));
        v5Command('bazaar books', () => this.report());
        this.reset();
    }

    onEnable() {
        this.reset();
        Recovery.setActive(true);
        this.message('&aEnabled');
        if (!Recovery.isReady()) {
            this.pendingEnable = true;
            this.status = 'Recovering';
            this.message('&eNot on your island yet; recovering before starting...');
            return;
        }
        this.finishEnable();
    }

    finishEnable() {
        const inventory = Player.getInventory();
        if (!inventory) return this.fail('Could not snapshot your inventory.');
        const dirty = inventory.getItems().slice(0, 36).some((item) => item && item.getStackSize() > 0 && !clean(item.getName()).startsWith('skyblock menu'));
        if (dirty && this.toggleContext === 'user') return this.fail('Empty your inventory before enabling the macro.');
        if (dirty) this.message('&eInventory not empty; resuming with current inventory.');
        this.startingInventory = this.inventorySnapshot(inventory.getItems());
        this.lastCheckedInventory = this.startingInventory;
        this.inventoryReady = true;
        this.cleanupPhase = this.cleanOnEnable ? 'buys' : null;
        this.setAction(this.readSkills, 'Reading Enchanting', 0, 15_000);
    }

    onDisable() {
        Recovery.setActive(false);
        const combine = getModule('Auto Combine');
        if (this.combining && combine?.enabled) combine.toggle(false);
        this.requestToken++;
        closeInventory();
        this.reset();
        this.message('&cDisabled');
    }

    reset() {
        this.action = null;
        this.status = 'Idle';
        this.target = null;
        this.orderQueue = [];
        this.activeTargets = [];
        this.orderCheckQueue = [];
        this.sellCheckQueue = [];
        this.openBuyOrders = [];
        this.openSellOrders = [];
        this.openOrderCount = 0;
        this.orderLimitReached = false;
        this.orderPricesChecked = false;
        this.cancelQuantity = 0;
        this.confirmSlot = -1;
        this.placingSell = false;
        this.bazaarData = null;
        this.enchantingLevel = null;
        this.skillReadAttempts = 0;
        this.recovering = false;
        this.pendingEnable = false;
        this.combining = false;
        this.afterCombine = null;
        this.cleanupPhase = null;
        this.claimNoSpace = false;
        this.claimedSlots = new Set();
        this.inventoryReady = false;
        this.startingInventory = new Map();
        this.lastCheckedInventory = new Map();
        this.orderCooldownUntil = 0;
        this.orderMissingSince = 0;
        this.nextActionAt = 0;
        this.deadline = 0;
        this.retryAction = null;
        this.retryAt = 0;
        this.requestToken = (this.requestToken || 0) + 1;
    }

    enabledBooks() {
        return BOOKS.filter((book) => !this.skillGate || (this.enchantingLevel != null && this.enchantingLevel >= book.required));
    }

    readPurse() {
        try {
            for (const line of (Scoreboard.getLines() || [])) {
                const text = ChatLib.removeFormatting(String(line));
                const match = text.match(/(?:Purse|Piggy):\s*([\d,]+)/i);
                if (match) return Number(match[1].replace(/,/g, ''));
            }
        } catch (error) {}
        return null;
    }

    tick() {
        if (!Recovery.isReady()) {
            if (!this.recovering) {
                this.recovering = true;
                this.status = 'Recovering';
                this.action = null;
                this.retryAction = null;
                closeInventory();
            }
            return;
        }
        if (this.recovering) {
            this.recovering = false;
            if (this.pendingEnable) {
                this.pendingEnable = false;
                this.finishEnable();
            } else {
                this.restart('Back on your island.');
            }
            return;
        }
        try {
            const now = Date.now();
            if (this.deadline && now >= this.deadline) return this.restart(`Timed out while ${this.status.toLowerCase()}.`);
            if (this.retryAction && now >= this.retryAt) {
                this.retryAt = now + STUCK_RETRY_DELAY;
                this.nextActionAt = now + this.clickDelay;
                this.retryAction.call(this);
                return;
            }
            if (now < this.nextActionAt) return;
            if (this.action) this.action.call(this);
        } catch (error) {
            console.error('[BookFlipper] tick error: ' + error);
            this.restart('Error; retrying.');
        }
    }

    setAction(action, status, delay = this.clickDelay, timeout = GUI_TIMEOUT, retryAction = null) {
        this.action = action;
        this.status = status;
        this.nextActionAt = Date.now() + delay;
        this.deadline = timeout ? Date.now() + timeout : 0;
        this.retryAction = retryAction;
        this.retryAt = retryAction ? Date.now() + STUCK_RETRY_DELAY : 0;
    }

    clickAndWait(slot, action, status, delay = this.clickDelay, timeout = GUI_TIMEOUT) {
        const gui = clean(getGuiName());
        const item = clean(Player.getContainer()?.getStackInSlot(slot)?.getName?.());
        const click = () => {
            if (clean(getGuiName()) === gui && clean(Player.getContainer()?.getStackInSlot(slot)?.getName?.()) === item) clickSlot(slot);
        };
        this.setAction(action, status, delay, timeout, click);
        click();
    }

    commandAndWait(command, action, status, delay = 0, timeout = GUI_TIMEOUT) {
        const previousGui = getGuiName();
        const run = () => {
            const wait = this.runCommand(command);
            if (wait) return this.setAction(run, status, wait, 0);
            this.setAction(waitForGui, status, delay, timeout, retry);
        };
        const waitForGui = () => {
            action.call(this);
            if (this.action === waitForGui || !this.retryAction) return;
            const nextRetry = this.retryAction;
            this.retryAction = () => {
                const nextAction = this.action;
                nextRetry?.call(this);
                if (this.action === nextAction && getGuiName() === previousGui) run();
            };
            this.retryAt = Date.now() + STUCK_RETRY_DELAY;
        };
        const retry = () => {
            waitForGui();
            if (this.action === waitForGui && this.retryAction === retry) run();
        };
        run();
    }

    runCommand(command) {
        const now = Date.now();
        const restored = Math.floor((now - this.commandRefillAt) / COMMAND_RESTORE_TIME);
        if (restored) {
            this.commandTokens = Math.min(COMMAND_CAPACITY, this.commandTokens + restored);
            this.commandRefillAt = this.commandTokens === COMMAND_CAPACITY ? now : this.commandRefillAt + restored * COMMAND_RESTORE_TIME;
        }
        if (!this.commandTokens) return COMMAND_RESTORE_TIME - (now - this.commandRefillAt);
        this.commandTokens--;
        ChatLib.command(command);
        return 0;
    }

    readSkills() {
        const gui = clean(getGuiName());
        if (gui.includes('skill')) {
            try {
                const result = readEnchantingFromContainer(Player.getContainer());
                if (result?.level != null) {
                    this.enchantingLevel = result.level;
                    console.log(`[BookFlipper] Enchanting=${result.level}`);
                }
            } catch (error) {
                console.error('[BookFlipper] skills read error: ' + error);
            }
            try {
                closeInventory();
            } catch (error) {}
            this.setAction(this.fetchPrices, 'Fetching bazaar', 300, 25_000);
            return;
        }
        this.skillReadAttempts++;
        if (this.skillReadAttempts > 4) {
            console.log('[BookFlipper] could not open /skills; skill gate disabled');
            this.setAction(this.fetchPrices, 'Fetching bazaar', 0, 25_000);
            return;
        }
        const wait = this.runCommand('skills');
        this.setAction(this.readSkills, 'Opening skills', wait || 800, 15_000);
    }

    fetchPrices() {
        this.setAction(null, 'Loading prices', 0, 25_000);
        const token = ++this.requestToken;
        const retry = () => this.setAction(this.fetchPrices, 'Retrying', FAIL_RETRY_MS, 0);
        requestV2({ url: BAZAAR_URL, method: 'GET', json: true, timeout: 10_000 })
            .then((bazaar) => {
                if (!this.enabled || token !== this.requestToken) return;
                if (!bazaar?.success) {
                    this.fail('Could not load Hypixel Bazaar prices.');
                    retry();
                    return;
                }
                this.bazaarData = bazaar;
                this.orderQueue = this.computeFlips(bazaar);
                this.openOrders();
            })
            .catch((error) => {
                console.error('[BookFlipper] fetch error: ' + error);
                if (this.enabled && token === this.requestToken) {
                    this.fail('Could not load Hypixel Bazaar prices.');
                    retry();
                }
            });
    }

    computeFlips(bazaar) {
        const products = bazaar?.products || {};
        const purse = this.readPurse();
        const candidates = [];
        for (const book of this.enabledBooks()) {
            const outProduct = products[bookId(book, SELL_TIER)];
            const outAsk = askPrice(outProduct);
            if (outAsk <= 0) continue;
            const revenuePerV = outAsk * (1 - this.undercutPercent / 100) * (1 - this.taxPercent / 100);
            for (const input of book.buyTiers) {
                const inProduct = products[bookId(book, input)];
                if (!inProduct) continue;
                const price = Math.ceil((askPrice(inProduct) + 0.1) * 10) / 10;
                if (price <= 0) continue;
                const units = unitsFor(input);
                const profitPerV = revenuePerV - price * units;
                if (profitPerV < this.minProfit) continue;
                candidates.push({
                    book,
                    id: bookId(book, input),
                    name: bookName(book, input),
                    input,
                    units,
                    orderPrice: price,
                    expectedOrderPrice: price,
                    profitPerV,
                    profitPerHour: profitPerV * ((Number(outProduct?.quick_status?.buyMovingWeek) || 0) / 168),
                });
            }
        }
        candidates.sort((a, b) => b.profitPerHour - a.profitPerHour);
        let available = purse != null ? Math.floor(purse * 0.98) : Number.MAX_SAFE_INTEGER;
        const chosen = [];
        for (const candidate of candidates) {
            if (chosen.length >= this.maxBuyOrders) break;
            if (available <= 0) break;
            const funds = Math.min(this.budget, available);
            const maxQuantity = Math.floor(funds / candidate.orderPrice);
            const quantity = Math.floor(maxQuantity / candidate.units) * candidate.units;
            if (quantity < candidate.units) continue;
            candidate.quantity = quantity;
            candidate.outputCount = quantity / candidate.units;
            candidate.profit = candidate.profitPerV * candidate.outputCount;
            chosen.push(candidate);
            available -= quantity * candidate.orderPrice;
        }
        return chosen;
    }

    openOrders() {
        this.orderPricesChecked = false;
        this.sellCheckQueue = [];
        this.claimNoSpace = false;
        this.claimedSlots = new Set();
        this.commandAndWait('managebazaarorders', this.inspectOrder, 'Opening Bazaar orders');
    }

    inspectOrder() {
        if (!clean(getGuiName()).includes('bazaar orders')) return;
        this.scanOpenOrders();
        this.adoptOpenOrders();
        this.reconcileOrders();

        const claimSlot = this.findClaimSlot();
        if (claimSlot !== -1) {
            this.claimedSlots.add(claimSlot);
            clickSlot(claimSlot);
            this.setAction(this.inspectOrder, 'Claiming books', Math.max(250, this.clickDelay), GUI_TIMEOUT);
            return;
        }

        if (this.cleanupPhase) return this.cleanupStep();

        if (!this.orderPricesChecked) {
            this.orderPricesChecked = true;
            this.orderCheckQueue = [...this.activeTargets];
            return this.checkNextOrder();
        }

        this.finishCycle();
    }

    cleanupStep() {
        if (this.cleanupPhase === 'buys') {
            const target = this.activeTargets[0];
            if (target) {
                this.target = target;
                const slot = this.findOrderSlot(target);
                if (slot === -1) return this.setAction(this.inspectOrder, 'Re-checking orders', this.clickDelay, GUI_TIMEOUT);
                return this.clickAndWait(slot, this.cleanupCancel, 'Opening order');
            }
            this.cleanupPhase = 'combine';
            return this.combineBooks(() => {
                this.cleanupPhase = 'sells';
                this.openOrders();
            });
        }
        if (this.cleanupPhase === 'sells') {
            const sell = this.openSellOrders.find((order) => order.book);
            if (sell) {
                this.target = sell;
                const slot = this.findOrderSlot(sell, new Set(), 'sell ');
                if (slot === -1) return this.setAction(this.inspectOrder, 'Re-checking offers', this.clickDelay, GUI_TIMEOUT);
                return this.clickAndWait(slot, this.cleanupCancel, 'Opening offer');
            }
            this.cleanupPhase = null;
            this.message('&aCleanup complete; resuming.');
            return this.finishCycle();
        }
        return this.finishCycle();
    }

    cleanupCancel() {
        const gui = clean(getGuiName());
        if (gui.includes('bazaar orders')) return;
        if (!gui.includes('order options')) return;
        const slot = this.findSlot('Cancel Order', true);
        if (slot === -1) return;
        this.clickAndWait(slot, this.inspectOrder, 'Cancelling order', 500);
    }

    reconcileOrders() {
        const held = new Set(this.activeTargets.map((target) => `${target.book.key}:${target.input}`));
        this.orderQueue = this.orderQueue.filter((candidate) => !held.has(`${candidate.book.key}:${candidate.input}`));
        this.orderQueue = this.orderQueue.slice(0, Math.max(0, this.maxBuyOrders - this.activeTargets.length));
    }

    adoptOpenOrders() {
        const adopted = [];
        for (const order of this.openBuyOrders) {
            if (!order.book || order.level == null || order.level >= SELL_TIER) continue;
            if (!order.book.buyTiers.includes(order.level)) continue;
            const units = unitsFor(order.level);
            const amount = Number.isFinite(order.amount) && order.amount > 0 ? order.amount : units;
            adopted.push({
                book: order.book,
                id: bookId(order.book, order.level),
                name: bookName(order.book, order.level),
                input: order.level,
                units,
                quantity: amount,
                outputCount: Math.floor(amount / units),
                orderPrice: order.price,
                expectedOrderPrice: Number.isFinite(order.price) ? order.price : 0,
            });
        }
        this.activeTargets = adopted;
    }

    checkNextOrder() {
        this.target = this.orderCheckQueue.shift() || null;
        if (!this.target) return this.startSellChecks();
        this.commandAndWait(`bz ${this.target.name}`, this.openOrderCheck, 'Checking order');
    }

    openOrderCheck() {
        if (!clean(getGuiName()).includes('bazaar')) return;
        const slot = this.findBookSlot(this.target.book, this.target.input);
        if (slot === -1) return this.commandAndWait('managebazaarorders', this.openOutbidOrder, 'Reopening orders');
        this.clickAndWait(slot, this.checkProductOrder, 'Opening product');
    }

    checkProductOrder() {
        const slot = this.findSlot('Create Buy Order', true);
        if (slot === -1) return;
        const topPrice = this.topBuyOrderPrice(Player.getContainer()?.getStackInSlot(slot));
        if (!Number.isFinite(topPrice)) return this.checkNextOrder();
        if (topPrice <= this.target.orderPrice + 0.001) return this.checkNextOrder();
        this.target.expectedOrderPrice = Math.ceil((topPrice + 0.1) * 10) / 10;
        this.cancelQuantity = 0;
        this.orderMissingSince = 0;
        this.message(`&e${this.target.name} was outbid; relisting.`);
        this.commandAndWait('managebazaarorders', this.openOutbidOrder, 'Opening outbid order');
    }

    openOutbidOrder() {
        if (!clean(getGuiName()).includes('bazaar orders')) return;
        const slot = this.findOrderSlot(this.target);
        if (slot === -1) {
            if (!this.orderMissingSince) this.orderMissingSince = Date.now();
            if (Date.now() - this.orderMissingSince < STUCK_RETRY_DELAY * 2) return;
            this.orderMissingSince = 0;
            return this.finishOrderCancellation();
        }
        this.orderMissingSince = 0;
        this.clickAndWait(slot, this.cancelOutbidOrder, 'Opening outbid order');
    }

    cancelOutbidOrder() {
        const gui = clean(getGuiName());
        if (gui.includes('bazaar orders')) {
            if (this.findOrderSlot(this.target) !== -1) return;
            return this.openOutbidOrder();
        }
        if (!gui.includes('order options')) return;
        const slot = this.findSlot('Cancel Order', true);
        if (slot === -1) return;
        const missingLine = lore(Player.getContainer()?.getStackInSlot(slot)).find((line) => /[\d,]+x missing items?/i.test(line));
        const quantity = Number(missingLine?.match(/([\d,]+)x missing items?/i)?.[1]?.replace(/,/g, ''));
        if (!Number.isFinite(quantity) || quantity <= 0) return this.fail('Could not read the remaining quantity before relisting.');
        this.cancelQuantity += quantity;
        this.removeTarget(this.target);
        this.clickAndWait(slot, this.afterOrderCancelled, 'Cancelling order', 500);
    }

    afterOrderCancelled() {
        if (!clean(getGuiName()).includes('bazaar orders')) return;
        const slot = this.findOrderSlot(this.target);
        if (slot !== -1) return this.clickAndWait(slot, this.cancelOutbidOrder, 'Opening duplicate order');
        this.finishOrderCancellation();
    }

    finishOrderCancellation() {
        const target = this.target;
        if (this.cancelQuantity <= 0) return this.checkNextOrder();
        const price = target.expectedOrderPrice;
        const units = target.units;
        const quantity = Math.floor(Math.min(this.cancelQuantity, Math.floor(this.budget / price)) / units) * units;
        this.cancelQuantity = 0;
        if (quantity >= units && this.flipProfit(target.book, target.input, price) >= this.minProfit) {
            target.quantity = quantity;
            target.outputCount = quantity / units;
            target.orderPrice = price;
            this.orderQueue.unshift(target);
            this.message(`Relisting ${quantity.toLocaleString()}x ${target.name}.`);
            return this.placeNextOrder();
        }
        this.message(`&eSkipping ${target.name}; the new top order is no longer profitable.`);
        this.checkNextOrder();
    }

    placeNextOrder() {
        const cooldown = this.orderCooldownUntil - Date.now();
        if (cooldown > 0) return this.setAction(this.placeNextOrder, 'Bazaar order cooldown', cooldown, 0);
        this.target = this.orderQueue.shift() || null;
        if (!this.target) return this.finishCycle();
        this.placingSell = false;
        this.message(`Buying &b${this.target.quantity}x ${this.target.name}&f (~${formatCoins(this.target.profit)} profit).`);
        this.commandAndWait(`bz ${this.target.name}`, this.openProduct, 'Opening product');
    }

    openProduct() {
        if (!clean(getGuiName()).includes('bazaar')) return;
        const slot = this.findBookSlot(this.target.book, this.target.input);
        if (slot === -1) return;
        this.clickAndWait(slot, this.chooseBuyOrder, 'Selecting buy order');
    }

    chooseBuyOrder() {
        const slot = this.findSlot('Create Buy Order', true);
        if (slot === -1) return;
        this.clickAndWait(slot, this.chooseAmount, 'Selecting amount');
    }

    chooseAmount() {
        const slot = this.findSlot('Custom Amount', true);
        if (slot === -1) return;
        const limit = Number(
            lore(Player.getContainer()?.getStackInSlot(slot))
                .find((line) => /^buy up to [\d,]+x\.?$/i.test(line))
                ?.match(/[\d,]+/)?.[0]
                ?.replace(/,/g, '')
        );
        if (limit > 0) this.target.quantity = Math.min(this.target.quantity, limit);
        this.clickAndWait(slot, this.enterAmount, 'Entering amount');
    }

    enterAmount() {
        if (!Client.currentGui?.getClassName?.().includes('Sign')) return;
        const submit = () => {
            if (!Client.currentGui?.getClassName?.().includes('Sign')) return;
            setSignLine(1, this.target.quantity);
            Client.currentGui.close();
        };
        this.setAction(this.choosePrice, 'Selecting price', this.clickDelay, GUI_TIMEOUT, submit);
        submit();
    }

    choosePrice() {
        const slot = this.findBestOfferSlot();
        if (slot === -1) return;
        const price = this.unitPrice(Player.getContainer()?.getStackInSlot(slot));
        if (!this.isSafePrice(price)) return this.retryPrices('The best-offer price moved too far or is no longer profitable.');
        this.target.orderPrice = price;
        this.clickAndWait(slot, this.confirmOrder, 'Confirming order');
    }

    confirmOrder() {
        if (!clean(getGuiName()).includes('confirm buy order')) return;
        const slot = this.findSlot('Buy Order', true);
        if (slot === -1) return;
        const price = this.unitPrice(Player.getContainer()?.getStackInSlot(slot));
        if (Number.isFinite(price)) this.target.orderPrice = price;
        this.confirmSlot = slot;
        this.clickAndWait(slot, this.awaitOrderCreated, 'Creating order', 500);
    }

    awaitOrderCreated() {
        if (!Client.isInGui()) return;
        if (clean(Player.getContainer()?.getStackInSlot(this.confirmSlot)?.getName?.()) !== 'warning') return;
        this.setAction(this.waitForWarning, 'Waiting for Bazaar warning');
    }

    waitForWarning() {
        const name = clean(Player.getContainer()?.getStackInSlot(this.confirmSlot)?.getName?.());
        if (!name || name === 'warning') return;
        this.clickAndWait(this.confirmSlot, this.awaitOrderCreated, 'Creating order', 500);
    }

    startSellChecks() {
        this.sellCheckQueue = this.openSellOrders.filter((order) => order.book && order.level === SELL_TIER && Number.isFinite(order.price) && order.price > 0);
        this.checkNextSellOrder();
    }

    checkNextSellOrder() {
        this.target = this.sellCheckQueue.shift() || null;
        if (!this.target) return this.finishCycle();
        this.commandAndWait(`bz ${this.target.name}`, this.openSellCheck, 'Checking sell offer');
    }

    openSellCheck() {
        if (!clean(getGuiName()).includes('bazaar')) return;
        const slot = this.findBookSlot(this.target.book, SELL_TIER);
        if (slot === -1) return this.commandAndWait('managebazaarorders', this.openSellCancel, 'Reopening orders');
        this.clickAndWait(slot, this.checkSellProduct, 'Opening book');
    }

    checkSellProduct() {
        const slot = this.findSlot('Create Sell Offer', true);
        if (slot === -1) return;
        const lowest = this.topSellOfferPrice(Player.getContainer()?.getStackInSlot(slot));
        if (!Number.isFinite(lowest)) return this.checkNextSellOrder();
        if (this.target.price <= lowest + 0.001) return this.checkNextSellOrder();
        this.message(`&e${this.target.name} offer undercut; relisting.`);
        this.commandAndWait('managebazaarorders', this.openSellCancel, 'Opening offer');
    }

    openSellCancel() {
        if (!clean(getGuiName()).includes('bazaar orders')) return;
        const slot = this.findOrderSlot(this.target, new Set(), 'sell ');
        if (slot === -1) return this.checkNextSellOrder();
        this.clickAndWait(slot, this.cancelSellOrder, 'Opening offer');
    }

    cancelSellOrder() {
        const gui = clean(getGuiName());
        if (gui.includes('bazaar orders')) {
            if (this.findOrderSlot(this.target, new Set(), 'sell ') !== -1) return;
            return this.openSellCancel();
        }
        if (!gui.includes('order options')) return;
        const slot = this.findSlot('Cancel Order', true);
        if (slot === -1) return;
        this.clickAndWait(slot, this.afterSellCancelled, 'Cancelling offer', 500);
    }

    afterSellCancelled() {
        if (!clean(getGuiName()).includes('bazaar orders')) return;
        this.checkNextSellOrder();
    }

    finishCycle() {
        if (this.orderQueue.length) return this.placeNextOrder();
        if (this.hasCombinableBooks()) return this.combineBooks(this.sellBooks);
        if (this.hasSellables()) return this.sellBooks();
        this.setAction(this.fetchPrices, 'Waiting for refresh', REFRESH_MS, 0);
    }

    combineBooks(after) {
        this.afterCombine = after || this.sellBooks;
        const combine = getModule('Auto Combine');
        if (!combine || !this.hasCombinableBooks()) return this.afterCombine.call(this);
        this.combining = true;
        this.message('&eCombining books to level V...');
        if (!combine.enabled) combine.toggle(true);
        this.setAction(this.waitCombine, 'Combining books', 1_000, 0);
    }

    waitCombine() {
        const combine = getModule('Auto Combine');
        if (combine && combine.enabled) {
            this.nextActionAt = Date.now() + 1_000;
            return;
        }
        this.combining = false;
        const next = this.afterCombine || this.sellBooks;
        this.afterCombine = null;
        next.call(this);
    }

    combineForSpace() {
        this.message('&eInventory full; combining to free space.');
        this.combineBooks(this.cleanupPhase ? this.openOrders : this.sellBooks);
    }

    hasSellables() {
        return this.enabledBooks().some((book) => this.countLevel(book, SELL_TIER) > 0);
    }

    sellBooks() {
        const book = this.enabledBooks().find((candidate) => this.countLevel(candidate, SELL_TIER) > 0);
        if (!book) return this.setAction(this.fetchPrices, 'Waiting for refresh', REFRESH_MS, 0);
        const quantity = Math.min(this.countLevel(book, SELL_TIER), 256);
        this.target = { book, id: bookId(book, SELL_TIER), name: bookName(book, SELL_TIER), input: SELL_TIER, level: SELL_TIER, units: 1, quantity, outputCount: quantity };
        this.placingSell = true;
        this.message(`Selling &b${quantity}x ${this.target.name}&f on the Bazaar.`);
        this.commandAndWait(`bz ${this.target.name}`, this.openSellProduct, 'Opening sell item');
    }

    openSellProduct() {
        if (!clean(getGuiName()).includes('bazaar')) return;
        const slot = this.findBookSlot(this.target.book, SELL_TIER);
        if (slot === -1) return;
        this.clickAndWait(slot, this.chooseSellOffer, 'Selecting book');
    }

    chooseSellOffer() {
        const slot = this.findSlot('Create Sell Offer', true);
        if (slot === -1) return;
        this.clickAndWait(slot, this.chooseSellAmount, 'Selecting amount');
    }

    chooseSellAmount() {
        const slot = this.findSlot('Custom Amount', true);
        if (slot === -1) return;
        const limit = Number(
            lore(Player.getContainer()?.getStackInSlot(slot))
                .find((line) => /^sell up to [\d,]+x\.?$/i.test(line))
                ?.match(/[\d,]+/)?.[0]
                ?.replace(/,/g, '')
        );
        if (limit > 0) this.target.quantity = Math.min(this.target.quantity, limit);
        this.clickAndWait(slot, this.enterSellAmount, 'Entering amount');
    }

    enterSellAmount() {
        if (!Client.currentGui?.getClassName?.().includes('Sign')) return;
        const submit = () => {
            if (!Client.currentGui?.getClassName?.().includes('Sign')) return;
            setSignLine(1, this.target.quantity);
            Client.currentGui.close();
        };
        this.setAction(this.chooseSellPrice, 'Selecting price', this.clickDelay, GUI_TIMEOUT, submit);
        submit();
    }

    chooseSellPrice() {
        const slot = this.findSellPriceSlot();
        if (slot === -1) return;
        const price = this.unitPrice(Player.getContainer()?.getStackInSlot(slot));
        if (Number.isFinite(price)) this.target.orderPrice = price;
        this.clickAndWait(slot, this.confirmSellOffer, 'Confirming sell offer');
    }

    findSellPriceSlot() {
        const items = Player.getContainer()?.getItems() || [];
        const isNugget = (item) => {
            try {
                return clean(item?.getType?.()?.getRegistryName?.() ?? '').includes('gold_nugget');
            } catch (error) {
                return false;
            }
        };
        for (let slot = 0; slot < items.length; slot++) {
            const item = items[slot];
            if (!item || !isNugget(item)) continue;
            if (/best offer\s*-\s*0\.1/i.test(clean(item.getName?.()))) return slot;
        }
        const fallback = 13;
        const item = items[fallback];
        if (item && isNugget(item)) return fallback;
        return -1;
    }

    confirmSellOffer() {
        if (!clean(getGuiName()).includes('confirm')) return;
        const slot = this.findSlot('Sell Offer', true);
        if (slot === -1) return;
        const price = this.unitPrice(Player.getContainer()?.getStackInSlot(slot));
        if (Number.isFinite(price)) this.target.orderPrice = price;
        this.confirmSlot = slot;
        this.clickAndWait(slot, this.awaitSellCreated, 'Creating sell offer', 500);
    }

    awaitSellCreated() {
        if (!Client.isInGui()) return;
        if (clean(Player.getContainer()?.getStackInSlot(this.confirmSlot)?.getName?.()) !== 'warning') return;
        this.setAction(this.waitForSellWarning, 'Waiting for Bazaar warning');
    }

    waitForSellWarning() {
        const name = clean(Player.getContainer()?.getStackInSlot(this.confirmSlot)?.getName?.());
        if (!name || name === 'warning') return;
        this.clickAndWait(this.confirmSlot, this.awaitSellCreated, 'Creating sell offer', 500);
    }

    onChat(event) {
        const message = event?.message?.getUnformattedText?.() ?? event?.message?.getString?.() ?? '';
        if (/you don't have the space required to claim that/i.test(message)) {
            if (!this.claimNoSpace) {
                this.claimNoSpace = true;
                if (this.enabled) this.setAction(this.combineForSpace, 'Inventory full; combining', 500, 0);
            }
            return;
        }
        if (/^\[Bazaar\] You reached your maximum of [\d,]+ Bazaar orders!$/.test(message)) {
            this.orderLimitReached = true;
            this.orderQueue = [];
            this.message('&eMaximum Bazaar orders reached; monitoring existing orders.');
            return this.setAction(this.openOrders, 'Checking orders', this.clickDelay, 0);
        }
        if (message.includes('[Bazaar] Placing orders is on cooldown for up to 1 minute!')) {
            if (this.action === this.awaitOrderCreated && this.target) this.orderQueue.unshift(this.target);
            this.orderCooldownUntil = Date.now() + 20_000;
            this.message('&eOrder placement is on cooldown; checking existing orders for 20 seconds.');
            return this.setAction(this.openOrders, 'Bazaar order cooldown', this.clickDelay, 0);
        }
        if (this.action !== this.awaitOrderCreated && this.action !== this.awaitSellCreated) return;
        if (message.includes('[Bazaar] Buy Order Setup!')) {
            this.activeTargets.push(this.target);
            this.placingSell = false;
            this.setAction(this.placeNextOrder, 'Placing next order', this.clickDelay, 0);
        } else if (message.includes('[Bazaar] Sell Offer Setup!')) {
            this.openSellOrders.push(this.target);
            this.placingSell = false;
            this.setAction(this.finishCycle, 'Offer placed', this.clickDelay, 0);
        } else if (/not enough coins|couldn't afford|cannot afford/i.test(message)) {
            this.orderQueue = [];
            this.message('&eNot enough coins for that order; monitoring placed orders.');
            this.setAction(this.openOrders, 'Checking orders', this.clickDelay, 0);
        }
    }

    scanOpenOrders() {
        const items = Player.getContainer()?.getItems() || [];
        const buyOrders = [];
        const sellOrders = [];
        let count = 0;
        for (let slot = 0; slot < Math.max(0, items.length - 36); slot++) {
            const stack = items[slot];
            const name = clean(stack?.getName?.());
            const match = name.match(/^(buy|sell) (.+)$/);
            if (!match) continue;
            count++;
            const orderLore = lore(stack);
            const amount = Number(
                orderLore
                    .find((line) => /^(order amount|amount):\s*[\d,]+x/i.test(line))
                    ?.match(/[\d,]+/)?.[0]
                    ?.replace(/,/g, '')
            );
            const info = bookFromText(match[2]) || bookFromItem(stack);
            const order = {
                id: this.skyblockItemId(stack),
                name: ChatLib.removeFormatting(String(stack.getName())).trim().replace(/^(BUY|SELL)\s+/i, ''),
                book: info ? info.book : null,
                level: info ? info.level : null,
                amount,
                price: this.unitPrice(stack),
            };
            (match[1] === 'buy' ? buyOrders : sellOrders).push(order);
        }
        this.openBuyOrders = buyOrders;
        this.openSellOrders = sellOrders;
        if (count < this.openOrderCount) this.orderLimitReached = false;
        this.openOrderCount = count;
    }

    findClaimSlot() {
        const items = Player.getContainer()?.getItems() || [];
        for (let slot = 0; slot < Math.max(0, items.length - 36); slot++) {
            if (this.claimedSlots.has(slot)) continue;
            const stack = items[slot];
            if (!clean(stack?.getName?.()).startsWith('buy ')) continue;
            if (!bookFromItem(stack)) continue;
            if (lore(stack).some((line) => /^you have [\d,]+ items? to claim!?$/i.test(line))) return slot;
        }
        return -1;
    }

    findSlot(name, exact = false) {
        const items = Player.getContainer()?.getItems() || [];
        const target = clean(name);
        for (let slot = 0; slot < items.length; slot++) {
            const item = items[slot];
            if (!item) continue;
            const itemName = clean(item.getName?.());
            if (exact ? itemName === target : itemName.includes(target)) return slot;
        }
        return -1;
    }

    findBookSlot(book, level) {
        const items = Player.getContainer()?.getItems() || [];
        const target = clean(bookName(book, level));
        for (let slot = 0; slot < items.length; slot++) {
            const item = items[slot];
            if (!item) continue;
            const info = bookFromItem(item);
            if (info && info.book.key === book.key && info.level === level) return slot;
            if (clean(item.getName?.()) === target) return slot;
        }
        return -1;
    }

    findBestOfferSlot() {
        const items = Player.getContainer()?.getItems() || [];
        for (let slot = 0; slot < items.length; slot++) {
            const item = items[slot];
            if (!item) continue;
            let registry = '';
            try {
                registry = clean(item.getType?.()?.getRegistryName?.() ?? '');
            } catch (error) {}
            const text = clean([item.getName?.(), ...lore(item)].join(' '));
            if (registry.includes('gold_nugget') || /best offer|buy now|sell now/.test(text)) return slot;
        }
        return -1;
    }

    findOrderSlot(target, excluded = new Set(), prefix = 'buy ') {
        const items = Player.getContainer()?.getItems() || [];
        const targetName = clean(target.name);
        let fallback = -1;
        for (let slot = 0; slot < Math.max(0, items.length - 36); slot++) {
            if (excluded.has(slot)) continue;
            const stack = items[slot];
            const name = clean(stack?.getName?.());
            if (!name.startsWith(prefix)) continue;
            const stripped = name.slice(prefix.length);
            const info = bookFromText(stripped) || bookFromItem(stack);
            const matches = stripped === targetName || (info && target.book && info.book.key === target.book.key && (target.level == null || info.level === target.level));
            if (!matches) continue;
            if (fallback === -1) fallback = slot;
            const price = this.unitPrice(stack);
            if (Number.isFinite(price) && Number.isFinite(target.orderPrice) && Math.abs(price - target.orderPrice) <= 0.001) return slot;
        }
        return fallback;
    }

    topBuyOrderPrice(item) {
        const prices = lore(item)
            .map((line) => Number(line.match(/^- ([\d,.]+) coins? each\b/i)?.[1]?.replace(/,/g, '')))
            .filter(Number.isFinite);
        return prices.length ? Math.max(...prices) : NaN;
    }

    topSellOfferPrice(item) {
        const prices = lore(item)
            .map((line) => Number(line.match(/^- ([\d,.]+) coins? each\b/i)?.[1]?.replace(/,/g, '')))
            .filter(Number.isFinite);
        return prices.length ? Math.min(...prices) : NaN;
    }

    unitPrice(item) {
        const line = lore(item).find((value) => /^(?:price per unit|unit price):\s*[\d,.]+/i.test(value));
        return Number(line?.match(/[\d,.]+/)?.[0]?.replace(/,/g, ''));
    }

    skyblockItemId(item) {
        let data = '';
        try {
            data = String(item?.toMC?.()?.get?.(DataComponents.CUSTOM_DATA)?.copyTag?.() || '');
        } catch (error) {}
        if (!data) data = String(item?.getNBT?.() || '');
        return data.match(/\bid\s*[:=]\s*"?([^",}\s]+)/i)?.[1] || null;
    }

    itemKey(item) {
        if (!item) return null;
        let customData = '';
        try {
            customData = String(item.toMC()?.get?.(DataComponents.CUSTOM_DATA)?.copyTag?.() || '');
        } catch (error) {}
        if (!customData) customData = String(item.getNBT()).match(/\bid\s*[:=]\s*"?([^",}\s]+)/i)?.[1] || '';
        return `${item.getType().getRegistryName()}|${item.getDamage()}|${customData}`;
    }

    inventorySnapshot(items = Player.getInventory()?.getItems() || []) {
        const snapshot = new Map();
        for (const item of items) {
            const key = this.itemKey(item);
            if (key) snapshot.set(key, (snapshot.get(key) || 0) + Number(item.getStackSize() || 0));
        }
        return snapshot;
    }

    countLevel(book, level) {
        let total = 0;
        for (const item of Player.getInventory()?.getItems() || []) {
            const info = bookFromItem(item);
            if (info && info.book.key === book.key && info.level === level) total += Number(item.getStackSize() || 0);
        }
        return total;
    }

    hasCombinableBooks() {
        for (const book of BOOKS) {
            for (let level = 1; level <= 4; level++) {
                if (this.countLevel(book, level) >= 2) return true;
            }
        }
        return false;
    }

    flipProfit(book, input, price) {
        const outProduct = this.bazaarData?.products?.[bookId(book, SELL_TIER)];
        const revenuePerV = askPrice(outProduct) * (1 - this.undercutPercent / 100) * (1 - this.taxPercent / 100);
        return revenuePerV - price * unitsFor(input);
    }

    isSafePrice(price) {
        const expected = Number(this.target.expectedOrderPrice);
        return (
            Number.isFinite(price) &&
            price > 0 &&
            Number.isFinite(expected) &&
            price <= expected * 1.1 + 1 &&
            this.flipProfit(this.target.book, this.target.input, price) >= this.minProfit
        );
    }

    removeTarget(target) {
        const key = `${target.book.key}:${target.input}`;
        this.activeTargets = this.activeTargets.filter((entry) => `${entry.book.key}:${entry.input}` !== key);
        this.orderCheckQueue = this.orderCheckQueue.filter((entry) => `${entry.book.key}:${entry.input}` !== key);
        this.orderQueue = this.orderQueue.filter((entry) => `${entry.book.key}:${entry.input}` !== key);
    }

    retryPrices(message) {
        this.message(`&e${message}`);
        this.placeNextOrder();
    }

    restart(message) {
        const snapshot = {
            bazaarData: this.bazaarData,
            enchantingLevel: this.enchantingLevel,
            startingInventory: this.startingInventory,
            lastCheckedInventory: this.lastCheckedInventory,
            cleanupPhase: this.cleanupPhase,
        };
        this.message(`&e${message} Restarting...`);
        closeInventory();
        this.reset();
        Object.assign(this, snapshot);
        this.inventoryReady = true;
        this.setAction(this.fetchPrices, 'Restarting', 500, 25_000);
    }

    fail(message) {
        this.message(`&c${message}`);
        this.toggle(false);
    }

    report() {
        this.message(`&bBook Flipper&f: ${this.status} | Enchanting ${this.enchantingLevel ?? '?'}`);
        this.message(`  Buy orders: ${this.activeTargets.length}/${this.maxBuyOrders} | Books: ${this.enabledBooks().map((book) => book.name).join(', ')}`);
        for (const target of this.activeTargets) {
            this.message(`  &7${target.name} @ ${formatCoins(target.orderPrice)} (${target.quantity}x)`);
        }
    }
}

new BookFlipper();
