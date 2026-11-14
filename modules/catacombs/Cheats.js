import { ModuleBase } from '../../utils/ModuleBase';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { DataComponents } from '../../utils/Constants';
import { isInBoss } from '../../utils/catacombs/DungeonLocation';
import { MultiToggle } from '../../gui/components/Dropdown';
import { ColorPicker } from '../../gui/components/ColorPicker';
import { autoTerminalSettings } from '../../utils/catacombs/terminals/AutoTerminalSettings';
import { initTerminalAdapter } from '../../utils/catacombs/terminals/TerminalAdapter';

// ESP Configs
import { TerminalESPConfig } from '../../utils/catacombs/esp/TerminalESPConfig';
import { StarMobESPConfig } from '../../utils/catacombs/esp/StarMobESPConfig';
import { TeammateESPConfig } from '../../utils/catacombs/esp/TeammateESPConfig';
import { RevealMobsConfig } from '../../utils/catacombs/esp/RevealMobsConfig';
import { SecretsConfig } from '../../utils/catacombs/esp/SecretsConfig';
import { DoorESPConfig } from '../../utils/catacombs/esp/DoorESPConfig';

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

        this.setupAutoTerminalPopup();
        this.setupESPPopup();
    }

    setupAutoTerminalPopup() {
        const s = autoTerminalSettings;
        const popup = this.addPopup('Auto Terminal', null, 'Automatically clicks F7 terminals for you.');

        let autoDelay;
        let minDelay;
        let maxDelay;
        let melodyFirstClick;
        let melodySkip;
        let skipMode;
        let skipFirstRow;

        const refreshVisibility = () => {
            autoDelay.visible = !s.randomDelay;
            minDelay.visible = s.randomDelay;
            maxDelay.visible = s.randomDelay;
            melodyFirstClick.visible = s.melody;
            melodySkip.visible = s.melody;
            skipMode.visible = s.melody && s.melodySkip;
            skipFirstRow.visible = s.melody && s.melodySkip;
        };

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(
                title,
                0,
                0,
                undefined,
                undefined,
                (v) => {
                    s[key] = !!v;
                    refreshVisibility();
                },
                s[key]
            );
            popup.addComponent(component, description);
            return component;
        };

        const addSlider = (title, min, max, step, key, description) => {
            const component = new Slider(title, min, max, 0, 0, undefined, undefined, s[key], (v) => (s[key] = Math.round(v)));
            component.step = step;
            popup.addComponent(component, description);
            return component;
        };

        const addChoice = (title, names, key, description) => {
            const component = new MultiToggle(
                title,
                0,
                0,
                names,
                true,
                (options) => {
                    const picked = options.find((option) => option.enabled);
                    s[key] = picked ? names.indexOf(picked.name) : s[key];
                },
                names[s[key]]
            );
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Auto Terminal', 'enabled', 'Enable the auto-terminal.');

        addToggle('Random Delay', 'randomDelay', 'Normal distributed by min and max.');
        autoDelay = addSlider('Click Delay', 80, 500, 10, 'autoDelay', 'Fixed delay between clicks in milliseconds.');
        minDelay = addSlider('Min Random Delay', 50, 500, 10, 'minRandomDelay', 'The minimum possible delay.');
        maxDelay = addSlider('Max Random Delay', 80, 500, 10, 'maxRandomDelay', 'The maximum possible delay.');
        addToggle('Off Tick Clicks', 'offtick', 'Makes the auto check every frame if it can click or not instead of every server tick.');
        addChoice('Click Order', ['None', 'Random', 'Human', 'Skizo'], 'clickOrder', 'Human: Logic pathing. Skizo: Chaotic/Furthest.');

        addToggle('Melody', 'melody', 'Automatically solve the melody terminal.');
        melodyFirstClick = addToggle('Melody: First Click Delay', 'melodyFcDelay', 'Wait out the first click delay before the first melody click.');
        melodySkip = addToggle('Melody: Skip', 'melodySkip', 'Click the next rows early.');
        skipMode = addChoice('Melody: Skip Mode', ['Edges', 'All'], 'melodySkipMode', 'Edges: only skip from the outer columns. All: skip from any column.');
        skipFirstRow = addToggle('Melody: Skip First Row', 'melodySkipFirstRow', 'Also skip from the first row.');

        addToggle('Numbers', 'numbers', 'Auto-solve the Numbers terminal.');
        addToggle('Colors', 'colors', 'Auto-solve the Colors terminal.');
        addToggle('Rubix', 'rubix', 'Auto-solve the Rubix terminal.');
        addToggle('Red-Green', 'redGreen', 'Auto-solve the Red-Green terminal.');
        addToggle('Start-With', 'startWith', 'Auto-solve the Starts With terminal.');

        addSlider('First Click Delay (ticks)', 0, 8, 1, 'firstClickDelay', 'The delay in server ticks for how long a terminal will block clicks when you open it.');
        addSlider('Break Timeout', 300, 800, 50, 'breakTimeout', 'How long should the solver wait for a click to be confirmed by hypixel.');

        refreshVisibility();
        initTerminalAdapter();
    }

    setupESPPopup() {
        const s = {
            term: TerminalESPConfig,
            star: StarMobESPConfig,
            team: TeammateESPConfig,
            reveal: RevealMobsConfig,
            secrets: SecretsConfig,
            door: DoorESPConfig,
        };

        const popup = this.addPopup('ESP', null, 'Visual ESP features for dungeons and F7.');

        // Helper functions
        const addToggle = (title, config, key, description, section) => {
            const component = new ToggleButton(
                title,
                0,
                0,
                undefined,
                undefined,
                (v) => (config[key] = !!v),
                config[key]
            );
            if (section) component.section = section;
            popup.addComponent(component, description);
            return component;
        };

        const addSlider = (title, min, max, step, config, key, description, section) => {
            const component = new Slider(title, min, max, 0, 0, undefined, undefined, config[key], (v) => (config[key] = Math.round(v)));
            component.step = step;
            if (section) component.section = section;
            popup.addComponent(component, description);
            return component;
        };

        const addChoice = (title, names, config, key, description, section) => {
            const component = new MultiToggle(
                title,
                0,
                0,
                names,
                true,
                (options) => {
                    const picked = options.find((option) => option.enabled);
                    config[key] = picked ? names.indexOf(picked.name) : config[key];
                },
                names[config[key]]
            );
            if (section) component.section = section;
            popup.addComponent(component, description);
            return component;
        };

        const addColor = (title, config, key, description, defaultColor, section) => {
            const component = new ColorPicker(title, 0, 0, config[key] ?? defaultColor, (c) => (config[key] = c));
            if (section) component.section = section;
            popup.addComponent(component, description);
            return component;
        };

        // --- Terminal ESP ---
        popup.addComponent({ type: 'separator', title: 'Terminal ESP' }, null);
        addChoice('Mode', ['Outline', 'Fill', 'Filled Outline'], s.term, 'mode', 'Rendering mode for terminal hitboxes.', 'Terminal ESP');
        addToggle('Phase', s.term, 'phase', 'Render through walls.', 'Terminal ESP');
        addColor('Fill Color', s.term, 'fillColor', 'Fill color (when mode is Fill or Filled Outline).', 0x00FF00, 'Terminal ESP');
        addColor('Outline Color', s.term, 'outlineColor', 'Outline color (when mode is Outline or Filled Outline).', 0xFFFFFF, 'Terminal ESP');
        addSlider('Line Width', 1, 10, 0.1, s.term, 'lineWidth', 'Width of the outline in pixels.', 'Terminal ESP');
        addToggle('Flash On Click', s.term, 'flashOnHit', 'Flash the hitbox when you click it.', 'Terminal ESP');
        addColor('Flash Color', s.term, 'flashColor', 'Color to flash when hit.', 0xFF0000, 'Terminal ESP');

        // --- StarMob ESP ---
        popup.addComponent({ type: 'separator', title: 'StarMob ESP' }, null);
        addToggle('Highlight Star Mobs', s.star, 'enabled', 'Highlights starred mobs in dungeons.', 'StarMob ESP');
        addColor('Star Mob Color', s.star, 'starColor', 'Default color for starred mobs.', 0xFFFF00, 'StarMob ESP');
        addColor('Fel Color', s.star, 'felColor', 'Color for Fels (Dinnerbone Endermen).', 0xFFC0CB, 'StarMob ESP');
        addToggle('Highlight Bats', s.star, 'highlightBats', 'Highlights Bats in dungeons (helps with bat room).', 'StarMob ESP');
        addColor('Bat Color', s.star, 'batColor', 'Color for highlighted bats.', 0x00FF00, 'StarMob ESP');

        // --- Teammate ESP ---
        popup.addComponent({ type: 'separator', title: 'Teammate ESP' }, null);
        addToggle('Highlight Teammates', s.team, 'enabled', 'Glows teammates with their class color.', 'Teammate ESP');
        addToggle('Show Name/Distance', s.team, 'drawName', 'Draws teammate name, class initial, and distance above their head.', 'Teammate ESP');

        // --- Reveal Mobs (was Hidden Mobs) ---
        popup.addComponent({ type: 'separator', title: 'Reveal Mobs' }, null);
        addToggle('Show Fels', s.reveal, 'showFels', 'Reveals Fels (Dinnerbone Endermen).', 'Reveal Mobs');
        addToggle('Show Shadow Assassins', s.reveal, 'showShadowAssassins', 'Reveals Shadow Assassins by name.', 'Reveal Mobs');
        addToggle('Show Stealthy Mobs', s.reveal, 'showStealthy', 'Reveals Stealthy mobs (Watcher mobs and Giants).', 'Reveal Mobs');

        // --- Secrets ---
        popup.addComponent({ type: 'separator', title: 'Secrets' }, null);
        // Secret Clicked Highlight
        addToggle('Highlight Clicked Secret', s.secrets, 'clicked', 'Highlights the block of a secret when you interact with it.', 'Secrets');
        addSlider('Highlight Time (s)', 0.5, 5.0, 0.1, s.secrets, 'displayTime', 'How long the highlight box remains visible.', 'Secrets');
        addColor('Highlight Color', s.secrets, 'clickedColor', 'The color of the secret highlight box.', 0xFF0000, 'Secrets');
        addChoice('Render Mode', ['Fill', 'Outline', 'Filled Outline'], s.secrets, 'mode', 'Choose how the box is rendered.', 'Secrets');
        addToggle('See Through Walls', s.secrets, 'phase', 'If enabled, the highlight will be visible through other blocks.', 'Secrets');

        // Secret Sound
        addToggle('Secret Sound', s.secrets, 'sound', 'Plays a sound effect when a secret is clicked/found.', 'Secrets');

        // HUD
        addToggle('Secret HUD', s.secrets, 'hud', 'Displays the current room\'s secrets on screen.', 'Secrets');
        // Note: TextInput for prefix not supported in this simplified version

        // Triggerbot
        const addTbOption = (title, config, key, description) => {
            const component = new ToggleButton(
                title,
                0,
                0,
                undefined,
                undefined,
                (v) => (config[key] = !!v),
                config[key]
            );
            component.section = 'Secrets';
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Triggerbot', s.secrets, 'tb', 'Automatically interacts with secrets when looking at them.', 'Secrets');
        addToggle('Close Chest', s.secrets, 'closeChest', 'Automatically closes the secret chest for you.', 'Secrets');
        addSlider('Interact Delay (ms)', 0, 700, 1, s.secrets, 'clickDelay', 'Delay between interactions.', 'Secrets');

        addTbOption('Chest', s.secrets, 'tbChest', 'Auto-open regular chests.');
        addTbOption('Lever', s.secrets, 'tbLever', 'Auto-pull levers (with Wither Essence/Redstone Key).');
        addTbOption('Skull', s.secrets, 'tbSkull', 'Auto-click skulls (with Wither Essence/Redstone Key).');
        addTbOption('Mimic', s.secrets, 'tbMimic', 'Auto-open trapped chests (mimics).');

        // --- Door ESP ---
        popup.addComponent({ type: 'separator', title: 'Door ESP' }, null);
        addToggle('Blood Rush Doors', s.door, 'bloodRush', 'Highlights blood rush and wither doors.', 'Door ESP');
        addToggle('Highlight All Blood Doors', s.door, 'highlightAll', 'Shows all blood doors instead of only next door after run starts.', 'Door ESP');
        addToggle('Normal Doors', s.door, 'normalDoors', 'Highlights normal doors in the current room.', 'Door ESP');

        addColor('Normal Door Color', s.door, 'normalColor', 'Color for normal doors.', 0xFFFFFF, 'Door ESP');
        addColor('No Key Color', s.door, 'noKeyColor', 'Color for blood doors without keys.', 0xFF0000, 'Door ESP');
        addColor('Has Key Color', s.door, 'hasKeyColor', 'Color for blood doors with keys.', 0x00FF00, 'Door ESP');

        addToggle('Room Name', s.door, 'roomName', 'Shows the name of the room the door leads to.', 'Door ESP');
        addToggle('Room Secrets', s.door, 'roomSecrets', 'Shows the secrets count of the room the door leads to.', 'Door ESP');

        addChoice('Mode', ['Outline', 'Fill', 'Filled Outline'], s.door, 'mode', 'Rendering mode for door boxes.', 'Door ESP');
        addSlider('Line Width', 1, 10, 0.1, s.door, 'lineWidth', 'Width of the outline in pixels.', 'Door ESP');
        addToggle('Phase', s.door, 'phase', 'Render through walls.', 'Door ESP');
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