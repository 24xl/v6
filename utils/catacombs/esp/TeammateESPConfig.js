// Persisted Teammate ESP settings.
import { getConfigFile, writeConfigFile } from '../../utils/Utils';

const DEFAULTS = {
    enabled: false,
    highlight: true,
    drawName: true,
};

const config = getConfigFile('TeammateESPConfig.json') || {};
for (const key of Object.keys(DEFAULTS)) {
    if (config[key] === undefined) config[key] = DEFAULTS[key];
}
writeConfigFile('TeammateESPConfig.json', config);

export const TeammateESPConfig = config;
export const isTeammateESPEnabled = () => TeammateESPConfig.enabled;