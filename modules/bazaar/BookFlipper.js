import requestV2 from '../../utils/Request';
import { DataComponents } from '../../utils/Constants';
import { ModuleBase } from '../../utils/ModuleBase';
import { setSignLine } from '../../utils/Sign';
import { v5Command } from '../../utils/V5Commands';
import { clickSlot, closeInventory, getGuiName } from '../../utils/player/Inventory';
import { Recovery } from '../../utils/AutoRecovery';
import { readEnchantingFromContainer } from '../../utils/Skills';

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const SELL_TIER = 5;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const BOOK_LIMIT = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const COMBINE_LEVELS = ['i', 'ii', 'iii', 'iv'];
const BOOKS = [
    { key: 'rejuvenate', idPrefix: 'ENCHANTMENT_REJUVENATE_', name: 'Rejuvenate', names: ['Rejuvenate'], buyTiers: [1, 2, 3], required: 10 },
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
            description: 'Flips Rejuvenate books on the Bazaar: buys I/II/III, combines to V, sells the V books.',
            tooltip: 'Requires Cookie Buff. Empty your inventory first. Needs an anvil on your island.',
            isMacro: true,
        });
        this.bindToggleKey();

        this.clickDelay = 350;
        this.addSlider('Click Delay (ms)', 50, 2_000, 350, (value) => (this.clickDelay = value), 'Delay between Bazaar clicks.');        this.stepTimeout = 8_000;
        this.addSlider('Step Timeout (ms)', 3_000, 20_000, 8_000, (value) => (this.stepTimeout = value), 'How long a single GUI step may stall before it retries.');
        this.maxRetries = 3;
        this.addSlider('Max Retries per Step', 1, 6, 3, (value) => (this.maxRetries = Math.round(value)), 'Retries of a stalled step before the task aborts.');
        this.maxBuyOrders = 8;
        this.addSlider('Order Limit', 1, 28, 8, (value) => (this.maxBuyOrders = Math.round(value)), 'Maximum active buy orders.');
        this.budget = 10_000_000;
        this.addSlider('Per-Order Budget (M)', 0.1, 100, 10, (value) => (this.budget = value * 1_000_000), 'Max coins per buy order (also capped by your purse).');
        this.taxPercent = 1.25;
        this.addSlider('Bazaar Tax (%)', 0, 3, 1.25, (value) => (this.taxPercent = value), 'Bazaar sell tax.');
        this.undercutPercent = 0.1;
        this.addSlider('Undercut (%)', 0, 5, 0.1, (value) => (this.undercutPercent = value), 'How far below the lowest sell offer to list.');
        this.minProfit = 0;
        this.addSlider('Min Profit per V', 0, 10_000_000, 0, (value) => (this.minProfit = value), 'Minimum coins profit per finished level V book.');
        this.refreshSeconds = 60;
        this.addSlider('Refresh Interval (s)', 10, 300, 60, (value) => (this.refreshSeconds = value), 'How long to idle before re-fetching prices.');
        this.skillGate = true;
        this.addToggle('Enchanting Skill Gate', (value) => (this.skillGate = !!value), 'Skip enchants whose required Enchanting level is above yours.', true);
        this.cleanOnEnable = true;
        this.addToggle('Clean Orders On Enable', (value) => (this.cleanOnEnable = !!value), 'Cancel/claim/combine existing book orders before trading.', true);
        this.verbose = false;
        this.addToggle('Verbose Chat', (value) => (this.verbose = !!value), 'Print every step to chat (debugging).', false);
        this.addButton('Refresh Prices', () => (this.bazaarData = null), 'Re-fetch Bazaar prices now.');
        this.addButton('Read Enchanting', () => this.setEnchantingPending(), 'Re-read your Enchanting level from /skills.');

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
                    Orders: () => `${this.activeTargets.length}/${this.maxBuyOrders}`,
                },
            },
            {
                title: 'Next',
                data: {
                    Book: () => (this.target ? this.target.name : '—'),
                    Price: () => (this.target && this.target.orderPrice ? formatCoins(this.target.orderPrice) : '—'),
                    'To Sell': () => this.enabledBooks().map((book) => `${book.name[0]}V x${this.countLevel(book, SELL_TIER)}`).join(' ') || '—',
                    Error: () => this.lastError || '—',
                },
            },
        ]);

        this.on('tick', () => this.tick());
        this.on('chat', (event) => this.onChat(event));
        v5Command('bazaar books', () => this.report());
        this.reset();
    }

    setEnchantingPending() {
        this.needsSkills = true;
        this.bazaarData = null;
    }

    onEnable() {
        this.reset();
        Recovery.setActive(true, this.name);
        if (!Recovery.isReady()) {
            this.pendingEnable = true;
            this.status = 'Recovering';
            return;
        }
        this.finishEnable();
    }

    finishEnable() {
        const inventory = Player.getInventory();
        if (!inventory) return this.fail('Could not snapshot your inventory.');
        const dirty = inventory
            .getItems()
            .slice(0, 36)
            .some((item) => item && item.getStackSize() > 0 && !clean(item.getName()).startsWith('skyblock menu'));
        if (dirty && this.toggleContext === 'user') return this.fail('Empty your inventory before enabling the macro.');
        if (dirty) this.status = 'Inventory not empty; resuming';
        this.inventoryReady = true;
        this.cleanupPhase = this.cleanOnEnable ? 'buys' : null;
        this.task = this.startTask('Read enchanting', [this.readSkillsStep()]);
    }
    onDisable() {
        Recovery.setActive(false, this.name);
        this.requestToken++;
        closeInventory();
        this.reset();
        this.log('&cDisabled');
    }

    reset() {
        this.task = null;
        this.status = 'Idle';
        this.target = null;
        this.orderQueue = [];
        this.activeTargets = [];
        this.openBuyOrders = [];
        this.openSellOrders = [];
        this.openOrderCount = 0;
        this.orderCheckQueue = [];
        this.sellCheckQueue = [];
        this.skippedIds = new Map();
        this.pendingSell = null;
        this.cleanupPhase = null;
        this.lastCancelEmpty = false;
        this.bazaarData = null;
        this.enchantingLevel = null;
        this.skillReadAttempts = 0;
        this.pendingEnable = false;
        this.needsSkills = false;
        this.inventoryReady = false;
        this.claimedSlots = new Map();
        this.claimNoSpace = false;
        this.orderOutbidCheckedAt = 0;
        this.orderCooldownUntil = 0;
        this.orderLimitReached = false;
        this.lastRefresh = 0;
        this.refreshRetryAt = 0;
        this.ordersScanned = false;
        this.ordersScannedAt = 0;
        this.stepFailures = 0;
        this.suspended = false;
        this.chatLog = [];
        this.chatSeq = 0;
        this.lastError = null;
        this.guiDebugSeen = {};
        this.requestToken = (this.requestToken || 0) + 1;
    }

    log(message) {
        if (this.verbose) this.message(message);
    }

    readPurse() {
        try {
            for (const line of Scoreboard.getLines() || []) {
                const text = ChatLib.removeFormatting(String(line));
                const match = text.match(/(?:Purse|Piggy):\s*([\d,]+)/i);
                if (match) return Number(match[1].replace(/,/g, ''));
            }
        } catch (error) {}
        return null;
    }

    enabledBooks() {
        return BOOKS.filter((book) => !this.skillGate || (this.enchantingLevel != null && this.enchantingLevel >= book.required));
    }

    // ───────────────────────────── chat mailbox ─────────────────────────────

    onChat(event) {
        const text = event?.message?.getUnformattedText?.() ?? event?.message?.getString?.() ?? '';
        if (!text) return;
        this.chatSeq++;
        this.chatLog.push({ seq: this.chatSeq, text, at: Date.now() });
        if (this.chatLog.length > 60) this.chatLog.splice(0, this.chatLog.length - 60);
        const now = Date.now();
        if (/Placing orders is on cooldown/i.test(text)) this.orderCooldownUntil = now + 20_000;
        if (/reached your maximum of [\d,]+ Bazaar orders/i.test(text)) this.orderLimitReached = true;
        if (/you don't have the space required to claim that/i.test(text)) this.claimNoSpace = true;
    }

    chatSince(mark, pattern) {
        return this.chatLog.some((line) => line.seq > mark && pattern.test(line.text));
    }

    // ───────────────────────────── driver ─────────────────────────────

    tick() {
        if (!this.enabled) return;
        if (!Recovery.isReady()) {
            if (!this.suspended) {
                this.suspended = true;
                this.status = 'Recovering';
                closeInventory();
            }
            return;
        }
        if (this.pendingEnable) {
            this.pendingEnable = false;
            this.suspended = false;
            this.finishEnable();
            return;
        }
        if (this.suspended) {
            this.suspended = false;
            this.task = null;
            this.stepFailures = 0;
        }
        try {
            this.drive();
        } catch (error) {
            console.error('[BookFlipper] tick error: ' + error);
            this.task = null;
            this.onTaskFailed('tick error');
        }
    }

    drive() {
        if (!this.task) {
            this.task = this.pickTask();
            if (!this.task) return;
        }
        const task = this.task;
        const step = task.steps[task.i];
        if (!step) {
            this.task = null;
            return;
        }
        const now = Date.now();
        if (!step._entered) {
            if (step.screen && !this.screenMatches(step.screen)) {
                if (step.open) {
                    step._openedAt = step._openedAt || 0;
                    if (now - step._openedAt > 1_000) {
                        step._openedAt = now;
                        try {
                            step.open();
                        } catch (error) {
                            console.error('[BookFlipper] step open error (' + step.name + '): ' + error);
                        }
                    }
                }
                return;
            }
            step._entered = true;
            step._started = now;
            if (step.status) this.status = step.status;
            try {
                step.enter?.();
            } catch (error) {
                console.error('[BookFlipper] step enter error (' + step.name + '): ' + error);
            }
        }
        if (step.while) {
            try {
                step.while();
            } catch (error) {
                console.error('[BookFlipper] step while error (' + step.name + '): ' + error);
            }
        }
        let done = false;
        try {
            done = !!step.done?.();
        } catch (error) {
            console.error('[BookFlipper] step done error (' + step.name + '): ' + error);
        }
        if (done) {
            if (step.next) {
                task.steps = step.next() || [];
                task.i = 0;
            } else {
                task.i++;
            }
            task.retries = 0;
            if (task.i >= task.steps.length) {
                this.task = null;
                this.stepFailures = 0;
            }
            return;
        }
        const timeout = step.timeout === undefined ? this.stepTimeout : step.timeout;
        if (timeout > 0 && now - step._started >= timeout) this.onStepTimeout(task, step);
    }

    onStepTimeout(task, step) {
        task.retries = (task.retries || 0) + 1;
        this.debugGui('timeout: ' + step.name);
        if (task.retries > this.maxRetries) {
            console.log(`[BookFlipper] task "${task.name}" failed after ${task.retries} tries`);
            this.task = null;
            closeInventory();
            this.onTaskFailed(step.name);
            return;
        }
        console.log(`[BookFlipper] step "${step.name}" timed out; retry ${task.retries}/${this.maxRetries}`);
        step._entered = false;
    }

    onTaskFailed(reason) {
        this.lastError = 'Retry after: ' + reason;
        this.stepFailures++;
        if (this.stepFailures >= 3) {
            this.stepFailures = 0;
            this.lastError = null;
            this.log('&eStuck; re-syncing from scratch.');
            closeInventory();
            this.hardReset();
        }
    }

    hardReset() {
        const snap = {
            bazaarData: this.bazaarData,
            enchantingLevel: this.enchantingLevel,
            cleanupPhase: this.cleanupPhase,
            activeTargets: this.activeTargets,
            openSellOrders: this.openSellOrders,
            openOrderCount: this.openOrderCount,
        };
        this.reset();
        Object.assign(this, snap);
        this.inventoryReady = true;
    }

    startTask(name, steps) {
        return { name, steps, i: 0, retries: 0 };
    }

    doneStep(action) {
        return { name: 'Finish', enter: () => action(), done: () => true, timeout: 0 };
    }

    // ───────────────────────────── task picker ─────────────────────────────

    pickTask() {
        if (this.needsSkills || this.enchantingLevel === null) {
            this.needsSkills = false;
            return this.startTask('Read enchanting', [this.readSkillsStep()]);
        }
        if (!this.bazaarData) {
            if (Date.now() < (this.refreshRetryAt || 0)) return this.startTask('Idle', this.idleSteps(5_000));
            return this.startTask('Fetch prices', [this.refreshStep()]);
        }
        if (Date.now() - this.lastRefresh >= this.refreshSeconds * 1_000) {
            return this.startTask('Fetch prices', [this.refreshStep()]);
        }

        if (this.cleanupPhase) {
            if (this.inventoryFull() || this.hasPair()) return this.startTask('Combine', this.combineSteps());
            if (this.lastCancelEmpty) {
                this.lastCancelEmpty = false;
                this.cleanupPhase = null;
                this.ordersScanned = false;
                this.log('&aCleanup complete; monitoring orders.');
                return null;
            }
            return this.startTask('Cleanup ' + this.cleanupPhase, this.cleanupSteps(this.cleanupPhase));
        }

        if (this.needsOrderScan()) return this.startTask('Scan orders', this.scanOrdersSteps());
        if (!this.orderCheckQueue.length && this.needsOrderPriceCheck()) {
            this.orderOutbidCheckedAt = Date.now();
            this.orderCheckQueue = [...this.activeTargets];
            this.sellCheckQueue = [...this.openSellOrders];
        }
        if (this.orderCheckQueue.length) return this.startTask('Relist order', this.relistBuySteps());
        if (this.sellCheckQueue.length) return this.startTask('Relist offer', this.relistSellSteps());
        if (this.pendingSell && !this.inventoryFull()) return this.startTask('Sell books', this.sellSteps());
        if (!this.inventoryFull() && this.containsClaimableV()) return this.startTask('Claim orders', this.claimSteps());
        if (this.inventoryFull() || this.hasPair()) return this.startTask('Combine', this.combineSteps());
        if (this.hasSellableV()) return this.startTask('Sell books', this.sellSteps());
        if (this.orderQueue.length && this.activeTargets.length < this.maxBuyOrders && Date.now() >= this.orderCooldownUntil) {
            return this.startTask('Buy book', this.buySteps(this.orderQueue[0]));
        }
        return this.startTask('Idle', this.idleSteps());
    }

    needsOrderPriceCheck() {
        if (!this.activeTargets.length) return false;
        return Date.now() - this.orderOutbidCheckedAt >= 45_000;
    }

    needsOrderScan() {
        return !this.ordersScanned || Date.now() - this.ordersScannedAt >= 90_000;
    }

    // ───────────────────────────── shared steps ─────────────────────────────

    openOrdersStep() {
        return {
            name: 'Open orders',
            status: 'Opening orders',
            screen: () => this.isOrdersGui(),
            open: () => this.runCommand('managebazaarorders'),
            done: () => this.isOrdersGui(),
        };
    }

    closeGuiStep() {
        return {
            name: 'Close GUI',
            screen: () => true,
            enter: () => {
                if (this.isInGui()) closeInventory();
            },
            done: () => !this.isInGui(),
            timeout: 3_000,
        };
    }

    readSkillsStep() {
        const st = { sent: 0, t0: 0 };
        const finish = () => {
            try {
                const result = readEnchantingFromContainer(Player.getContainer());
                if (result?.level != null) {
                    this.enchantingLevel = result.level;
                    console.log(`[BookFlipper] Enchanting=${result.level}`);
                }
            } catch (error) {
                console.error('[BookFlipper] skills read error: ' + error);
            }
            closeInventory();
            if (this.enchantingLevel == null) this.enchantingLevel = 0;
            this.ordersScanned = false;
            return true;
        };
        return {
            name: 'Read enchanting',
            status: 'Reading enchanting',
            timeout: 15_000,
            enter: () => {
                if (this.guiIs('skill')) return;
                this.runCommand('skills');
                st.sent = 1;
                st.t0 = Date.now();
            },
            done: () => {
                if (this.guiIs('skill')) return finish();
                if (Date.now() - st.t0 > 3_000) {
                    if (st.sent < 3) {
                        st.sent++;
                        st.t0 = Date.now();
                        this.runCommand('skills');
                        return false;
                    }
                    console.log('[BookFlipper] could not open /skills; skill gate disabled');
                    this.enchantingLevel = 0;
                    this.ordersScanned = false;
                    return true;
                }
                return false;
            },
        };
    }

    refreshStep() {
        const st = { done: false };
        return {
            name: 'Fetch prices',
            status: 'Loading prices',
            timeout: 25_000,
            enter: () => {
                const token = ++this.requestToken;
                requestV2({ url: BAZAAR_URL, method: 'GET', json: true, timeout: 10_000 })
                    .then((bazaar) => {
                        if (!this.enabled || token !== this.requestToken) return;
                        if (!bazaar?.success) {
                            this.lastError = 'Price fetch failed';
                            this.refreshRetryAt = Date.now() + 15_000;
                            this.message('&cCould not load Hypixel Bazaar prices.');
                            st.done = true;
                            return;
                        }
                        this.lastError = null;
                        this.bazaarData = bazaar;
                        this.orderQueue = this.computeFlips(bazaar);
                        this.lastRefresh = Date.now();
                        this.refreshRetryAt = 0;
                        this.orderLimitReached = false;
                        this.ordersScanned = false;
                        st.done = true;
                    })
                    .catch((error) => {
                        console.error('[BookFlipper] fetch error: ' + error);
                        if (this.enabled && token === this.requestToken) {
                            this.lastError = 'Price fetch failed';
                            this.refreshRetryAt = Date.now() + 15_000;
                            st.done = true;
                        }
                    });
            },
            done: () => st.done,
        };
    }

    idleSteps(ms) {
        const wait = ms || this.refreshSeconds * 1_000;
        const st = { until: 0 };
        return {
            name: 'Idle',
            status: 'Idle',
            timeout: 0,
            enter: () => {
                st.until = Date.now() + wait;
            },
            done: () => Date.now() >= st.until,
        };
    }

    scanOrdersSteps() {
        return [
            this.openOrdersStep(),
            this.doneStep(() => {
                this.scanOrders();
                this.adoptOrders();
                this.ordersScanned = true;
                this.ordersScannedAt = Date.now();
            }),
        ];
    }

    claimSteps() {
        const st = { slot: -1, none: false };
        return [
            this.openOrdersStep(),
            {
                name: 'Claim orders',
                status: 'Claiming books',
                enter: () => {
                    if (!this.isOrdersGui()) {
                        this.runCommand('managebazaarorders');
                        return;
                    }
                    this.scanOrders();
                    const slot = this.findClaimableVSlot();
                    if (slot < 0) {
                        st.none = true;
                        return;
                    }
                    this.claimedSlots.set(slot, Date.now());
                    this.safeClick(slot);
                    st.clickedAt = Date.now();
                    st.mark = this.chatSeq;
                },
                done: () =>
                    st.none ||
                    this.chatSince(st.mark, /you don't have the space required to claim that/i) ||
                    (st.clickedAt && this.isOrdersGui() && Date.now() - st.clickedAt > 600),
                next: () => (st.none ? [this.doneStep(() => {})] : this.claimSteps()),
            },
        ];
    }

    // ───────────────────────────── cleanup ─────────────────────────────

    cleanupSteps(phase) {
        const st = { target: null, empty: false, qty: 0 };
        const prefix = phase === 'sells' ? 'sell ' : 'buy ';
        return [
            this.openOrdersStep(),
            {
                name: 'Find ' + phase + ' order',
                status: 'Cleaning ' + phase,
                enter: () => {
                    if (!this.isOrdersGui()) {
                        this.runCommand('managebazaarorders');
                        return;
                    }
                    this.scanOrders();
                    const orders = phase === 'buys' ? this.openBuyOrders : this.openSellOrders;
                    if (!orders.length) {
                        st.empty = true;
                        return;
                    }
                    st.target = orders[0];
                    const slot = this.findOrderSlot(st.target, new Set(), prefix);
                    if (slot < 0) {
                        st.empty = true;
                        return;
                    }
                    this.safeClick(slot);
                },
                done: () => st.empty || this.guiIs('order options'),
                next: () =>
                    st.empty
                        ? [this.doneStep(() => (this.lastCancelEmpty = true))]
                        : [this.cancelOrderClickStep(st), this.doneStep(() => this.removeTarget(st.target))],
            },
        ];
    }

    cancelOrderClickStep(st) {
        return {
            name: 'Cancel order',
            status: 'Cancelling',
            screen: () => this.guiIs('order options'),
            enter: () => {
                const slot = this.findSlot('Cancel Order', false);
                if (slot < 0) {
                    this.debugGui('cancel: no Cancel Order');
                    return;
                }
                const missing = lore(this.items()[slot]).find((line) => /missing items?/i.test(line));
                st.qty = Number(missing?.match(/([\d,]+)x/i)?.[1]?.replace(/,/g, '')) || 0;
                this.safeClick(slot);
            },
            done: () => this.isOrdersGui(),
        };
    }

    // ───────────────────────────── combine (forked anvil) ─────────────────────────────

    combineSteps() {
        const st = { first: -1, second: -1, none: false, t0: 0 };
        return [
            this.anvilOpenStep(),
            {
                name: 'Anvil: ready',
                status: 'Combining',
                enter: () => {
                    st.none = !this.findCombinePair();
                },
                done: () => st.none || this.anvilHint('left and right'),
                next: () => (st.none ? [] : this.anvilPairSteps(st)),
            },
        ];
    }

    anvilPairSteps(st) {
        return [
            {
                name: 'Anvil: place books',
                status: 'Combining',
                enter: () => {
                    const pair = this.findCombinePair();
                    if (!pair) {
                        st.none = true;
                        return;
                    }
                    st.first = pair[0].slot;
                    st.second = pair[1].slot;
                    this.safeClick(st.first, true);
                    st.t0 = Date.now();
                },
                done: () => st.none || Date.now() - st.t0 >= Math.max(this.clickDelay, 250),
                next: () => (st.none ? [] : this.anvilFinishSteps(st)),
            },
        ];
    }

    anvilFinishSteps(st) {
        return [
            {
                name: 'Anvil: place second',
                enter: () => {
                    if (st.second >= 0) this.safeClick(st.second, true);
                },
                done: () => this.anvilHint('cost'),
            },
            {
                name: 'Anvil: take result',
                enter: () => {
                    if (this.items().length > 22) this.safeClick(22);
                },
                done: () => this.anvilHint('claim the result'),
            },
            {
                name: 'Anvil: extract',
                enter: () => {
                    if (this.items().length > 13) this.safeClick(13, true);
                },
                done: () => this.anvilHint('left and right') || !this.findCombinePair(),
                next: () => (this.findCombinePair() ? this.combineSteps() : []),
            },
        ];
    }

    anvilOpenStep() {
        return {
            name: 'Open anvil',
            status: 'Combining',
            enter: () => {
                if (!this.guiIs('anvil')) this.runCommand('anvil');
            },
            done: () => this.guiIs('anvil'),
        };
    }

    anvilHint(text) {
        const item = this.items()[22];
        return lore(item).join(' ').toLowerCase().includes(text);
    }

    findCombinePair() {
        const items = this.items();
        const groups = new Map();
        for (let slot = 30; slot < items.length; slot++) {
            const info = bookFromItem(items[slot]);
            if (!info || info.level > SELL_TIER - 1) continue;
            const key = info.book.key + ':' + info.level;
            if (!groups.has(key)) groups.set(key, { slots: [] });
            groups.get(key).slots.push(slot);
        }
        for (const group of groups.values()) {
            if (group.slots.length >= 2) return [{ slot: group.slots[0] }, { slot: group.slots[1] }];
        }
        return null;
    }

    // ───────────────────────────── buy ─────────────────────────────

    buySteps(target) {
        const st = { amount: Math.max(1, Math.floor(Number(target.quantity) || Number(target.units) || 0)) || 1, price: target.orderPrice || 0, mark: 0, ok: false, safe: true };
        this.target = target;
        const productScreen = () => this.findBookSlot(target.book, target.input) >= 0;
        const buyMenu = () => this.hasSlot('Create Buy Order');
        const amountScreen = () => this.hasSlot('Custom Amount');
        const priceScreen = () => this.hasSlot('Top Order +0.1');
        const confirmScreen = () => this.hasSlot('Buy Order');
        return [
            this.closeGuiStep(),
            {
                name: 'Open ' + target.name,
                status: 'Buying ' + target.name,
                screen: productScreen,
                open: () => this.runCommand('bz ' + target.name),
                done: productScreen,
            },
            {
                name: 'Select ' + target.name,
                screen: productScreen,
                enter: () => this.safeClick(this.findBookSlot(target.book, target.input)),
                done: buyMenu,
            },
            {
                name: 'Create Buy Order',
                screen: buyMenu,
                enter: () => this.safeClick(this.findSlot('Create Buy Order')),
                done: amountScreen,
            },
            {
                name: 'Custom Amount',
                screen: amountScreen,
                enter: () => {
                    const slot = this.findSlot('Custom Amount');
                    this.capAmount(slot, st);
                    this.safeClick(slot);
                },
                while: () => {
                    if (this.isSignGui()) return;
                    const slot = this.findSlot('Custom Amount');
                    if (slot >= 0) this.safeClick(slot);
                },
                done: () => this.isSignGui(),
            },
            {
                name: 'Enter amount',
                enter: () => {
                    if (this.isSignGui()) this.submitSign(st.amount);
                },
                while: () => {
                    if (this.isSignGui()) this.submitSign(st.amount);
                },
                done: priceScreen,
            },
            {
                name: 'Top Order +0.1',
                screen: priceScreen,
                enter: () => {
                    const slot = this.findSlot('Top Order +0.1');
                    st.price = this.unitPrice(this.items()[slot]);
                    this.safeClick(slot);
                },
                while: () => {
                    if (confirmScreen()) return;
                    const slot = this.findSlot('Top Order +0.1');
                    if (slot >= 0) this.safeClick(slot);
                },
                done: () => confirmScreen(),
            },
            {
                name: 'Submit buy order',
                screen: confirmScreen,
                enter: () => {
                    st.mark = this.chatSeq;
                    st.clicked = false;
                    st.slot = this.findSlot('Buy Order');
                    this.debugGui('confirm screen');
                },
                while: () => {
                    if (this.chatSince(st.mark, /Buy Order Setup!/i)) return;
                    if (!this.isInGui() || st.slot < 0) return;
                    const name = ChatLib.removeFormatting(String(Player.getContainer()?.getStackInSlot(st.slot)?.getName?.() ?? '')).trim().toLowerCase();
                    if (name === 'warning' || name === 'confirm') {
                        this.safeClick(st.slot);
                        return;
                    }
                    if (!st.clicked) {
                        st.clicked = true;
                        this.safeClick(st.slot);
                    }
                },
                done: () => {
                    if (this.chatSince(st.mark, /Buy Order Setup!/i)) {
                        st.ok = true;
                        return true;
                    }
                    if (this.chatSince(st.mark, /maximum of [\d,]+ Bazaar orders/i)) return true;
                    if (this.chatSince(st.mark, /not enough coins|couldn't afford|can't afford/i)) return true;
                    if (this.chatSince(st.mark, /on cooldown/i)) return true;
                    if (st.clicked && !this.isInGui()) {
                        st.ok = true;
                        return true;
                    }
                    return false;
                },
            },
            this.finishBuyStep(target, st),
        ];
    }

    finishBuyStep(target, st) {
        return this.doneStep(() => {
            const index = this.orderQueue.indexOf(target);
            if (index >= 0) this.orderQueue.splice(index, 1);
            if (st.ok) {
                this.activeTargets.push({ ...target, orderPrice: Number.isFinite(st.price) ? st.price : target.orderPrice, quantity: st.amount });
                this.skippedIds.delete(target.id);
            } else {
                this.skippedIds.set(target.id, Date.now() + 60_000);
            }
            this.ordersScanned = false;
            this.target = null;
        });
    }

    // ───────────────────────────── sell ─────────────────────────────

    sellSteps() {
        const book = (this.pendingSell && this.pendingSell.book) || this.enabledBooks().find((candidate) => this.countLevel(candidate, SELL_TIER) > 0);
        const name = bookName(book, SELL_TIER);
        const st = { mark: 0 };
        this.target = { name, book, level: SELL_TIER, orderPrice: 0 };
        const sellMenu = () => this.hasSlot('Create Sell Offer');
        const priceScreen = () => this.hasSlot('Best Offer -0.1');
        const confirmScreen = () => this.hasSlot('Sell Offer');
        return [
            this.closeGuiStep(),
            {
                name: 'Open bazaar',
                status: 'Selling ' + name,
                screen: () => !!Player.getContainer(),
                open: () => this.runCommand('bz'),
                done: () => !!Player.getContainer(),
            },
            {
                name: 'Select ' + name,
                screen: () => !!Player.getContainer(),
                enter: () => this.safeClick(this.findInventoryBookSlot(book, SELL_TIER)),
                done: sellMenu,
            },
            {
                name: 'Create Sell Offer',
                screen: sellMenu,
                enter: () => this.safeClick(this.findSlot('Create Sell Offer')),
                done: priceScreen,
            },
            {
                name: 'Best Offer -0.1',
                screen: priceScreen,
                enter: () => this.safeClick(this.findSlot('Best Offer -0.1')),
                while: () => {
                    if (confirmScreen()) return;
                    const slot = this.findSlot('Best Offer -0.1');
                    if (slot >= 0) this.safeClick(slot);
                },
                done: confirmScreen,
            },
            {
                name: 'Submit sell offer',
                screen: confirmScreen,
                enter: () => {
                    st.mark = this.chatSeq;
                    st.clicked = false;
                    st.slot = this.findSlot('Sell Offer');
                },
                while: () => {
                    if (this.chatSince(st.mark, /Sell Offer Setup!/i)) return;
                    if (!this.isInGui() || st.slot < 0) return;
                    const label = ChatLib.removeFormatting(String(Player.getContainer()?.getStackInSlot(st.slot)?.getName?.() ?? '')).trim().toLowerCase();
                    if (label === 'warning' || label === 'confirm') {
                        this.safeClick(st.slot);
                        return;
                    }
                    if (!st.clicked) {
                        st.clicked = true;
                        this.safeClick(st.slot);
                    }
                },
                done: () => {
                    if (this.chatSince(st.mark, /Sell Offer Setup!/i)) return true;
                    if (this.chatSince(st.mark, /maximum of [\d,]+ Bazaar orders/i)) return true;
                    if (this.chatSince(st.mark, /not enough coins|couldn't afford|can't afford/i)) return true;
                    if (this.chatSince(st.mark, /on cooldown/i)) return true;
                    if (st.clicked && !this.isInGui()) return true;
                    return false;
                },
            },
            this.doneStep(() => {
                this.target = null;
                this.pendingSell = null;
                this.ordersScanned = false;
            }),
        ];
    }

    // ───────────────────────────── relist ─────────────────────────────

    relistBuySteps() {
        const target = this.orderCheckQueue[0];
        const st = { missing: false, qty: 0, outbid: false, top: NaN };
        this.target = target;
        const productScreen = () => this.findBookSlot(target.book, target.input) >= 0;
        const buyMenu = () => this.hasSlot('Create Buy Order');
        return [
            this.closeGuiStep(),
            {
                name: 'Open ' + target.name,
                status: 'Checking ' + target.name,
                screen: productScreen,
                open: () => this.runCommand('bz ' + target.name),
                done: productScreen,
            },
            {
                name: 'Select ' + target.name,
                screen: productScreen,
                enter: () => this.safeClick(this.findBookSlot(target.book, target.input)),
                done: buyMenu,
            },
            {
                name: 'Read top order',
                screen: buyMenu,
                enter: () => {
                    const slot = this.findSlot('Create Buy Order');
                    st.top = this.topBuyOrderPrice(this.items()[slot]);
                    st.outbid = Number.isFinite(st.top) && st.top > target.orderPrice + 0.001;
                    this.log(`&7${target.name}: top ${formatCoins(st.top)} vs ours ${formatCoins(target.orderPrice)} -> ${st.outbid ? 'outbid' : 'ok'}`);
                },
                done: () => Number.isFinite(st.top),
                next: () => (st.outbid ? this.cancelOrderSteps(target, st, 'buy', true) : [this.skipRelistStep(target, 'buy')]),
            },
        ];
    }

    relistSellSteps() {
        const target = this.sellCheckQueue[0];
        const st = { missing: false, qty: 0, undercut: false, top: NaN };
        this.target = target;
        const productScreen = () => this.findBookSlot(target.book, SELL_TIER) >= 0;
        const sellMenu = () => this.hasSlot('Create Sell Offer');
        return [
            this.closeGuiStep(),
            {
                name: 'Open ' + target.name,
                status: 'Checking ' + target.name,
                screen: productScreen,
                open: () => this.runCommand('bz ' + target.name),
                done: productScreen,
            },
            {
                name: 'Select ' + target.name,
                screen: productScreen,
                enter: () => this.safeClick(this.findBookSlot(target.book, SELL_TIER)),
                done: sellMenu,
            },
            {
                name: 'Read best offer',
                screen: sellMenu,
                enter: () => {
                    const slot = this.findSlot('Create Sell Offer');
                    st.top = this.topSellOfferPrice(this.items()[slot]);
                    st.undercut = Number.isFinite(st.top) && st.top < target.orderPrice - 0.001;
                    this.log(`&7${target.name}: best ${formatCoins(st.top)} vs ours ${formatCoins(target.orderPrice)} -> ${st.undercut ? 'undercut' : 'ok'}`);
                },
                done: () => Number.isFinite(st.top),
                next: () => (st.undercut ? this.cancelOrderSteps(target, st, 'sell', true) : [this.skipRelistStep(target, 'sell')]),
            },
        ];
    }

    cancelOrderSteps(target, st, phase, relist) {
        const prefix = phase === 'sell' ? 'sell ' : 'buy ';
        return [
            this.closeGuiStep(),
            this.openOrdersStep(),
            {
                name: 'Open order',
                status: 'Cancelling ' + target.name,
                screen: () => this.isOrdersGui(),
                enter: () => {
                    this.scanOrders();
                    const slot = this.findOrderSlot(target, new Set(), prefix);
                    if (slot < 0) {
                        st.missing = true;
                        return;
                    }
                    this.safeClick(slot);
                },
                done: () => st.missing || this.guiIs('order options'),
                next: () =>
                    st.missing
                        ? [this.skipRelistStep(target, phase)]
                        : [this.cancelOrderClickStep(st), this.doneStep(() => (relist ? this.finishRelist(target, st, phase) : this.skipRelistStep(target, phase, true)))],
            },
        ];
    }

    skipRelistStep(target, phase, runNow = false) {
        const action = () => {
            if (phase === 'sell') this.sellCheckQueue = this.sellCheckQueue.filter((entry) => entry !== target);
            else this.orderCheckQueue = this.orderCheckQueue.filter((entry) => entry !== target);
            this.ordersScanned = false;
            this.target = null;
        };
        if (runNow) action();
        return this.doneStep(action);
    }

    finishRelist(target, st, phase) {
        if (phase === 'sell') {
            this.sellCheckQueue = this.sellCheckQueue.filter((entry) => entry !== target);
            this.ordersScanned = false;
            this.target = null;
            const best = st.top;
            if (!(best > 0)) return;
            const price = Math.max(0.1, Math.floor((best - 0.1) * 10) / 10);
            const slot = this.findInventoryBookSlot(target.book, SELL_TIER);
            const units = this.countLevel(target.book, SELL_TIER);
            if (slot >= 0 && units > 0) this.pendingSell = { book: target.book, level: SELL_TIER, price };
            return;
        }
        this.orderCheckQueue = this.orderCheckQueue.filter((entry) => entry !== target);
        this.removeTarget(target);
        this.ordersScanned = false;
        this.target = null;
        const top = st.top;
        if (!(top > 0)) return;
        const price = Math.ceil((top + 0.1) * 10) / 10;
        const units = target.units;
        const qty = st.qty > 0 ? st.qty : Number(target.quantity) || units;
        const quantity = Math.floor(Math.min(qty, Math.floor(this.budget / price)) / units) * units;
        if (quantity >= units && this.flipProfit(target.book, target.input, price) >= this.minProfit) {
            this.orderQueue.unshift({ ...target, quantity, orderPrice: price, expectedOrderPrice: price, outputCount: quantity / units });
        }
    }

    // ───────────────────────────── prices ─────────────────────────────

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
                if (this.skippedIds.get(bookId(book, input)) > Date.now()) continue;
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
            if (chosen.length >= Math.max(0, this.maxBuyOrders - this.activeTargets.length)) break;
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

    flipProfit(book, input, price) {
        const outProduct = this.bazaarData?.products?.[bookId(book, SELL_TIER)];
        const revenuePerV = askPrice(outProduct) * (1 - this.undercutPercent / 100) * (1 - this.taxPercent / 100);
        return revenuePerV - price * unitsFor(input);
    }

    topBuyOrderPrice(item) {
        const prices = lore(item)
            .map((line) => Number(line.match(/^- ([\d,.]+) coins? each\b/i)?.[1]?.replace(/,/g, '')))
            .filter(Number.isFinite);
        return prices.length ? Math.max(...prices) : NaN;
    }

    topSellOfferPrice(item) {
        return this.topBuyOrderPrice(item);
    }

    // ───────────────────────────── orders ─────────────────────────────

    scanOrders() {
        const items = this.items();
        const end = this.guiEnd();
        const buyOrders = [];
        const sellOrders = [];
        let count = 0;
        for (let slot = 0; slot < end; slot++) {
            const stack = items[slot];
            const name = clean(stack?.getName?.());
            const match = name.match(/^(buy|sell) (.+)$/);
            if (!match) continue;
            count++;
            const amount = Number(
                lore(stack)
                    .find((line) => /^(order amount|amount):\s*[\d,]+x/i.test(line))
                    ?.match(/[\d,]+/)?.[0]
                    ?.replace(/,/g, '')
            );
            const info = bookFromText(match[2]) || bookFromItem(stack);
            const claimMatch = lore(stack).join(' ').match(/you have ([\d,]+) items? to claim/i);
            const order = {
                id: this.skyblockItemId(stack),
                name: ChatLib.removeFormatting(String(stack.getName())).trim().replace(/^(BUY|SELL)\s+/i, ''),
                book: info ? info.book : null,
                level: info ? info.level : null,
                amount,
                claimable: claimMatch ? Number(claimMatch[1].replace(/,/g, '')) : 0,
                price: this.unitPrice(stack),
                slot,
            };
            (match[1] === 'buy' ? buyOrders : sellOrders).push(order);
        }
        this.openBuyOrders = buyOrders;
        this.openSellOrders = sellOrders;
        this.openOrderCount = count;
    }

    adoptOrders() {
        const adopted = [];
        for (const order of this.openBuyOrders) {
            if (!order.book || order.level == null || order.level >= SELL_TIER) continue;
            if (!order.book.buyTiers.includes(order.level)) continue;
            const units = unitsFor(order.level);
            const amount = Number.isFinite(order.amount) && order.amount > 0 ? order.amount : units;
            const price = Number.isFinite(order.price) ? order.price : 0;
            adopted.push({
                book: order.book,
                id: bookId(order.book, order.level),
                name: bookName(order.book, order.level),
                input: order.level,
                units,
                quantity: amount,
                outputCount: Math.floor(amount / units),
                orderPrice: price,
                expectedOrderPrice: price,
                profit: 0,
            });
        }
        this.activeTargets = adopted;
    }

    removeTarget(target) {
        if (!target?.book) return;
        const key = target.book.key + ':' + target.input;
        this.activeTargets = this.activeTargets.filter((entry) => !entry.book || entry.book.key + ':' + entry.input !== key);
    }

    // ───────────────────────────── claiming ─────────────────────────────

    containsClaimableV() {
        if (this.claimNoSpace) return false;
        return this.findClaimableVSlot() >= 0;
    }

    findClaimableVSlot() {
        const items = this.items();
        const end = this.guiEnd();
        for (let slot = 0; slot < end; slot++) {
            const claimedAt = this.claimedSlots.get(slot);
            if (claimedAt && Date.now() - claimedAt < 5_000) continue;
            const stack = items[slot];
            if (!clean(stack?.getName?.()).startsWith('buy ')) continue;
            const info = bookFromItem(stack);
            if (!info || info.level >= SELL_TIER || !info.book.buyTiers.includes(info.level)) continue;
            if (!lore(stack).some((line) => /^you have [\d,]+ items? to claim!?$/i.test(line))) continue;
            if (!this.claimMakesV(info.book)) continue;
            if (this.freeSlots() <= 2) continue;
            return slot;
        }
        return -1;
    }

    claimMakesV(book) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        if (this.noRoomToClaim()) return false;
        for (let level = 1; level < SELL_TIER; level++) counts[level] = this.countLevel(book, level);
        for (const order of this.openBuyOrders) {
            if (!order.book || order.book.key !== book.key || order.level == null || order.level >= SELL_TIER) continue;
            const amount = Number.isFinite(order.claimable) ? order.claimable : 0;
            if (amount > 0) counts[order.level] = (counts[order.level] || 0) + amount;
        }
        return this.canProduceV(counts);
    }

    canProduceV(counts) {
        const c = { 1: counts[1] || 0, 2: counts[2] || 0, 3: counts[3] || 0, 4: counts[4] || 0 };
        for (let level = 1; level < SELL_TIER; level++) c[level + 1] = (c[level + 1] || 0) + Math.floor(c[level] / 2);
        return (c[SELL_TIER] || 0) >= 1;
    }

    // ───────────────────────────── inventory ─────────────────────────────

    countLevel(book, level) {
        const now = Date.now();
        if (!this.countCache || now - this.countCacheAt > 500) {
            this.countCache = new Map();
            this.countCacheAt = now;
            for (const item of Player.getInventory()?.getItems() || []) {
                const info = bookFromItem(item);
                if (!info || info.level >= SELL_TIER + 1) continue;
                const key = info.book.key + ':' + info.level;
                this.countCache.set(key, (this.countCache.get(key) || 0) + Number(item.getStackSize() || 0));
            }
        }
        return this.countCache.get(book.key + ':' + level) || 0;
    }

    hasPair() {
        for (const book of this.enabledBooks()) {
            for (let level = 1; level < SELL_TIER; level++) {
                if (this.countLevel(book, level) >= 2) return true;
            }
        }
        return false;
    }

    hasSellableV() {
        return this.enabledBooks().some((book) => this.countLevel(book, SELL_TIER) > 0);
    }

    freeSlots() {
        const inv = Player.getInventory();
        if (!inv) return 0;
        const items = inv.getItems();
        let free = 0;
        for (let i = 0; i < Math.min(items.length, 36); i++) {
            const item = items[i];
            if (!item || item.getStackSize() <= 0) free++;
        }
        return free;
    }

    inventoryFull() {
        return this.freeSlots() <= 1;
    }

    noRoomToClaim() {
        return this.claimNoSpace || this.freeSlots() <= 2;
    }

    // ───────────────────────────── lookups ─────────────────────────────

    items() {
        return Player.getContainer()?.getItems() || [];
    }

    guiEnd() {
        const items = this.items();
        return items.length > 36 ? items.length - 36 : items.length;
    }

    guiName() {
        return clean(getGuiName());
    }

    guiIs(name) {
        const current = this.guiName();
        return !!current && current.includes(clean(name));
    }

    isOrdersGui() {
        if (this.guiIs('bazaar orders')) return true;
        const items = this.items();
        const end = this.guiEnd();
        for (let slot = 0; slot < end; slot++) {
            const name = ChatLib.removeFormatting(String(items[slot]?.getName?.() ?? '')).trim();
            if (/^(BUY|SELL)\s+.+/i.test(name)) return true;
        }
        return false;
    }

    screenMatches(screen) {
        if (!Player.getContainer()) return false;
        if (typeof screen === 'function') return !!screen.call(this);
        return this.guiIs(screen);
    }

    findSlot(name, exact = true) {
        const items = this.items();
        const end = this.guiEnd();
        const target = String(name);
        for (let slot = 0; slot < end; slot++) {
            const itemName = ChatLib.removeFormatting(String(items[slot]?.getName?.() ?? '')).trim();
            if ((exact && itemName === target) || (!exact && itemName.toLowerCase().includes(target.toLowerCase()))) return slot;
        }
        return -1;
    }

    hasSlot(name, exact = true) {
        return this.findSlot(name, exact) >= 0;
    }

    safeClick(slot, shift = false) {
        if (slot < 0 || !Player.getContainer()) return false;
        return clickSlot(slot, shift);
    }

    findInventoryBookSlot(book, level) {
        const items = this.items();
        for (let slot = 36; slot < items.length; slot++) {
            const info = bookFromItem(items[slot]);
            if (info && info.book.key === book.key && info.level === level) return slot;
        }
        return -1;
    }

    findBookSlot(book, level) {
        const items = this.items();
        const end = this.guiEnd();
        for (let slot = 0; slot < end; slot++) {
            const info = bookFromItem(items[slot]);
            if (info && info.book.key === book.key && info.level === level) return slot;
        }
        return -1;
    }

    findOrderSlot(target, excluded = new Set(), prefix = 'buy ') {
        const items = this.items();
        const end = this.guiEnd();
        const targetName = clean(target.name);
        let fallback = -1;
        for (let slot = 0; slot < end; slot++) {
            if (excluded.has(slot)) continue;
            const stack = items[slot];
            const name = clean(stack?.getName?.());
            if (!name.startsWith(prefix)) continue;
            const stripped = name.slice(prefix.length);
            const info = bookFromText(stripped) || bookFromItem(stack);
            const matches =
                stripped === targetName ||
                (info && target.book && info.book.key === target.book.key && (target.level == null || info.level === target.level));
            if (!matches) continue;
            if (fallback === -1) fallback = slot;
            const price = this.unitPrice(stack);
            if (Number.isFinite(price) && Number.isFinite(target.orderPrice) && Math.abs(price - target.orderPrice) <= 0.001) return slot;
        }
        return fallback;
    }

    isSafePrice(book, input, price) {
        if (!Number.isFinite(price) || price <= 0) return false;
        return this.flipProfit(book, input, price) >= this.minProfit;
    }

    capAmount(slot, st) {
        const limit = Number(
            lore(this.items()[slot])
                .find((line) => /^buy up to [\d,]+x\.?$/i.test(line))
                ?.match(/[\d,]+/)?.[0]
                ?.replace(/,/g, '')
        );
        if (limit > 0) st.amount = Math.min(st.amount, limit);
        st.amount = Math.max(1, Math.floor(Number(st.amount) || 0)) || 1;
    }

    unitPrice(item) {
        const line = lore(item).find((value) => /(?:price per unit|unit price)/i.test(value));
        if (!line) return NaN;
        const match = line.match(/([\d,.]+)\s*([kmb])?/i);
        if (!match) return NaN;
        let value = Number(match[1].replace(/,/g, ''));
        if (!Number.isFinite(value)) return NaN;
        const suffix = (match[2] || '').toLowerCase();
        if (suffix === 'k') value *= 1e3;
        else if (suffix === 'm') value *= 1e6;
        else if (suffix === 'b') value *= 1e9;
        return value;
    }

    isSignGui() {
        try {
            return !!Client.currentGui?.getClassName?.().includes('Sign');
        } catch (error) {
            return false;
        }
    }

    submitSign(amount) {
        if (!this.isSignGui()) return;
        setSignLine(1, Math.max(1, Math.floor(Number(amount) || 0)) || 1);
        Client.currentGui.close();
    }

    isInGui() {
        try {
            return !!Client.isInGui();
        } catch (error) {
            return false;
        }
    }

    skyblockItemId(item) {
        let data = '';
        try {
            data = String(item?.toMC?.()?.get?.(DataComponents.CUSTOM_DATA)?.copyTag?.() || '');
        } catch (error) {}
        if (!data) data = String(item?.getNBT?.() || '');
        return data.match(/\bid\s*[:=]\s*"?([^",}\s]+)/i)?.[1] || null;
    }

    runCommand(command) {
        try {
            ChatLib.command(command);
        } catch (error) {
            console.error('[BookFlipper] command failed (' + command + '): ' + error);
        }
    }

    debugGui(context) {
        const gui = this.guiName();
        const key = context + '|' + gui;
        if (this.guiDebugSeen[key]) return;
        this.guiDebugSeen[key] = true;
        this.debugGuiOnce(context);
    }

    debugGuiOnce(context) {
        const gui = this.guiName();
        const items = this.items();
        const slots = items
            .map((item, slot) => `${slot}:${clean(item?.getName?.())}`)
            .filter((entry) => !entry.endsWith(':'));
        console.log(`[BookFlipper] GUI DEBUG (${context}) gui="${gui}" slots=${slots.join(' | ')}`);
        this.message(`&8[DBG ${context}] &7gui=&f${gui} &7${slots.join(' ')}`);
    }

    report() {
        this.message(`&bBook Flipper&f: ${this.status} | Enchanting ${this.enchantingLevel ?? '?'}`);
        this.message(`  Buy orders: ${this.activeTargets.length}/${this.maxBuyOrders} | Books: ${this.enabledBooks().map((book) => book.name).join(', ')}`);
        for (const target of this.activeTargets) {
            this.message(`  &7${target.name} @ ${formatCoins(target.orderPrice)} (${target.quantity}x)`);
        }
    }

    fail(message) {
        this.message('&c' + message);
        this.toggle(false);
    }
}

new BookFlipper();
