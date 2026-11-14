// Secrets: Secret finder with highlight, HUD, sound, and triggerbot.

import { SecretsConfig, isSecretsEnabled } from './SecretsConfig';
import { isInDungeon, isInBoss } from '../DungeonLocation';
import { DungeonEvents } from '../DungeonEvents';
import { SoundEvents, MenuType } from '../../Constants';
import { ServerboundContainerClosePacket, ServerboundInteractPacket, ClientboundOpenScreenPacket } from '../../Packets';

const clickedSecrets = new Map();
let lastSoundPlayed = 0;

function shouldRenderSecrets() {
    return isSecretsEnabled() && isInDungeon();
}

function playSecretSound() {
    if (!SecretsConfig.sound) return;
    const now = Date.now();
    if (now - lastSoundPlayed < 2000) return;
    lastSoundPlayed = now;
    Client.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 1, 1);
}

register('worldUnload', () => clickedSecrets.clear());

// Secret click detection via DungeonEvents
DungeonEvents.on('secret', (event) => {
    if (!shouldRenderSecrets()) return;
    
    if (SecretsConfig.sound) playSecretSound();
    
    if (SecretsConfig.clicked && !clickedSecrets.has(event.pos)) {
        clickedSecrets.set(event.pos, Date.now());
    }
});

register('postRenderWorld', (ctx) => {
    if (!shouldRenderSecrets()) return;
    if (!SecretsConfig.clicked || clickedSecrets.isEmpty()) return;

    const outline = SecretsConfig.mode === 1 || SecretsConfig.mode === 2;
    const fill = SecretsConfig.mode === 0 || SecretsConfig.mode === 2;
    const now = Date.now();

    for (const [pos, time] of clickedSecrets) {
        if (now - time > SecretsConfig.displayTime * 1000) {
            clickedSecrets.delete(pos);
            continue;
        }
        ctx.renderBlock(pos, SecretsConfig.clickedColor, outline, fill, SecretsConfig.phase);
    }
});

// HUD
register('hudElement', 'Secrets HUD', () => SecretsConfig.hud, () => isInDungeon() && !isInBoss(), (ctx, example) => {
    const prefix = SecretsConfig.hudPrefix ? `&7${SecretsConfig.hudPrefix} ` : '';
    let text;
    if (example) {
        text = `${prefix}&c3&7/&a7`;
    } else {
        const max = DungeonEvents.maxSecrets ?? 0;
        const current = DungeonEvents.secretsFound ?? 0;
        text = `${prefix}&c${current}&7/&a${max}`;
    }
    ctx.drawString(text, 0, 0);
    return [ctx.getStringWidth(text), 9];
});

// Triggerbot
let lastTbClick = new Map();

register('tick', () => {
    if (!SecretsConfig.tb || !isInDungeon() || isInBoss()) return;
    
    const looking = Player.lookingAt();
    if (!looking) return;
    
    const pos = looking.getPos();
    const lastClick = lastTbClick.get(pos.toString()) || 0;
    if (Date.now() - lastClick < SecretsConfig.clickDelay) return;

    const block = looking.getType?.();
    if (!block) return;

    let shouldClick = false;
    const blockName = block.getRegistryName?.()?.toString?.() ?? '';

    if (SecretsConfig.tbChest && (blockName === 'minecraft:chest' || blockName === 'minecraft:trapped_chest')) {
        if (blockName === 'minecraft:trapped_chest') {
            if (!SecretsConfig.tbMimic) return;
        } else if (!SecretsConfig.tbChest) return;
        shouldClick = true;
    } else if (SecretsConfig.tbLever && blockName === 'minecraft:lever') {
        // Check for Wither Essence/Redstone Key in NBT
        const nbt = looking.getNBT?.()?.toString?.() ?? '';
        const hasKey = nbt.includes('WITHER_ESSENCE') || nbt.includes('REDSTONE_KEY');
        if (hasKey) shouldClick = true;
    } else if (SecretsConfig.tbSkull && blockName.includes('skull') || blockName.includes('head')) {
        const nbt = looking.getNBT?.()?.toString?.() ?? '';
        const hasKey = nbt.includes('WITHER_ESSENCE') || nbt.includes('REDSTONE_KEY');
        if (hasKey) shouldClick = true;
    }

    if (shouldClick) {
        Client.rightClick();
        lastTbClick.set(pos.toString(), Date.now());
    }
});

// Close chest automatically
register('packetReceived', (packet) => {
    if (!SecretsConfig.closeChest || !isInDungeon() || isInBoss()) return;
    if (!(packet instanceof ClientboundOpenScreenPacket)) return;
    if (!packet.getType().equalsOneOf(MenuType.GENERIC_9x3, MenuType.GENERIC_9x6)) return;
    const title = packet.getTitle()?.getString?.() ?? '';
    if (!title.equalsOneOf('Chest', 'Large Chest')) return;
    
    Client.sendPacket(new ServerboundContainerClosePacket(packet.getContainerId()));
    packet.cancel?.();
}).setFilteredClass(ClientboundOpenScreenPacket);