import { AudioFormat, AudioSystem, DataLine, FloatControl, JavaArray, Runtime, SourceDataLine, isLinux, isWindows } from './Constants';
import { executeAsync } from './ThreadExecutor';

const SAMPLE_RATE = 44100;
const CHIME_NOTES = [
    [880.0, 0.13],
    [1318.5, 0.17],
];
const BELL_FREQUENCY = 660;
const BELL_PARTIALS = [
    [1.0, 1.0, 2.2],
    [2.4, 0.5, 3.0],
    [3.8, 0.28, 3.8],
    [5.4, 0.16, 4.8],
];
const BELL_SECONDS = 0.95;
const tones = { chime: null, bell: null };
let cachedEngine = null;

const toByte = (value) => {
    const low = value & 0xff;
    return low >= 128 ? low - 256 : low;
};

function buildChime() {
    const totalFrames = CHIME_NOTES.reduce((sum, [, seconds]) => sum + Math.round(seconds * SAMPLE_RATE), 0);
    const bytes = JavaArray.newInstance(java.lang.Byte.TYPE, totalFrames * 2);
    let index = 0;
    for (const [frequency, seconds] of CHIME_NOTES) {
        const frames = Math.round(seconds * SAMPLE_RATE);
        for (let frame = 0; frame < frames; frame++) {
            const t = frame / SAMPLE_RATE;
            const attack = Math.min(1, frame / 150);
            const release = Math.min(1, (frames - frame) / 700);
            const sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * attack * release * 0.33 * 32767);
            bytes[index++] = toByte(sample);
            bytes[index++] = toByte(sample >> 8);
        }
    }
    return bytes;
}

function buildBell() {
    const frames = Math.round(BELL_SECONDS * SAMPLE_RATE);
    const bytes = JavaArray.newInstance(java.lang.Byte.TYPE, frames * 2);
    let index = 0;
    for (let frame = 0; frame < frames; frame++) {
        const t = frame / SAMPLE_RATE;
        let value = 0;
        for (const [ratio, gain, decay] of BELL_PARTIALS) {
            value += gain * Math.sin(2 * Math.PI * BELL_FREQUENCY * ratio * t) * Math.exp(-decay * t);
        }
        const attack = Math.min(1, frame / 60);
        const sample = Math.round(Math.max(-1, Math.min(1, value * attack * 0.4)) * 32767);
        bytes[index++] = toByte(sample);
        bytes[index++] = toByte(sample >> 8);
    }
    return bytes;
}

function play(kind) {
    executeAsync(() => {
        try {
            if (!tones[kind]) tones[kind] = kind === 'bell' ? buildBell() : buildChime();
            const bytes = tones[kind];
            const format = new AudioFormat(SAMPLE_RATE, 16, 1, true, false);
            const line = AudioSystem.getLine(new DataLine.Info(SourceDataLine, format));
            line.open(format);
            if (line.isControlSupported(FloatControl.Type.MASTER_GAIN)) line.getControl(FloatControl.Type.MASTER_GAIN).setValue(0);
            line.start();
            line.write(bytes, 0, bytes.length);
            line.drain();
            line.stop();
            line.close();
        } catch (error) {
            console.error('[V5 Alert] sound failed: ' + error);
        }
    });
}

function engineCommands(text) {
    if (isWindows) {
        const escaped = text.replace(/'/g, "''");
        return [['powershell', '-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${escaped}')`]];
    }
    if (isLinux) {
        return [
            ['spd-say', text],
            ['espeak-ng', text],
            ['espeak', text],
            ['flite', '-t', text],
        ];
    }
    return [['say', text]];
}

function speak(text) {
    const message = String(text ?? '').trim();
    if (!message) return;

    executeAsync(() => {
        const commands = engineCommands(message);
        const ordered = cachedEngine
            ? commands.filter((command) => command[0] === cachedEngine).concat(commands.filter((command) => command[0] !== cachedEngine))
            : commands;

        for (const command of ordered) {
            try {
                const argv = JavaArray.newInstance(java.lang.String, command.length);
                command.forEach((value, index) => (argv[index] = value));
                Runtime.getRuntime().exec(argv);
                cachedEngine = command[0];
                return;
            } catch (error) {
                // engine missing / failed to start -> try the next one
            }
        }
    });
}

export function alert(text, sound = 'chime') {
    play(sound === 'bell' ? 'bell' : 'chime');
    speak(text);
}
