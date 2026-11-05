import { TypingState } from '../../gui/Utils';
import { ModuleBase } from '../../utils/ModuleBase';
import { ClientboundOpenScreenPacket, ServerboundContainerClickPacket } from '../../utils/Packets';
import { ScheduleTask } from '../../utils/ScheduleTask';
import { ToggleButton } from '../../gui/components/Toggle';

class InventoryWalk extends ModuleBase {
    constructor() {
        super({
            name: 'Inventory Walk',
            subcategory: 'Other',
            description: 'Walk while inventory is open. Disable to block sneak/jump while inventory is open.',
            tooltip: 'When disabled (default), blocks sneak and jump while inventory is open.',
        });

        this.clicked = false;
        this.time = 0;
        this.lastPacketTime = Date.now();
        this.actionToken = 0;
        this.allowMovement = false; // Disabled by default

        this.keybinds = [
            new KeyBind(Client.getMinecraft().options.keyUp),
            new KeyBind(Client.getMinecraft().options.keyLeft),
            new KeyBind(Client.getMinecraft().options.keyRight),
            new KeyBind(Client.getMinecraft().options.keyDown),
            new KeyBind(Client.getMinecraft().options.keyJump),
            new KeyBind(Client.getMinecraft().options.keySprint),
            new KeyBind(Client.getMinecraft().options.keyShift),
        ];

        // Single toggle button - disabled by default
        this.addToggle(
            'Allow Movement in Inventory',
            (value) => { this.allowMovement = value; },
            'When disabled (default), blocks sneak and jump while inventory is open. Enable to allow movement in inventory.',
            this.allowMovement
        );

        this.keybinds = [
            new KeyBind(Client.getMinecraft().options.keyUp),
            new KeyBind(Client.getMinecraft().options.keyLeft),
            new KeyBind(Client.getMinecraft().options.keyRight),
            new KeyBind(Client.getMinecraft().options.keyDown),
            new KeyBind(Client.getMinecraft().options.keyJump),
            new KeyBind(Client.getMinecraft().options.keySprint),
            new KeyBind(Client.getMinecraft().options.keyShift),
        ];

        this.on('tick', () => {
            if (!Client.isInGui()) {
                this.clicked = false;
                return;
            }
            if (Client.isInChat() || (Client.isInGui() && TypingState.isTyping)) return;
            
            const sincePing = Date.now() - this.lastPacketTime;
            if ((!this.clicked && sincePing < 100) || Date.now() > this.time + 350 + sincePing) {
                const token = this.actionToken;
                ScheduleTask(0, () => {
                    if (!this.enabled || token !== this.actionToken) return;
                    this.keybinds.forEach((keybind, index) => {
                        const down = keybind.isPhysicalKeyDown();
                        if (down) {
                            // Block sneak (index 6) and jump (index 4) when disabled
                            if (!this.allowMovement) {
                                if (index === 6 || index === 4) return; // Block sneak and jump
                            }
                            keybind.setState(down);
                        }
                    });
                });
            } else {
                this.keybinds.forEach((keybind) => {
                    keybind.setState(false);
                });
            }
        });

        this.on('packetSent', () => {
            this.clicked = true;
            this.time = Date.now();
            this.keybinds.forEach((keybind) => {
                keybind.setState(false);
            });
        }).setFilteredClass(ServerboundContainerClickPacket);

        this.on('packetReceived', () => {
            this.clicked = false;
            const token = this.actionToken;
            ScheduleTask(0, () => {
                if (!this.enabled || token !== this.actionToken) return;
                this.keybinds.forEach((keybind, index) => {
                    const down = keybind.isPhysicalKeyDown() && !Client.isInChat();
                    if (down) {
                        // Block sneak and jump when disabled
                        if (!this.allowMovement) {
                            if (index === 6 || index === 4) return;
                        }
                        keybind.setState(down);
                    }
                });
            });
        }).setFilteredClass(ClientboundOpenScreenPacket);

        this.on('packetReceived', () => {
            this.lastPacketTime = Date.now();
        });
    }

    onDisable() {
        this.actionToken++;
        this.clicked = false;
        this.time = 0;
        this.keybinds.forEach((keybind) => keybind.setState(false));
    }
}

new InventoryWalk();
