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
            showEnabledToggle: false,
        });

        this.termAcEnabled = false;
        this.termAcCps = 5;

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

            const heldItem = Player.getHeldItem();
            if (!heldItem) return;

            const mcItem = heldItem.toMC?.();
            if (!mcItem) return;

            let customData;
            try {
                customData = mcItem.get(DataComponents.CUSTOM_DATA);
            } catch (e) {
                return;
            }
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

            this.termAcNextClickAt = this.computeNextClick(Date.now());
            Client.leftClick();
        } catch (error) {
            console.error('[Terminator AC] tick error: ' + error);
        }
    }

    computeNextClick(now) {
        const cps = this.termAcCps;
        const jitter = Math.random() < 0.5 ? -1 : 1;
        const actualCps = cps + jitter;
        const delay = Math.floor(1000 / actualCps);
        return now + delay;
    }
}

new Cheats();