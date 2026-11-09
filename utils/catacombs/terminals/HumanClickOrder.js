// Click-order chooser for AutoTerminal ("Human" = nearest to the last click, "Skizo" = farthest).
// Ported from NoammAddons' HumanClickOrder.kt.

const NEIGHBOR_RADIUS_SQR = 20 * 20;

let lastClickedSlot = null;

export const resetHumanClickOrder = () => {
    lastClickedSlot = null;
};

const distanceSqr = (a, b) => {
    const dx = ((a % 9) - (b % 9)) * 18;
    const dy = (Math.floor(a / 9) - Math.floor(b / 9)) * 18;
    return dx * dx + dy * dy;
};

const countNeighbors = (targetId, allClicks) => {
    let count = 0;
    for (const other of allClicks) {
        if (other.slotId !== targetId && distanceSqr(targetId, other.slotId) <= NEIGHBOR_RADIUS_SQR) count++;
    }
    return count;
};

const shuffled = (list, rng) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const swap = copy[i];
        copy[i] = copy[j];
        copy[j] = swap;
    }
    return copy;
};

function selectClick(handler, worst, rng) {
    if (handler.solution.length === 0) throw new Error('Solution list is empty');

    if (lastClickedSlot === null) lastClickedSlot = Math.floor(handler.slotCount / 2);
    const lastSlot = lastClickedSlot;

    const compare = (a, b) => {
        const distance = distanceSqr(a.slotId, lastSlot) - distanceSqr(b.slotId, lastSlot);
        if (distance !== 0) return distance;
        return countNeighbors(a.slotId, handler.solution) - countNeighbors(b.slotId, handler.solution);
    };

    const order = shuffled(handler.solution, rng);
    let selected;
    if (worst) {
        // Kotlin: shuffled.asReversed().maxWith(comparator) keeps the first maximum it meets.
        const reversed = order.slice().reverse();
        selected = reversed[0];
        for (let i = 1; i < reversed.length; i++) if (compare(selected, reversed[i]) < 0) selected = reversed[i];
    } else {
        selected = order[0];
        for (let i = 1; i < order.length; i++) if (compare(order[i], selected) < 0) selected = order[i];
    }

    lastClickedSlot = selected.slotId;
    return selected;
}

export const getBestClick = (handler, rng = Math.random) => selectClick(handler, false, rng);
export const getWorstClick = (handler, rng = Math.random) => selectClick(handler, true, rng);
