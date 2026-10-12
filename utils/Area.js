import { getTabListNames, stripTabFormatting } from './TabListUtils';

const UNKNOWN = 'unknown';

let rawArea = UNKNOWN;
let normalizedArea = UNKNOWN;

export const normalizeArea = (value) =>
    ChatLib.removeFormatting(String(value ?? ''))
        .replace(/⏣/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

register('tick', () => {
    let found = UNKNOWN;
    for (const line of getTabListNames()) {
        const text = stripTabFormatting(line?.getName?.() ?? line);
        const index = text.indexOf('Area:');
        if (index !== -1) {
            found = text.slice(index + 5).trim();
            break;
        }
    }
    rawArea = found;
    normalizedArea = normalizeArea(found);
});

export const getArea = () => rawArea;
export const getAreaName = () => normalizedArea;
export const areaIs = (name) => normalizedArea === normalizeArea(name);
export const areaIncludes = (text) => normalizedArea.includes(normalizeArea(text));
export const inGarden = () => areaIncludes('the garden') || areaIncludes('garden');
export const inRift = () => areaIncludes('rift');
export const inCrystalHollows = () => areaIncludes('crystal hollows');
