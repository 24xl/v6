// Persisted Secrets settings.
import { getConfigFile, writeConfigFile } from '../Utils';

const DEFAULTS = {
    enabled: false,
    // Secret Clicked Highlight
    clicked: true,
    displayTime: 2.0,
    clickedColor: 0xFF0000,
    mode: 2, // 0=Fill, 1=Outline, 2=Filled Outline
    phase: true,
    // Secret Sound
    sound: true,
    // HUD
    hud: true,
    hudPrefix: 'Secrets:',
    // Triggerbot
    tb: false,
    closeChest: false,
    clickDelay: 200,
    tbChest: false,
    tbLever: false,
    tbSkull: false,
    tbMimic: false,
};

const config = getConfigFile('SecretsConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('SecretsConfig.json', config);

export const SecretsConfig = config;
export const isSecretsEnabled = () => SecretsConfig.enabled;