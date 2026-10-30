class Humanizer {
    constructor() {
        this.aimJitter = 0.15;
        this.smoothing = 0.85;
        this.pauseTicker = 0;
        this.lastPauseAt = 0;
    }

    configure(options = {}) {
        if (typeof options.smoothing === 'number') this.smoothing = Math.max(0, Math.min(1, options.smoothing));
        if (typeof options.aimJitter === 'number') this.aimJitter = Math.max(0, options.aimJitter);
    }

    applyAimJitter(yaw, pitch) {
        if (!this.aimJitter) return { yaw, pitch };
        const jitterYaw = (Math.random() - 0.5) * this.aimJitter * 2;
        const jitterPitch = (Math.random() - 0.5) * this.aimJitter * 2;
        return { yaw: yaw + jitterYaw, pitch: pitch + jitterPitch };
    }

    shouldMicroPause() {
        this.pauseTicker++;
        if (this.pauseTicker < 8 + Math.floor(Math.random() * 5)) return false;
        this.pauseTicker = 0;
        const now = Date.now();
        if (now - this.lastPauseAt < 1000) return false;
        this.lastPauseAt = now;
        return true;
    }

    getSprintFactor() {
        return 0.9 + Math.random() * 0.2;
    }
}

export const HumanizerInstance = new Humanizer();