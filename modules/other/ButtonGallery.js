import { ModuleBase } from '../../utils/ModuleBase';
import { Categories } from '../../gui/categories/CategorySystem';
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

        const category = 'Other';
        const item = 'Buttons';

        Categories.addComponent(category, item, new Button('Standard Button', 0, 0, undefined, () => ChatLib.chat('Button clicked!')), 'Standard button design.');
        
        Categories.attachSettingsComponent(new ToggleButton('Toggle Switch', 0, 0, undefined, undefined, () => {}, false), 'Buttons', 'Other', 'Standard toggle switch.');

        Categories.attachSettingsComponent(new Slider('Standard Slider', 0, 100, 0, 0, undefined, undefined, 50, () => {}), 'Buttons', 'Other', 'Standard slider design.');

        Categories.attachSettingsComponent(new MultiToggle('Dropdown / MultiToggle', 0, 0, ['Option 1', 'Option 2', 'Option 3'], true, () => {}, false), 'Buttons', 'Other', 'Standard dropdown/multitoggle.');
        
        Categories.attachSettingsComponent(new ColorPicker('Color Picker', 0, 0, 0xff0000, () => {}), 'Buttons', 'Other', 'Color picker component.');
        
        Categories.attachSettingsComponent(new TextInput('Text Input', 0, 0, undefined, undefined, 'Placeholder', () => {}), 'Buttons', 'Other', 'Standard text input.');
        
        Categories.attachSettingsComponent(new Popup('Popup Component', 0, 0, undefined, undefined, () => {}), 'Buttons', 'Other', 'Popup settings wrapper.');
    }
}

new ButtonGallery();
