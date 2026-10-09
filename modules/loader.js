
/* FIRST: install the background-thread network-noise handler before any module can throw
   (Noam/anti-RAT data downloads fail on boot and print full connect stack traces). */
(() => {
    try {
        const JThread = Java.type('java.lang.Thread');
        const THandler = Java.type('java.lang.Thread$UncaughtExceptionHandler');
        JThread.setDefaultUncaughtExceptionHandler(
            Java.extend(THandler, {
                uncaughtException(thread, err) {
                    const name = String(err?.getClass?.()?.getName?.() ?? '');
                    const text = String(err ?? '');
                    if (name.includes('Connect') || /connect\s*timeout|connection\s*timed\s*out/i.test(text)) return;
                    err?.printStackTrace?.();
                },
            })
        );
        console.log('[QuietNetwork] handler active');
    } catch (error) {
        // best-effort: if the handler can't be installed, nothing changes
    }
})();

/* MINING */
import './mining/CommissionMacro';
import './mining/ExcavatorMacro';
import './mining/GlaciteCommissionMacro';
import './mining/JasperDrillExploit';
import './mining/LobbyHopper';
import './foraging/MudwormMacro';
import './foraging/LushLilacEtherwarpNuker';
import './mining/Nuker';
import './mining/PowderNuker';
import './mining/OreMacro';
import './mining/PinglessMining';
import './mining/GlowingMushroomMacro';
import './mining/TunnelsMiner';

/* FORAGING */
import './foraging/AutoHarp';
import './foraging/HideonLeafESP';
import './foraging/HuntingHelpers';
//import './foraging/TreeESP';

/* FARMING */
import './farming/CocoaBeansMacro';
import './farming/ADRotatingMelonMacro';
import './farming/SShapeCropMacro';
import './farming/WSRowMacros';
import './farming/FarmType';
import './farming/PestMacro';
import './farming/SunsetPests';

/* VISUALS */
import './visuals/BlockVisual';
import './visuals/ESP';
import './visuals/GIF';
import './visuals/HUD';
import './visuals/MobHider';
import './visuals/MusicOverlay';
import './visuals/PestESP';
import './visuals/ProfileHider';
import './visuals/RatESP';
import './visuals/StructureESP';
import './visuals/GlowingMushroomESP';
import './visuals/RendererBenchmark';

/* SKILLS */
import './skills/AutoExperiments';
import './skills/ChocolateFactory';
import './skills/FishingHelper';
import './skills/FishOnMCMacro';
import './skills/StridersurferMacro';
import './skills/JerryBoxMacro';
import './skills/MinionCollector';
import './skills/RouteWalker';
import './skills/WynnProfessionMacro';

/* RIFT */
import './rift/KloonHackingMacro';
import './rift/AgaricusCapTriggerbot';
import './rift/SunGeckoMacro';
import './rift/MirrorverseMacro';
import './rift/ScribeNuker';
//import './rift/LivingMetalNuker';

/* BAZAAR */
import './bazaar/BazaarNpcMacro';

/* OTHER */
import './other/AutoBeg';
import './other/AutoConversation';
import './other/AutoForge';
import './other/AuctionHelper';
import './other/BeachBaller';
import './other/CancelInteract';
import './other/ChatQOL';
import './other/DiscordRPC';
import './other/Failsafes';
import './other/Freecam';
import './other/Freelook';
import './other/InventoryWalk';
import './other/LeftClickEtherwarp';
import './other/RatProtection';
import './other/VoidgloomHelper';
import './other/AutoCombine';
import './other/AutoFusionRepeat';
import './other/RatMacro';
import './other/PeltMacro';
import './other/PeltQOL';
import './other/DojoMacro';
