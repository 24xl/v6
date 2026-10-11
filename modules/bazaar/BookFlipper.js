import requestV2 from '../../utils/Request';
import { chat } from '../../utils/Chat';
import { ModuleBase } from '../../utils/ModuleBase';
import { v5Command } from '../../utils/V5Commands';
import { closeInventory, getGuiName } from '../../utils/player/Inventory';
import { enchantKeyFromId, readEnchantingFromContainer, requiredEnchanting } from '../../utils/Skills';

const BAZAAR_URL = 'https://api.hypixel.net/v2/skyblock/bazaar';
const MAX_ORDER_QTY = 256;
const DEFAULT_BOOKS = ['rejuvenate'];

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
            tooltip: 'Planner (read-only). Buys via buy orders, combines fills, and sells the top tier.',
            isMacro: true,
        });
        this.bindToggleKey();

        this.taxPercent = 1.25;
        this.minInputFlow = 5;
        this.minOutputFlow = 5;
        this.minProfit = 0;
        this.undercutPercent = 0.1;
        this.capturePercent = 25;
        this.maxBooks = 3;
        this.budget = 10_000_000;
        this.skillGate = true;
        this.enchantingLevel = null;

        this.flips = [];
        this.status = 'Idle';
        this.lastRefresh = 0;
        this.refreshInterval = 60_000;
        this.state = 'IDLE';

        this.addSlider('Per-Order Budget (M)', 0.1, 100, 10, (millions) => (this.budget = millions * 1_000_000), 'Max coins per buy order (also capped at 256 books).');
        this.addSlider('Max Books', 1, 3, 3, (value) => (this.maxBooks = Math.round(value)), 'How many enchant books to run at once.');
        this.addSlider('Bazaar Tax (%)', 0, 3, 1.25, (value) => (this.taxPercent = value), 'Bazaar sell tax applied to the sell value.');
        this.addSlider('Min Input Flow (/hr)', 0, 500, 5, (value) => (this.minInputFlow = value), 'Only buy input tiers that actually sell this often.');
        this.addSlider('Min Output Flow (/hr)', 0, 500, 5, (value) => (this.minOutputFlow = value), 'Only target top tiers that actually get bought this often.');
        this.addSlider('Min Profit', 0, 10_000_000, 0, (value) => (this.minProfit = value), 'Minimum coins profit per finished book.');
        this.addSlider('Undercut (%)', 0, 5, 0.1, (value) => (this.undercutPercent = value), 'How far below the lowest sell offer to list.');
        this.addSlider('Capture (%)', 0, 100, 25, (value) => (this.capturePercent = value), 'Share of the output flow you realistically capture (for profit/hr).');
        this.addToggle('Enchanting Skill Gate', (value) => (this.skillGate = !!value), 'Skip enchants whose required Enchanting level is above yours.', true);
        this.addButton('List Book Flips', () => this.listFlips(10), 'Print the current top book flips.');

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

    fail(message) {
        this.status = message;
        this.message(`&c${message}`);
    }

    onEnable() {
        this.status = 'Loading';
        this.flips = [];
        this.enchantingLevel = null;
        this.state = this.skillGate ? 'READING_SKILLS' : 'FETCHING';
        if (this.skillGate) {
            try {
                closeInventory();
                ChatLib.command('skills');
            } catch (e) {
                this.message('&cCould not open /skills.');
                this.state = 'FETCHING';
            }
        } else {
            this.fetchPrices();
        }
    }

    onDisable() {
        this.status = 'Idle';
        this.flips = [];
        this.state = 'IDLE';
    }

    tick() {
        if (!this.enabled) return;

        if (this.state === 'READING_SKILLS') {
            const name = String(getGuiName() ?? '').toLowerCase();
            if (!name.includes('skill')) return;
            const result = readEnchantingFromContainer(Player.getContainer());
            if (result) {
                this.enchantingLevel = result.level;
                console.log(`[BookFlipper] Enchanting=${result.level} name="${result.name}"`);
                if (result.level == null) {
                    console.log(`[BookFlipper] skills item lore: ${JSON.stringify(result.lore)}`);
                    this.message('&eCould not parse Enchanting level (see log). Gate skipped.');
                }
            }
            closeInventory();
            this.state = 'FETCHING';
            this.fetchPrices();
            return;
        }

        if (this.state === 'IDLE' && Date.now() - this.lastRefresh >= this.refreshInterval) {
            this.fetchPrices();
        }
    }

    fetchPrices() {
        this.status = 'Fetching bazaar';
        const token = (this.requestToken = (this.requestToken || 0) + 1);
        requestV2({ url: BAZAAR_URL, method: 'GET', json: true, timeout: 10_000 })
            .then((bazaar) => {
                if (!this.enabled || token !== this.requestToken) return;
                if (!bazaar?.success) return this.fail('Could not load Bazaar prices.');
                this.flips = this.computeFlips(bazaar.products || {});
                this.lastRefresh = Date.now();
                this.status = `Ready (${this.flips.length} flips)`;
                this.state = 'IDLE';
            })
            .catch(() => this.fail('Could not load Bazaar prices.'));
    }

    computeFlips(products) {
        const families = {};
        for (const id of Object.keys(products)) {
            const key = enchantKeyFromId(id);
            if (!key) continue;
            const level = Number(String(id).match(/_(\d+)$/)?.[1]);
            (families[key] ||= {})[level] = products[id];
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
                    if (inBid <= 0 || inAsk <= 0) continue;
                    if (inBid / inAsk < 0.1) continue;
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

                const revenue = outAsk * (1 - undercut) * (1 - tax);
                const profit = revenue - cost;
                if (profit < this.minProfit) continue;
                const profitPerHour = profit * outFlow * capture;

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
                    inputFlow: input != null ? sellFlow(tiers[input]) : 0,
                    required,
                    budgetQty: Math.min(MAX_ORDER_QTY, Math.floor(this.budget / Math.max(1, bid(tiers[input])))),
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
        this.message(`&bBook flips (&f${this.flips.length}&b):`);
        this.flips.slice(0, count).forEach((f) => {
            this.message(
                `  &f${f.key} &7| ${f.need}x T${f.input} -> T${f.output} &7| cost &6${formatCoins(f.cost)}&7, sell &a${formatCoins(
                    f.revenue
                )}&7, profit &a${formatCoins(f.profit)} &7| &e~${formatCoins(f.profitPerHour)}/hr &7(req enc ${f.required})`
            );
        });
        chat('');
    }
}

new BookFlipper();
