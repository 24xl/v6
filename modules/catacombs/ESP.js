import { ModuleBase } from '../../utils/ModuleBase';
import { Slider } from '../../gui/components/Slider';
import { ToggleButton } from '../../gui/components/Toggle';
import { MultiToggle } from '../../gui/components/Dropdown';
import { ColorPicker } from '../../gui/components/ColorPicker';
import { TextInput } from '../../gui/components/TextInput';
import { isInBoss } from '../../utils/catacombs/DungeonLocation';

import { TerminalESPConfig } from '../../utils/catacombs/esp/TerminalESPConfig';
import { StarMobESPConfig } from '../../utils/catacombs/esp/StarMobESPConfig';
import { TeammateESPConfig } from '../../utils/catacombs/esp/TeammateESPConfig';
import { RevealMobsConfig } from '../../utils/catacombs/esp/RevealMobsConfig';
import { SecretsConfig } from '../../utils/catacombs/esp/SecretsConfig';
import { DoorESPConfig } from '../../utils/catacombs/esp/DoorESPConfig';

// Import logic modules to register packet handlers and render hooks
import '../../utils/catacombs/esp/TerminalESP';
import '../../utils/catacombs/esp/StarMobESP';
import '../../utils/catacombs/esp/TeammateESP';
import '../../utils/catacombs/esp/RevealMobs';
import '../../utils/catacombs/esp/Secrets';
import '../../utils/catacombs/esp/DoorESP';

class ESP extends ModuleBase {
    constructor() {
        super({
            name: 'ESP',
            subcategory: 'Catacombs',
            description: 'Visual ESP features for dungeons and F7.',
            tooltip: 'Visual ESP features for dungeons and F7.',
            showEnabledToggle: false,
        });

        // Terminal ESP
        this.setupTerminalESPPopup();

        // StarMob ESP
        this.setupStarMobESPPopup();

        // Teammate ESP
        this.setupTeammateESPPopup();

        // Reveal Mobs (was Hidden Mobs)
        this.setupRevealMobsPopup();

        // Secrets
        this.setupSecretsPopup();

        // Door ESP
        this.setupDoorESPPopup();
    }

    // --- Terminal ESP ---
    setupTerminalESPPopup() {
        const c = TerminalESPConfig;
        const popup = this.addPopup('Terminal ESP', null, 'Highlights the interactable hitboxes of the terminals in F7/M7.');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        const addSlider = (title, min, max, step, key, description) => {
            const component = new Slider(title, min, max, 0, 0, undefined, undefined, c[key], (v) => (c[key] = Math.round(v)));
            component.step = step;
            popup.addComponent(component, description);
            return component;
        };

        const addChoice = (title, names, key, description) => {
            const component = new MultiToggle(title, 0, 0, names, true, (options) => {
                const picked = options.find((option) => option.enabled);
                c[key] = picked ? names.indexOf(picked.name) : c[key];
            }, names[c[key]]);
            popup.addComponent(component, description);
            return component;
        };

        const addColor = (title, key, description, defaultColor) => {
            const component = new ColorPicker(title, 0, 0, undefined, undefined, (c) => (c[key] = c), c[key] ?? defaultColor);
            popup.addComponent(component, description);
            return component;
        };

        addChoice('Mode', ['Outline', 'Fill', 'Filled Outline'], 'mode', 'Rendering mode for terminal hitboxes.');
        addToggle('Phase', 'phase', 'Render through walls.');
        addColor('Fill Color', 'fillColor', 'Fill color (when mode is Fill or Filled Outline).', 0x00FF00);
        addColor('Outline Color', 'outlineColor', 'Outline color (when mode is Outline or Filled Outline).', 0xFFFFFF);
        addSlider('Line Width', 1, 10, 0.1, 'lineWidth', 'Width of the outline in pixels.');
        addToggle('Flash On Click', 'flashOnHit', 'Flash the hitbox when you click it.');
        addColor('Flash Color', 'flashColor', 'Color to flash when hit.', 0xFF0000);
    }

    // --- StarMob ESP ---
    setupStarMobESPPopup() {
        const c = StarMobESPConfig;
        const popup = this.addPopup('StarMob ESP', null, 'Highlights all starred mobs in a dungeon.');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        const addColor = (title, key, description, defaultColor) => {
            const component = new ColorPicker(title, 0, 0, undefined, undefined, (c) => (c[key] = c), c[key] ?? defaultColor);
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Highlight Star Mobs', 'enabled', 'Highlights starred mobs in dungeons.');
        addColor('Star Mob Color', 'starColor', 'Default color for starred mobs.', 0xFFFF00);
        addColor('Fel Color', 'felColor', 'Color for Fels (Dinnerbone Endermen).', 0xFFC0CB);
        addToggle('Highlight Bats', 'highlightBats', 'Highlights Bats in dungeons (helps with bat room).');
        addColor('Bat Color', 'batColor', 'Color for highlighted bats.', 0x00FF00);
    }

    // --- Teammate ESP ---
    setupTeammateESPPopup() {
        const c = TeammateESPConfig;
        const popup = this.addPopup('Teammate ESP', null, 'Highlights your dungeon party members and shows their class/distance.');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Highlight Teammates', 'enabled', 'Glows teammates with their class color.');
        addToggle('Show Name/Distance', 'drawName', 'Draws teammate name, class initial, and distance above their head.');
    }

    // --- Reveal Mobs (was Hidden Mobs) ---
    setupRevealMobsPopup() {
        const c = RevealMobsConfig;
        const popup = this.addPopup('Reveal Mobs', null, 'Reveals invisible mobs in dungeons (Fels, Shadow Assassins, Stealthy mobs).');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Show Fels', 'showFels', 'Reveals Fels (Dinnerbone Endermen).');
        addToggle('Show Shadow Assassins', 'showShadowAssassins', 'Reveals Shadow Assassins by name.');
        addToggle('Show Stealthy Mobs', 'showStealthy', 'Reveals Stealthy mobs (Watcher mobs and Giants).');
    }

    // --- Secrets ---
    setupSecretsPopup() {
        const c = SecretsConfig;
        const popup = this.addPopup('Secrets', null, 'Secret finder: highlights clicked secrets, HUD counter, sound alerts, and triggerbot for auto-interaction.');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        const addSlider = (title, min, max, step, key, description) => {
            const component = new Slider(title, min, max, 0, 0, undefined, undefined, c[key], (v) => (c[key] = Math.round(v)));
            component.step = step;
            popup.addComponent(component, description);
            return component;
        };

        const addChoice = (title, names, key, description) => {
            const component = new MultiToggle(title, 0, 0, names, true, (options) => {
                const picked = options.find((option) => option.enabled);
                c[key] = picked ? names.indexOf(picked.name) : c[key];
            }, names[c[key]]);
            popup.addComponent(component, description);
            return component;
        };

        const addColor = (title, key, description, defaultColor) => {
            const component = new ColorPicker(title, 0, 0, undefined, undefined, (c) => (c[key] = c), c[key] ?? defaultColor);
            popup.addComponent(component, description);
            return component;
        };

        // Secret Clicked Highlight
        addToggle('Highlight Clicked Secret', 'clicked', 'Highlights the block of a secret when you interact with it.');
        addSlider('Highlight Time (s)', 0.5, 5.0, 0.1, 'displayTime', 'How long the highlight box remains visible.');
        addColor('Highlight Color', 'clickedColor', 'The color of the secret highlight box.', 0xFF0000);
        addChoice('Render Mode', ['Fill', 'Outline', 'Filled Outline'], 'mode', 'Choose how the box is rendered.');
        addToggle('See Through Walls', 'phase', 'If enabled, the highlight will be visible through other blocks.');

        // Secret Sound
        addToggle('Secret Sound', 'sound', 'Plays a sound effect when a secret is clicked/found.');

        // HUD
        addToggle('Secret HUD', 'hud', 'Displays the current room\'s secrets on screen.');
        addColor('HUD Prefix', 'hudPrefix', 'The text before the secret count of the room.');

        // Triggerbot
        const addTbOption = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Triggerbot', 'tb', 'Automatically interacts with secrets when looking at them.').section('Triggerbot');
        addToggle('Close Chest', 'closeChest', 'Automatically closes the secret chest for you.');
        addSlider('Interact Delay (ms)', 0, 700, 1, 'clickDelay', 'Delay between interactions.');
        
        addTbOption('Chest', 'tbChest', 'Auto-open regular chests.');
        addTbOption('Lever', 'tbLever', 'Auto-pull levers (with Wither Essence/Redstone Key).');
        addTbOption('Skull', 'tbSkull', 'Auto-click skulls (with Wither Essence/Redstone Key).');
        addTbOption('Mimic', 'tbMimic', 'Auto-open trapped chests (mimics).');
    }

    // --- Door ESP ---
    setupDoorESPPopup() {
        const c = DoorESPConfig;
        const popup = this.addPopup('Door ESP', null, 'Highlights every door in the dungeon run during clear, showing keys, room names, and secrets.');

        const addToggle = (title, key, description) => {
            const component = new ToggleButton(title, 0, 0, undefined, undefined, (v) => (c[key] = !!v), c[key]);
            popup.addComponent(component, description);
            return component;
        };

        const addSlider = (title, min, max, step, key, description) => {
            const component = new Slider(title, min, max, 0, 0, undefined, undefined, c[key], (v) => (c[key] = Math.round(v)));
            component.step = step;
            popup.addComponent(component, description);
            return component;
        };

        const addChoice = (title, names, key, description) => {
            const component = new MultiToggle(title, 0, 0, names, true, (options) => {
                const picked = options.find((option) => option.enabled);
                c[key] = picked ? names.indexOf(picked.name) : c[key];
            }, names[c[key]]);
            popup.addComponent(component, description);
            return component;
        };

        const addColor = (title, key, description, defaultColor) => {
            const component = new ColorPicker(title, 0, 0, undefined, undefined, (c) => (c[key] = c), c[key] ?? defaultColor);
            popup.addComponent(component, description);
            return component;
        };

        addToggle('Blood Rush Doors', 'bloodRush', 'Highlights blood rush and wither doors.');
        addToggle('Highlight All Blood Doors', 'highlightAll', 'Shows all blood doors instead of only next door after run starts.');
        addToggle('Normal Doors', 'normalDoors', 'Highlights normal doors in the current room.');

        addColor('Normal Door Color', 'normalColor', 'Color for normal doors.', 0xFFFFFF);
        addColor('No Key Color', 'noKeyColor', 'Color for blood doors without keys.', 0xFF0000);
        addColor('Has Key Color', 'hasKeyColor', 'Color for blood doors with keys.', 0x00FF00);

        addToggle('Room Name', 'roomName', 'Shows the name of the room the door leads to.');
        addToggle('Room Secrets', 'roomSecrets', 'Shows the secrets count of the room the door leads to.');

        addChoice('Mode', ['Outline', 'Fill', 'Filled Outline'], 'mode', 'Rendering mode for door boxes.');
        addSlider('Line Width', 1, 10, 0.1, 'lineWidth', 'Width of the outline in pixels.');
        addToggle('Phase', 'phase', 'Render through walls.');
    }
}

new ESP();