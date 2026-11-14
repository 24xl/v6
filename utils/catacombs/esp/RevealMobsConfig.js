// Persisted Reveal Mobs settings.
import { getConfigFile, writeConfigFile } from '../Utils';

const DEFAULTS = {
    enabled: false,
    showFels: true,
    showShadowAssassins: true,
    showStealthy: true,
};

const config = getConfigFile('RevealMobsConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('RevealMobsConfig.json', config);

export const RevealMobsConfig = config;
export const isRevealMobsEnabled = () => RevealMobsConfig.enabled;