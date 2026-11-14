// Persisted Terminal ESP settings. Read by TerminalESP logic, written by ESP UI popup.
import { getConfigFile, writeConfigFile } from '../Utils';

const DEFAULTS = {
    enabled: false,
    mode: 1,           // 0=Outline, 1=Fill, 2=Filled Outline
    phase: false,
    fillColor: 0x00FF00,
    outlineColor: 0xFFFFFF,
    lineWidth: 2.5,
    flashOnHit: true,
    flashColor: 0xFF0000,
};

const config = getConfigFile('TerminalESPConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('TerminalESPConfig.json', config);

export const TerminalESPConfig = config;
export const getTerminalESPConfig = () => TerminalESPConfig;
export const isTerminalESPEnabled = () => TerminalESPConfig.enabled;