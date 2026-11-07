let witherKeys = 0;
let bloodKeys = 0;

register('chat', () => {
    witherKeys++;
}).setCriteria(/^(?:\[[^\]]+\] )*\w+ has obtained Wither Key!$/);

register('chat', () => {
    if (witherKeys > 0) witherKeys--;
}).setCriteria(/^\w+ opened a WITHER door!$/);

register('chat', () => {
    bloodKeys++;
}).setCriteria(/^(?:\[[^\]]+\] )*\w+ has obtained Blood Key!$/);

register('chat', () => {
    if (bloodKeys > 0) bloodKeys--;
}).setCriteria(/^The BLOOD DOOR has been opened!$/);

register('worldUnload', () => {
    witherKeys = 0;
    bloodKeys = 0;
});

export function getWitherKeys() {
    return witherKeys;
}

export function getBloodKeys() {
    return bloodKeys;
}

export function hasWitherKey() {
    return witherKeys > 0;
}

export function hasBloodKey() {
    return bloodKeys > 0;
}