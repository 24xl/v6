// Persisted Door ESP settings.
import { getConfigFile, writeConfigFile } from '../../utils/Utils';

const DEFAULTS = {
    enabled: false,
    bloodRush: true,
    highlightAll: false,
    normalDoors: true,
    normalColor: 0xFFFFFF,
    noKeyColor: 0xFF0000,
    hasKeyColor: 0x00FF00,
    roomName: true,
    roomSecrets: true,
    mode: 0, // 0=Outline, 1=Fill, 2=Filled Outline
    lineWidth: 2.5,
    phase: true,
};

const config = getConfigFile('DoorESPConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('DoorESPConfig.json', config);

export const DoorESPConfig = config;
export const isDoorESPEnabled = () => DoorESPConfig.enabled;