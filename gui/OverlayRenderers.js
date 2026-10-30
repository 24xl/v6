import { getPing, getPingColor, getTPS, getTpsColor } from '../utils/player/ServerInfo';
import { BORDER_WIDTH, colorWithAlpha, CORNER_RADIUS, drawRoundedRectangleWithBorder, drawText, FontSizes, getTextWidth, THEME } from './Utils';

const STATS_LABELS = ['FPS:', 'Ping:', 'TPS:'];
const STATS_VALUES = ['999', '999ms', '20.00'];
const statsGeometry = new Map();
const statsLines = [
    { label: 'FPS', value: '', color: THEME.TEXT },
    { label: 'Ping', value: '', color: 0 },
    { label: 'TPS', value: '', color: 0 },
];
let lastStatsFps;
let lastStatsPing;
let lastStatsTps;
let musicBounds = null;
let lastCurrentTime;
let lastTotalTime;
let lastTimerFontSize;
let currentTimeWidth = 0;
let totalTimeWidth = 0;

const getStatsGeometry = (scale) => {
    if (statsGeometry.has(scale)) return statsGeometry.get(scale);
    const pad = 6 * scale;
    const fontSize = FontSizes.MEDIUM * 1.25 * scale;
    const gaps = [2 * scale, scale, 2 * scale];
    const separatorWidth = getTextWidth(' | ', fontSize);
    const labelWidths = STATS_LABELS.map((label) => getTextWidth(label, fontSize));
    const slotWidths = labelWidths.map((width, index) => width + gaps[index] + getTextWidth(STATS_VALUES[index], fontSize));
    const geometry = {
        pad,
        fontSize,
        gaps,
        separatorWidth,
        labelWidths,
        slotWidths,
        width: pad * 2 + slotWidths.reduce((total, width) => total + width, 0) + separatorWidth * (STATS_LABELS.length - 1),
        height: pad * 2 + fontSize,
    };
    statsGeometry.set(scale, geometry);
    return geometry;
};

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const clampOverlayToScreen = (overlay, sw, sh, border = 0) => ({
    x: clamp(overlay.x, border, Math.max(border, sw - overlay.width - border)),
    y: clamp(overlay.y, border, Math.max(border, sh - overlay.height - border)),
});

export const getStatsHudLines = () => {
    const fps = Client.getFPS();
    const ping = getPing();
    const tps = getTPS();
    if (fps !== lastStatsFps) {
        lastStatsFps = fps;
        statsLines[0].value = String(fps);
    }
    if (ping !== lastStatsPing) {
        lastStatsPing = ping;
        statsLines[1].value = `${ping}ms`;
        statsLines[1].color = (0xff000000 | getPingColor(ping)) >>> 0;
    }
    if (tps !== lastStatsTps) {
        lastStatsTps = tps;
        statsLines[2].value = tps.toFixed(2);
        statsLines[2].color = (0xff000000 | getTpsColor(tps)) >>> 0;
    }
    statsLines[0].color = THEME.TEXT;
    return statsLines;
};

export function getStatsHudBounds(scale) {
    const { width, height } = getStatsGeometry(scale);
    return { width, height };
}

const colorKey = (color) => (color?.getRGB ? color.getRGB() : color) | 0;

export const getStatsHudCacheKey = (overlay, lines) =>
    [overlay.x, overlay.y, overlay.width, overlay.height, overlay.scale]
        .concat([THEME.BG_COMPONENT, THEME.BORDER, THEME.TEXT, THEME.TEXT_MUTED].map(colorKey))
        .concat(lines.map(({ label, value, color }) => [label, value, colorKey(color)].join('|')))
        .join('|');

export function drawStatsHud(overlay, lines = getStatsHudLines()) {
    const scale = overlay.scale;
    const { pad, fontSize, gaps, separatorWidth, labelWidths, slotWidths } = getStatsGeometry(scale);
    const separator = ' | ';

    drawRoundedRectangleWithBorder({
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        radius: CORNER_RADIUS * 0.6 * scale,
        color: THEME.BG_COMPONENT,
        borderWidth: BORDER_WIDTH * scale,
        borderColor: THEME.BORDER,
    });

    let x = overlay.x + pad;
    const centerY = overlay.y + overlay.height / 2;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const label = `${line.label}:`;
        drawText(label, x, centerY, fontSize, THEME.TEXT_MUTED, 17);
        drawText(String(line.value), x + labelWidths[index] + gaps[index], centerY, fontSize, line.color, 17);
        x += slotWidths[index];
        if (index < lines.length - 1) {
            drawText(separator, x, centerY, fontSize, colorWithAlpha(THEME.TEXT_MUTED, 0.6), 17);
            x += separatorWidth;
        }
    }
}

export function getInventoryHudBounds(scale) {
    const pad = 6 * scale;
    const slot = 18 * scale;
    return { width: pad * 2 + 9 * slot, height: pad * 2 + 4 * slot + 4 * scale };
}

export const getInventoryHudCacheKey = (overlay) =>
    [overlay.x, overlay.y, overlay.width, overlay.height, overlay.scale].concat([THEME.BG_COMPONENT, THEME.BORDER, THEME.ACCENT].map(colorKey)).join('|');

export function drawInventoryHudBackground(overlay) {
    const scale = overlay.scale;
    const pad = 6 * scale;
    const slot = 18 * scale;
    const gap = 4 * scale;
    const rowWidth = 9 * slot;
    const separatorY = overlay.y + pad + 3 * slot + gap / 2 - Math.max(1, scale) / 2;
    const centerColor = colorWithAlpha(THEME.ACCENT, 0.3);
    const edgeColor = colorWithAlpha(THEME.ACCENT, 0);

    drawRoundedRectangleWithBorder({
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        radius: CORNER_RADIUS * 0.55 * scale,
        color: THEME.BG_COMPONENT,
        borderWidth: BORDER_WIDTH * scale,
        borderColor: THEME.BORDER,
    });
    Render2D.drawHorizontalThreeStopGradient(overlay.x + pad, separatorY, rowWidth, Math.max(1, scale), edgeColor, centerColor);
}

export function getMusicOverlayBounds(scale, songName) {
    if (musicBounds && musicBounds.scale === scale && musicBounds.songName === songName) return musicBounds.bounds;
    const padding = 12 * scale;
    const imageSize = 55 * scale;
    const bounds = {
        width: Math.max(200 * scale, getTextWidth(songName, FontSizes.MEDIUM * 1.3 * scale) + imageSize + padding * 4),
        height: 90 * scale,
    };
    musicBounds = { scale, songName, bounds };
    return bounds;
}

export function drawMusicOverlay({ overlay, songName, currentTime, totalTime, progress = 0, titleColor = THEME.TEXT_MUTED, drawArtwork = null }) {
    const scale = overlay.scale;
    const padding = 12 * scale;
    const imageSize = 55 * scale;
    const titleFontSize = FontSizes.MEDIUM * 1.3 * scale;
    const timerFontSize = FontSizes.MEDIUM * 0.85 * scale;
    const timerFontSizeChanged = timerFontSize !== lastTimerFontSize;
    const barHeight = 4 * scale;
    const imageX = overlay.x + overlay.width - imageSize - padding;
    const imageY = overlay.y + padding;
    if (timerFontSizeChanged || currentTime !== lastCurrentTime) {
        lastTimerFontSize = timerFontSize;
        lastCurrentTime = currentTime;
        currentTimeWidth = getTextWidth(currentTime, timerFontSize);
    }
    if (timerFontSizeChanged || totalTime !== lastTotalTime) {
        lastTotalTime = totalTime;
        totalTimeWidth = getTextWidth(totalTime, timerFontSize);
    }

    drawRoundedRectangleWithBorder({
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        radius: CORNER_RADIUS * 0.6 * scale,
        color: THEME.BG_COMPONENT,
        borderWidth: BORDER_WIDTH * scale,
        borderColor: THEME.BORDER,
    });
    if (drawArtwork) drawArtwork(imageX, imageY, imageSize, titleFontSize);
    else {
        drawRoundedRectangleWithBorder({
            x: imageX,
            y: imageY,
            width: imageSize,
            height: imageSize,
            radius: CORNER_RADIUS * 0.5 * scale,
            color: THEME.BG_INSET,
            borderWidth: 0,
            borderColor: 0,
        });
        const placeholder = songName === 'Searching for Media...' ? '...' : '?';
        drawText(placeholder, imageX + imageSize / 2, imageY + imageSize / 2 - titleFontSize / 2.5, titleFontSize, THEME.TEXT_MUTED, 18);
    }

    drawText(songName, overlay.x + padding, overlay.y + padding + titleFontSize, titleFontSize, titleColor, 16);
    const gap = 4 * scale;
    const barStartX = overlay.x + padding + currentTimeWidth + gap;
    const barWidth = overlay.x + overlay.width - padding - totalTimeWidth - gap - barStartX;
    const barY = overlay.y + overlay.height - padding - barHeight * 0.8;
    const timerY = barY + barHeight / 2;
    drawText(currentTime, overlay.x + padding, timerY, timerFontSize, THEME.TEXT_MUTED, 16);
    drawText(totalTime, overlay.x + overlay.width - padding, timerY, timerFontSize, THEME.TEXT_MUTED, 20);
    drawRoundedRectangleWithBorder({
        x: barStartX,
        y: barY,
        width: barWidth,
        height: barHeight,
        radius: barHeight / 2,
        color: THEME.BG_INSET,
        borderWidth: 0,
        borderColor: 0,
    });
    if (progress > 0)
        drawRoundedRectangleWithBorder({
            x: barStartX,
            y: barY,
            width: Math.max(0, barWidth * progress),
            height: barHeight,
            radius: barHeight / 2,
            color: THEME.ACCENT,
            borderWidth: 0,
            borderColor: 0,
        });
}
