import { ModuleBase } from '../../utils/ModuleBase';
import { v5Command } from '../../utils/V5Commands';
import { chat } from '../../utils/Chat';

// Block break debris renders as a TerrainParticle in current Minecraft. It was called
// BlockParticle before the rename, so both are matched to survive a version change.
// ctjs-mappings.tiny contains only TerrainParticle, so the second name is belt and braces.
//
// Particle.getType() returns ParticleRenderType rather than ParticleType, so it cannot be
// compared against ParticleTypes.BLOCK and is deliberately not used here.
// FallingDustParticle, DustParticle and BlockMarker are separate classes and are left alone.
const BLOCK_BREAK_PARTICLES = new Set(['TerrainParticle', 'BlockParticle']);

// The whole module is wrapped so that a fault here can never abort evaluation of the
// rest of loader.js. An import that throws takes every module after it down with it,
// which is how one bad identifier once cost 39 modules including Freecam and Freelook.
try {
    class BlockBreakParticles extends ModuleBase {
        constructor() {
            super({
                name: 'Block Break Particles',
                subcategory: 'Visuals',
                description: 'Hides block break debris particles.',
                tooltip: 'Stops the particles thrown out when a block breaks from rendering.',
                showEnabledToggle: false,
            });

            this.hidden = false;

            v5Command('bbp', (action) => this.onCommand(action), ['greedyString']);

            this.on('spawnParticle', (particle, event) => {
                try {
                    if (!this.hidden) return;
                    if (BLOCK_BREAK_PARTICLES.has(this.getParticleName(particle))) cancel(event);
                } catch (error) {
                    // Never let one particle break the trigger chain for the rest.
                }
            });
        }

        // Resolves the underlying Minecraft class name, the only reliable way to tell
        // debris apart. toMC() is already used from other modules; the wrapper's own
        // toString prints "Particle(type=TerrainParticle, ...)" as a fallback.
        getParticleName(particle) {
            if (!particle) return '';
            try {
                const raw = particle.toMC?.();
                const name = raw?.getClass?.()?.getSimpleName?.();
                if (typeof name === 'string' && name.length > 0) return name;
            } catch (error) {
                // Fall through to the string form below.
            }
            return String(particle).match(/type=([^,)]+)/)?.[1] ?? '';
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
} catch (error) {
    console.error('[BlockBreakParticles] failed to load:', error);
}
