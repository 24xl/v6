// Tick counter for puzzle timers. NoammAddons counts server ticks from ping packets while in a dungeon;
// this counts client ticks (also 20 per second) from the same moment, which is close enough for display timers.

let ticks = 0;

export const advanceClock = () => {
    ticks++;
};

export const resetClock = () => {
    ticks = 0;
};

export const getDungeonTicks = () => ticks;
