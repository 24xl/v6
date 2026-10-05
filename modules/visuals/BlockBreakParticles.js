import { ModuleBase } from '../../utils/ModuleBase';

// Block break debris renders as a TerrainParticle in current Minecraft. It was named
// BlockParticle before the rename, so both are matched to survive a version change.
// getType() on a Particle returns ParticleRenderType, not ParticleType, so it cannot be
// compared against ParticleTypes.BLOCK - the class is the only usable discriminator.
// FallingDustParticle, DustParticle and BlockMarker are separate classes and are left alone.
const BLOCK_DUST_PARTICLES = new Set(['TerrainParticle', 'BlockParticle']);

class BlockBreakParticles extends ModuleBase {
    constructor() {
        super({
            name: 'Block Break Particles',
            subcategory: 'Visuals',
            description: 'Hides block break debris particles.',
            tooltip: 'Stops the small particles thrown out when a block breaks from rendering.',
            showEnabledToggle: false,
        });

        this.hidden = false;

        v5Command('bbp', (action) => this.onCommand(action), ['greedyString']);

        this.on('spawnParticle', (particle, event) => {
            if (!this.hidden || particle == null) return;
            if (BLOCK_DUST_PARTICLES.has(this.getParticleName(particle))) cancel(event);
        });
    }

    getParticleName(particle) {
        // CTWrapper exposes mcValue, which is the raw Minecraft particle.
        return particle.mcValue?.getClass?.()?.getSimpleName?.() ?? '';
    }

    onCommand(action) {
        const value = String(action ?? '')
            .trim()
            .toLowerCase();
        if (value === 'on') return this.setHidden(true);
        if (value === 'off') return this.setHidden(false);
        chat(`&7Block break particles are currently &f${this.hidden ? 'hidden' : 'shown'}&7.`);
    }

    setHidden(hidden) {
        this.hidden = hidden;
        chat(`&aBlock break particles ${hidden ? 'hidden' : 'shown'}&7.`);
    }
}

new BlockBreakParticles();
