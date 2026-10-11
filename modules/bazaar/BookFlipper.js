import requestV2 from '../../utils/Request';
import { ModuleBase } from '../../utils/ModuleBase';
import { v5Command } from '../../utils/V5Commands';
import { closeInventory, getGuiName } from '../../utils/player/Inventory';
import { enchantKeyFromId, readEnchantingFromContainer, requiredEnchanting } from '../../utils/Skills';

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const COMMAND_CAPACITY = 10;
const COMMAND_RESTORE_TIME = 1_050;
const REFRESH_MS = 60_000;
const FAIL_RETRY_MS = 30_000;
const RETRY_MS = 4_000;
const MAX_ORDER_QTY = 256;
const DEFAULT_BOOKS = ['rejuvenate'];

const clean = (value) =>
    ChatLib.removeFormatting(String(value ?? ''))
        .trim()
        .replace(/^[^a-z0-9]+/i, '')
        .toLowerCase();

const formatCoins = (value) => {
    const n = Number(value) || 0;
    const unit = [
        { minimum: 1e9, suffix: 'B' },
        { minimum: 1e6, suffix: 'M' },
        { minimum: 1e3, suffix: 'K' },
    ].find((entry) => Math.abs(n) >= entry.minimum);
    return unit ? `${(n / unit.minimum).toFixed(2)}${unit.suffix}` : Math.round(n).toLocaleString();
};

const bid = (product) => Number(product?.quick_status?.sellPrice) || 0;
const ask = (product) => Number(product?.quick_status?.buyPrice) || 0;
const sellFlow = (product) => (Number(product?.quick_status?.sellMovingWeek) || 0) / 168;
const buyFlow = (product) => (Number(product?.quick_status?.buyMovingWeek) || 0) / 168;

class BookFlipper extends ModuleBase {
    constructor() {
        super({
            name: 'Book Flipper',
            subcategory: 'Bazaar',
            description: 'Finds profitable enchant-book ladders: buy the cheapest active input tier(s), combine to the top tier, sell it.',
            tooltip: 'Planner (read-only for now). Reads your Enchanting level, then lists the best book flips.',
            isMacro: true,
        });
        this.bindToggleKey();

        this.clickDelay = 350;
        this.addSlider('Click Delay (ms)', 50, 2_000, 350, (value) => (this.clickDelay = value), 'Delay between Bazaar clicks.');
        this.maxBooks = 3;
        this.addSlider('Max Books', 1, 3, 3, (value) => (this.maxBooks = Math.round(value)), 'How many enchant books to run at once.');
        this.budget = 10_000_000;
        this.addSlider('Per-Order Budget (M)', 0.1, 100, 10, (value) => (this.budget = value * 1_000_000), 'Max coins per buy order (also capped at 256 books).');
        this.taxPercent = 1.25;
        this.addSlider('Bazaar Tax (%)', 0, 3, 1.25, (value) => (this.taxPercent = value), 'Bazaar sell tax applied to the sell value.');
        this.minInputFlow = 5;
        this.addSlider('Min Input Flow (/hr)', 0, 500, 5, (value) => (this.minInputFlow = value), 'Only buy input tiers that actually sell this often.');
        this.minOutputFlow = 5;
        this.addSlider('Min Output Flow (/hr)', 0, 500, 5, (value) => (this.minOutputFlow = value), 'Only target top tiers that get bought this often.');
        this.minProfit = 0;
        this.addSlider('Min Profit', 0, 10_000_000, 0, (value) => (this.minProfit = value), 'Minimum coins profit per finished book.');
        this.undercutPercent = 0.1;
        this.addSlider('Undercut (%)', 0, 5, 0.1, (value) => (this.undercutPercent = value), 'How far below the lowest sell offer to list.');
        this.capturePercent = 25;
        this.addSlider('Capture (%)', 0, 100, 25, (value) => (this.capturePercent = value), 'Share of output flow captured, for profit/hr.');
        this.skillGate = true;
        this.addToggle('Enchanting Skill Gate', (value) => (this.skillGate = !!value), 'Skip enchants whose required Enchanting level is above yours.', true);
        this.addButton('Refresh Prices', () => this.setAction(this.fetchPrices, 'Refreshing', 0, 25_000), 'Re-fetch Bazaar prices now.');
        this.addButton('Read Enchanting', () => this.setAction(this.readSkills, 'Reading Enchanting', 0, 15_000), 'Re-read your Enchanting level from /skills.');

        this.status = 'Idle';
        this.flips = [];
        this.enchantingLevel = null;
        this.skillReadAttempts = 0;

        this.action = null;
        this.nextActionAt = 0;
        this.deadline = 0;
        this.retryAction = null;
        this.retryAt = 0;
        this.requestToken = 0;
        this.commandTokens = COMMAND_CAPACITY;
        this.commandRefillAt = Date.now();

        this.createOverlay([
            {
                title: 'Book Flipper',
                data: {
                    State: () => this.status,
                    'Enchanting Lvl': () => (this.enchantingLevel == null ? '—' : `${this.enchantingLevel}`),
                    Books: () => `${this.flips.length}`,
                },
            },
            {
                title: 'Best Flip',
                data: {
                    Enchant: () => this.flips[0]?.key || 'None',
                    Ladder: () => (this.flips[0] ? `${this.flips[0].need}x T${this.flips[0].input} -> T${this.flips[0].output}` : '—'),
                    Profit: () => (this.flips[0] ? `${formatCoins(this.flips[0].profit)} coins` : '—'),
                    'Profit/hr': () => (this.flips[0] ? `${formatCoins(this.flips[0].profitPerHour)} coins` : '—'),
                },
            },
        ]);

        this.on('tick', () => this.tick());
        v5Command('bazaar books', () => this.listFlips(10));
    }

    onEnable() {
        this.status = 'Starting';
        this.flips = [];
        this.enchantingLevel = null;
        this.action = null;
        this.retryAction = null;
        this.deadline = 0;
        this.skillReadAttempts = 0;
        this.setAction(this.readSkills, 'Reading Enchanting', 0, 15_000);
    }

    onDisable() {
        this.status = 'Idle';
        this.flips = [];
        this.action = null;
        this.retryAction = null;
        this.requestToken++;
    }

    tick() {
        if (!this.enabled) return;
        try {
            const now = Date.now();
            if (this.deadline && now >= this.deadline) return this.restart(`Timed out while ${this.status.toLowerCase()}.`);
            if (this.retryAction && now >= this.retryAt) {
                this.retryAt = now + RETRY_MS;
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

    setAction(action, status, delay = this.clickDelay, timeout = 0, retryAction = null) {
        this.action = action;
        this.status = status;
        this.nextActionAt = Date.now() + delay;
        this.deadline = timeout ? Date.now() + timeout : 0;
        this.retryAction = retryAction;
        this.retryAt = retryAction ? Date.now() + RETRY_MS : 0;
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

    restart(message) {
        this.message(`&e${message}`);
        this.flips = [];
        this.action = null;
        this.retryAction = null;
        this.skillReadAttempts = 0;
        this.setAction(this.readSkills, 'Reading Enchanting', 500, 15_000);
    }

    fail(message) {
        this.status = message;
        this.message(`&c${message}`);
    }

    readSkills() {
        const gui = String(getGuiName() ?? '').toLowerCase();
        if (gui.includes('skill')) {
            try {
                const result = readEnchantingFromContainer(Player.getContainer());
                if (result?.level != null) {
                    this.enchantingLevel = result.level;
                    console.log(`[BookFlipper] Enchanting=${result.level}`);
                } else if (result) {
                    console.log(`[BookFlipper] skills item lore: ${JSON.stringify(result.lore)}`);
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
        this.status = 'Fetching bazaar';
        const token = ++this.requestToken;
        const retry = () => this.setAction(this.fetchPrices, 'Retrying', FAIL_RETRY_MS, 25_000);

        requestV2({ url: BAZAAR_URL, method: 'GET', json: true, timeout: 10_000 })
            .then((bazaar) => {
                if (!this.enabled || token !== this.requestToken) return;
                if (!bazaar?.success) {
                    this.fail('Could not load Bazaar prices.');
                    retry();
                    return;
                }
                this.flips = this.computeFlips(bazaar.products || {});
                this.status = `Ready (${this.flips.length})`;
                this.setAction(this.fetchPrices, `Ready (${this.flips.length})`, REFRESH_MS, 0);
            })
            .catch((error) => {
                console.error('[BookFlipper] fetch error: ' + error);
                if (this.enabled && token === this.requestToken) {
                    this.fail('Could not load Bazaar prices.');
                    retry();
                }
            });
    }

    computeFlips(products) {
        const families = {};
        for (const id of Object.keys(products)) {
            const key = enchantKeyFromId(id);
            if (!key) continue;
            const level = Number(String(id).match(/_(\d+)$/)?.[1]);
            if (!Number.isFinite(level)) continue;
            if (!families[key]) families[key] = {};
            families[key][level] = products[id];
        }

        const tax = this.taxPercent / 100;
        const undercut = this.undercutPercent / 100;
        const capture = this.capturePercent / 100;
        const flips = [];

        for (const key of Object.keys(families)) {
            const tiers = families[key];
            const levels = Object.keys(tiers).map(Number).sort((a, b) => a - b);

            const required = requiredEnchanting(key);
            if (this.skillGate && this.enchantingLevel != null && required > this.enchantingLevel) continue;

            let best = null;
            for (const output of levels) {
                const out = tiers[output];
                const outAsk = ask(out);
                const outFlow = buyFlow(out);
                if (outAsk <= 0 || outFlow < this.minOutputFlow) continue;

                let cost = Infinity;
                let input = null;
                let need = 0;
                for (const inputLevel of levels) {
                    if (inputLevel >= output) continue;
                    const inProduct = tiers[inputLevel];
                    const inBid = bid(inProduct);
                    const inAsk = ask(inProduct);
                    if (inBid <= 0 || inAsk <= 0 || inBid / inAsk < 0.1) continue;
                    if (sellFlow(inProduct) < this.minInputFlow) continue;

                    const units = 2 ** (output - inputLevel);
                    const optionCost = inBid * units;
                    if (optionCost < cost) {
                        cost = optionCost;
                        input = inputLevel;
                        need = units;
                    }
                }
                if (input == null) continue;

                const revenue = outAsk * (1 - this.undercutPercent / 100) * (1 - this.taxPercent / 100);
                const profit = revenue - cost;
                if (profit < this.minProfit) continue;
                const profitPerHour = profit * outFlow * (this.capturePercent / 100);
                const candidate = {
                    key,
                    input,
                    output,
                    need,
                    cost,
                    revenue,
                    profit,
                    profitPerHour,
                    outputFlow: outFlow,
                    inputFlow: sellFlow(tiers[input]),
                    required,
                    unitPrice: bid(tiers[input]),
                };
                if (!best || candidate.profitPerHour > best.profitPerHour) best = candidate;
            }
            if (best) flips.push(best);
        }

        const pinned = DEFAULT_BOOKS.map((k) => flips.find((f) => f.key === k)).filter(Boolean);
        const rest = flips.filter((f) => !DEFAULT_BOOKS.includes(f.key)).sort((a, b) => b.profitPerHour - a.profitPerHour);
        return [...pinned, ...rest].slice(0, Math.max(0, this.maxBooks));
    }

    listFlips(count = 10) {
        if (!this.flips.length) return this.message('&eNo flips loaded yet.');
        this.message(`&bBook flips (&f${this.flips.length}&b), Enchanting ${this.enchantingLevel ?? '?'}:`);
        this.flips.slice(0, count).forEach((f) => {
            this.message(
                `  &f${f.key} &7| ${f.need}x T${f.input} -> T${f.output} &7| cost &6${formatCoins(f.cost)}&7, sell &a${formatCoins(
                    f.revenue
                )}&7, profit &a${formatCoins(f.profit)} &7| &e~${formatCoins(f.profitPerHour)}/hr &7(req enc ${f.required})`
            );
        });
    }
}

new BookFlipper();
