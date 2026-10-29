import { ModuleBase } from '../../utils/ModuleBase';
import { Button } from '../../gui/components/Button';
import { ToggleButton } from '../../gui/components/Toggle';
import { Slider } from '../../gui/components/Slider';
import { MultiToggle } from '../../gui/components/Dropdown';
import { ColorPicker } from '../../gui/components/ColorPicker';
import { TextInput } from '../../gui/components/TextInput';
import { Popup } from '../../gui/components/Popup';
import { Separator } from '../../gui/components/Separator';

class ButtonGallery extends ModuleBase {
    constructor() {
        super({
            name: 'Buttons',
            subcategory: 'Other',
            description: 'Preview all V5 GUI components.',
            showEnabledToggle: false,
        });

        const popup = this.addPopup('Component Preview', null, 'Live previews of all GUI components.');

        popup.addComponent(new Button('Standard Button', 0, 0, undefined, () => ChatLib.chat('Button clicked!')), 'Standard button design.');
        
        popup.addComponent(new ToggleButton('Toggle Switch', 0, 0, undefined, undefined, () => {}, false), 'Standard toggle switch.');

        popup.addComponent(new Slider('Standard Slider', 0, 100, 0, 0, undefined, undefined, 50, () => {}), 'Standard slider design.');

        popup.addComponent(new MultiToggle('Dropdown / MultiToggle', 0, 0, ['Option 1', 'Option 2', 'Option 3'], true, () => {}, false), 'Standard dropdown/multitoggle.');
        
        popup.addComponent(new ColorPicker('Color Picker', 0, 0, 0xff0000, () => {}), 'Color picker component.');
        
        popup.addComponent(new TextInput('Text Input', 0, 0, undefined, undefined, 'Placeholder', () => {}), 'Standard text input.');
        
        popup.addComponent(new Popup('Popup Component', 0, 0, undefined, undefined, () => {}), 'Popup settings wrapper.');

        const dualInputOptions = [{
            name: 'Dual-Input Toggle (Yaw/Pitch)',
            enabled: false,
            val1: '',
            val2: '',
            placeholder1: 'Yaw',
            placeholder2: 'Pitch',
        }];
        popup.addComponent(new MultiToggle('Dual-Input Toggle', 0, 0, dualInputOptions, false, () => {}, false), 'New: two text boxes next to toggle switch.');
    }
}

new ButtonGallery();