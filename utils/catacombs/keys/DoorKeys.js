import { location } from '../DungeonLocation';

const keys = { wither: 0, blood: 0 };

const messageText = (event) => {
    const message = event?.message;
    return String(message?.getUnformattedText?.() ?? message?.unformattedText ?? '');
};

register('chat', (event) => {
    if (!location.inDungeon) return;
    const text = messageText(event);

    if (/^(?:\[[^\]]+\] )?\w+ has obtained Wither Key!$/.test(text)) keys.wither++;
    else if (/^(?:\[[^\]]+\] )?\w+ opened a WITHER door!$/.test(text)) keys.wither = Math.max(0, keys.wither - 1);
    else if (/^(?:\[[^\]]+\] )?\w+ has obtained Blood Key!$/.test(text)) keys.blood++;
    else if (text === 'The BLOOD DOOR has been opened!') keys.blood = Math.max(0, keys.blood - 1);
});

register('worldUnload', () => {
    keys.wither = 0;
    keys.blood = 0;
});

export const getWitherKeys = () => keys.wither;
export const getBloodKeys = () => keys.blood;
export const hasWitherKey = () => keys.wither > 0;
export const hasBloodKey = () => keys.blood > 0;
