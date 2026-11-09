// Live Auto Terminal settings. The Cheats popup writes here and the in-game AutoTerminal reads from here.
// Values reset to these defaults on every launch, the same as the other popups.

import { DEFAULT_SETTINGS } from './AutoTerminalCore';

export const autoTerminalSettings = {
    enabled: false,
    firstClickDelay: 7,
    breakTimeout: 500,
};

for (const key of Object.keys(DEFAULT_SETTINGS)) autoTerminalSettings[key] = DEFAULT_SETTINGS[key];

export const getFirstClickDelayTicks = () => autoTerminalSettings.firstClickDelay;
export const getBreakTimeoutMs = () => autoTerminalSettings.breakTimeout;
export const isAutoTerminalEnabled = () => autoTerminalSettings.enabled;
