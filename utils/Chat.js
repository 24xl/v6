import FailsafeUtils from '../failsafes/FailsafeUtils';
import { isDeveloperModeEnabled } from './DeveloperModeState';

const sendGradient = (prefix, ...args) => {
    if (!args.length) return;
    Client.getMinecraft().execute(() => GradientChat.sendGradientMsg(prefix, 0xFF4500, 0x8B0000, ...args));
};

export const chat = (message) => sendGradient('Plex >>', message);

export function chatDebug(message) {
    if (isDeveloperModeEnabled()) sendGradient('Plex >>', message);
}

export function chatFailsafe(message, includeIntensity = true) {
    sendGradient('Plex >>', message);
    if (includeIntensity) sendGradient('Plex >>', '&c&lCurrent intensity: ' + FailsafeUtils.getIntensity());
}

export const chatPathfinder = (message) => sendGradient('Plex >>', message);
