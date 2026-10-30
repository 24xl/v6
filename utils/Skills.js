const ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export const romanToInt = (value) => {
    const text = String(value ?? '').toUpperCase();
    const match = text.match(/^[IVXLCDM]+$/);
    if (!match) return null;

    let total = 0;
    const numerals = match[0];
    for (let i = 0; i < numerals.length; i++) {
        const current = ROMAN_VALUES[numerals[i]];
        const next = ROMAN_VALUES[numerals[i + 1]] ?? 0;
        total += current < next ? -current : current;
    }
    return total;
};

export const enchantKeyFromId = (id) => {
    const match = String(id ?? '').match(/^ENCHANTMENT_(.+)_\d+$/);
    return match ? match[1].toLowerCase() : null;
};

// Enchanting skill level required to APPLY each enchant (Hypixel wiki). Unknown = 0.
export const ENCHANT_REQUIREMENT = {
    scavenger: 1,
    aqua_affinity: 1,
    infinite_quiver: 2,
    harvesting: 2,
    luck: 3,
    cubism: 3,
    cleave: 4,
    angler: 4,
    life_steal: 5,
    growth: 5,
    snipe: 6,
    rainbow: 6,
    protection: 7,
    replenish: 7,
    sugar_rush: 7,
    giant_killer: 8,
    aiming: 8,
    blast_protection: 9,
    blessing: 9,
    critical: 9,
    fire_protection: 9,
    projectile_protection: 9,
    sharpness: 9,
    first_strike: 10,
    rejuvenate: 10,
    ender_slayer: 11,
    chance: 11,
    smite: 11,
    bane_of_arthropods: 11,
    impaling: 12,
    magnet: 13,
    execute: 14,
    lethality: 14,
    frail: 14,
    thunderlord: 14,
    true_protection: 15,
    syphon: 15,
    caster: 15,
    vampirism: 15,
    thorns: 15,
    dragon_hunter: 16,
    ultimate_bank: 16,
    piercing: 17,
    venomous: 17,
    spiked_hook: 18,
    ultimate_jerry: 18,
    triple_strike: 19,
    thunderbolt: 20,
    ultimate_wise: 20,
    big_brain: 21,
    counter_strike: 22,
    respite: 23,
    ultimate_combo: 24,
    prosecute: 25,
    vicious: 26,
    wisdom: 27,
    titan_killer: 28,
    no_pain_no_gain: 29,
    last_stand: 30,
    ultimate_chimera: 31,
    ultimate_rend: 32,
    ultimate_overload: 33,
    ultimate_legion: 34,
    ultimate_swarm: 35,
    ultimate_soul_eater: 36,
};

export const requiredEnchanting = (key) => ENCHANT_REQUIREMENT[String(key ?? '').toLowerCase()] ?? 0;

const parseLevelFromLine = (line) => {
    const patterns = [
        /level[^IVXLCDM]*([IVXLCDM]+)/i,
        /enchanting[^IVXLCDM]*([IVXLCDM]+)/i,
        /([IVXLCDM]+)\s*\/\s*[IVXLCDM]+/,
        /skill:\s*([IVXLCDM]+)/i,
    ];
    for (const pattern of patterns) {
        const match = line.match(pattern);
        if (!match) continue;
        const value = romanToInt(match[1]);
        if (value != null && value >= 1 && value <= 60) return value;
    }
    const bare = line.trim().match(/^([IVXLCDM]+)$/);
    if (bare) {
        const value = romanToInt(bare[1]);
        if (value != null && value >= 1 && value <= 60) return value;
    }
    return null;
};

// Reads the Enchanting level from an open /skills container. Returns { level, name, lore } (level null if unknown).
export const readEnchantingFromContainer = (container) => {
    if (!container || typeof container.getStackInSlot !== 'function') return null;
    const size = container.getSize?.() ?? 0;

    for (let slot = 0; slot < size; slot++) {
        const item = container.getStackInSlot(slot);
        if (!item) continue;

        const name = ChatLib.removeFormatting(String(item.getName?.() ?? ''));
        if (!name.toLowerCase().includes('enchanting')) continue;

        const lore = (item.getLore?.() ?? []).map((line) => ChatLib.removeFormatting(String(line)));
        const candidates = [name, ...lore];

        for (const line of candidates) {
            const level = parseLevelFromLine(line);
            if (level != null) return { level, name, lore };
        }

        return { level: null, name, lore };
    }
    return null;
};
