import { ModuleBase } from '../../utils/ModuleBase';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { DataComponents } from '../../utils/Constants';
import { isInBoss } from '../../utils/catacombs/DungeonLocation';

class Cheats extends ModuleBase {
    constructor() {
        super({
            name: 'Cheats',
            subcategory: 'Catacombs',
            description: 'Catacombs cheat features.',
            tooltip: 'Catacombs cheat features.',
        });

        this.termAcEnabled = false;
        this.termAcCps = 5;

        this.addButton('Cheats', () => {
            // placeholder for future features
        }, 'Catacombs cheat features (WIP)');

        const popup = this.addPopup('Terminator AC', null, 'Auto left-click while holding right-click with the Terminator.');

        const toggle = new ToggleButton(
            'Terminator AC',
            0,
            0,
            undefined,
            undefined,
            (v) => (this.termAcEnabled = !!v),
            false
        );
        popup.addComponent(toggle, 'Enable the auto-clicker.');

        const slider = new Slider(
            'Clicks Per Second',
            5,
            10,
            0,
            0,
            undefined,
            undefined,
            5,
            (v) => (this.termAcCps = Math.round(v))
        );
        popup.addComponent(slider, 'Target clicks per second (5-10).');

        this.termAcBaseCps = 5;
        this.termAcLastDriftAt = 0;
        this.termAcNextClickAt = 0;
        this.termAcSecretUuids = new Set([
            '2865274b-3097-394e-8149-ec629c72d850',
            'e0f3e929-869e-3dca-9504-54c666ee6f23',
            'fed95410-aba1-39df-9b95-1d4f361eb66e',
        ]);

        register('tick', () => this.onTerminatorAcTick());
    }

    onTerminatorAcTick() {
        if (!this.termAcEnabled) return;

        const now = Date.now();
        if (now < this.termAcNextClickAt) return;

        try {
            const mc = Client.getMinecraft();
            if (!mc) return;

            const keyUse = mc.options?.keyUse;
            if (!keyUse?.isDown?.()) return;

            if (Client.isInGui()) return;

            const player = Player.getPlayer();
            if (!player) return;

            if (player.isUsingItem()) return;

            const heldItem = player.getHeldItem();
            if (!heldItem) return;

            const mcItem = heldItem.toMC?.();
            if (!mcItem) return;

            const customData = mcItem.get?.(DataComponents.CUSTOM_DATA);
            if (!customData) return;

            const customDataTag = customData.copyTag?.();
            if (!customDataTag) return;

            const customDataStr = customDataTag.toString();
            if (!customDataStr.includes('"id":"TERMINATOR"') && !customDataStr.includes('id:"TERMINATOR"')) return;

            if (customDataStr.includes('"ultimate_rend"')) return;

            const looked = Player.lookingAt();
            if (looked instanceof Block) {
                const blockType = looked.getType?.();
                const registryName = blockType?.getRegistryName?.();
                if (registryName) {
                    const regStr = String(registryName);
                    const isSecret =
                        regStr === 'minecraft:chest' ||
                        regStr === 'minecraft:trapped_chest' ||
                        regStr === 'minecraft:lever' ||
                        regStr === 'minecraft:player_head' ||
                        regStr === 'minecraft:skeleton_skull' ||
                        regStr === 'minecraft:wither_skeleton_skull' ||
                        regStr === 'minecraft:zombie_head' ||
                        regStr === 'minecraft:creeper_head' ||
                        regStr === 'minecraft:dragon_head';

                    if (isSecret && !isInBoss()) {
                        const nbt = looked.getNBT?.()?.toString?.() ?? '';
                        for (const uuid of this.termAcSecretUuids) {
                            if (nbt.includes(uuid)) return;
                        }
                    }
                }
            }

            this.termAcNextClickAt = this.computeNextClick(now);
            Client.leftClick();
        } catch (error) {
            console.error('[Terminator AC] tick error: ' + error);
        }
    }

    computeNextClick(now) {
        if (now - this.termAcLastDriftAt > 1000) {
            this.termAcBaseCps = this.termAcCps + this.gaussianInt(-10, 10) / 10;
            this.termAcLastDriftAt = now;
        }

        const baseDelay = Math.floor(1000 / this.termAcBaseCps);

        const u1 = 1 - Math.random();
        const u2 = 1 - Math.random();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const offset = gauss < 0 ? Math.trunc(gauss * 10) : Math.trunc(gauss * 25);

        let finalDelay = baseDelay + offset;

        const roll = Math.random();
        if (roll < 0.01) {
            finalDelay += 100 + Math.floor(Math.random() * 150);
        } else if (roll < 0.03) {
            finalDelay = 5 + Math.floor(Math.random() * 10);
        }

        return now + finalDelay;
    }

    gaussianInt(min, max) {
        const u1 = 1 - Math.random();
        const u2 = 1 - Math.random();
        const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const mean = min + (max - min) / 2;
        const std = (max - min) / 6;
        const val = gauss * std + mean;
        return Math.trunc(Math.max(min, Math.min(max, val)));
    }
}

new Cheats();