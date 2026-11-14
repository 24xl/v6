// Persisted StarMob ESP settings.
import { getConfigFile, writeConfigFile } from '../../../Utils';

const DEFAULTS = {
    enabled: false,
    starColor: 0xFFFF00,
    felColor: 0xFFC0CB,
    highlightBats: true,
    batColor: 0x00FF00,
};

const config = getConfigFile('StarMobESPConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('StarMobESPConfig.json', config);

export const StarMobESPConfig = config;
export const isStarMobESPEnabled = () => StarMobESPConfig.enabled;