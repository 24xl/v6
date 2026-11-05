import { ModuleBase } from "../../utils/ModuleBase";
import { chat } from "../../utils/Chat";
import { OverlayManager } from "../../gui/OverlayUtils";
import DungeonState from "../../utils/dungeon/DungeonState";
import {
  isInDungeon,
  getDungeonFloor,
  updateDungeonStateFromScoreboard,
} from "../../utils/dungeon";
import { scanHotbarMap } from "../../utils/dungeon";
import { updatePlayers } from "../../utils/dungeon";
import { checkForMimic } from "../../utils/dungeon";
import { DungeonConfig } from "../../utils/dungeon/DungeonConfig";

class DungeonMap extends ModuleBase {
  constructor() {
    super({
      name: "Dungeon Map",
      subcategory: "Catacombs",
      description:
        "Legit dungeon minimap with room/secret tracking, player positions, mimic detection",
      showEnabledToggle: false,
      autoDisableOnWorldUnload: true,
    });

    this.active = false;
    this.scanCounter = 0;

    this.addToggle(
      "Enabled",
      (value) => {
        this.active = value;
        DungeonConfig.enabled = value;
      },
      "Master toggle for the dungeon map",
      true,
    );

    this.addToggle(
      "Show Room Names",
      (value) => {
        DungeonConfig.showRoomNames = value;
      },
      "Display room names on the map",
      true,
    );

    this.addToggle(
      "Show Puzzle Names",
      (value) => {
        DungeonConfig.showPuzzleNames = value;
      },
      "Display puzzle and trap room names",
      true,
    );

    this.addToggle(
      "Show Secrets",
      (value) => {
        DungeonConfig.showSecrets = value;
      },
      "Display max secrets in top-left of rooms",
      false,
    );

    this.addToggle(
      "Show Secrets Progress",
      (value) => {
        DungeonConfig.showSecretsProgress = value;
      },
      "Display found/max secrets (e.g., 7/9) on rooms",
      false,
    );

    this.addToggle(
      "Darken Unexplored",
      (value) => {
        DungeonConfig.darkenUnexplored = value;
      },
      "Darken unopened rooms on the map",
      true,
    );

    this.addToggle(
      "Show Player Heads",
      (value) => {
        DungeonConfig.playerHeads = value;
      },
      "Show player heads on the map",
      true,
    );

    this.addToggle(
      "Show Mimic Room",
      (value) => {
        DungeonConfig.showMimic = value;
      },
      "Show which room contains the mimic (F6-7)",
      true,
    );

    this.addToggle(
      "Hide In Boss",
      (value) => {
        DungeonConfig.hideInBoss = value;
      },
      "Hide the map after entering the boss room",
      false,
    );

    this.addColorPicker(
      "Background Color",
      [0, 0, 0, 179],
      (c) => {
        DungeonConfig.backgroundColor = c;
      },
      "Change the background color and transparency of the map",
    );

    this.addColorPicker(
      "Wither Door Color",
      [0, 255, 0, 255],
      (c) => {
        DungeonConfig.witherDoorColor = c;
      },
      "Changes the wither door color",
    );

    this.addSlider(
      "Map Scale",
      0.5,
      3.0,
      1.1,
      (value) => {
        DungeonConfig.mapScale = Number(value.toFixed(1));
        OverlayManager.updateDungeonMapScale?.(value);
      },
      "Scale of the map display",
    );

    this.addSlider(
      "Map X",
      0,
      500,
      10,
      (value) => {
        DungeonConfig.mapX = Math.round(value);
        OverlayManager.updateDungeonMapPos?.(value, null);
      },
      "X coordinate of the map on screen",
    );

    this.addSlider(
      "Map Y",
      0,
      500,
      80,
      (value) => {
        DungeonConfig.mapY = Math.round(value);
        OverlayManager.updateDungeonMapPos?.(null, value);
      },
      "Y coordinate of the map on screen",
    );

    this.on("tick", () => this.onTick());
    this.on("worldUnload", () => this.onWorldUnload());
  }

  onTick() {
    if (!this.active) {
      OverlayManager.setDungeonMapEnabled?.(false);
      return;
    }

    if (!isInDungeon()) {
      OverlayManager.setDungeonMapEnabled?.(false);
      if (DungeonState.rooms.length > 0) DungeonState.reset();
      return;
    }

    OverlayManager.setDungeonMapEnabled?.(true);

    this.scanCounter++;
    if (this.scanCounter % 5 === 0) {
      scanHotbarMap();
    }

    updatePlayers();
    updateDungeonStateFromScoreboard();

    if (DungeonConfig.scanMimic) {
      checkForMimic();
    }

    const floor = getDungeonFloor();
    if (floor && !DungeonState.floorNumber) {
      DungeonState.floorNumber = floor;
    }
  }

  onWorldUnload() {
    DungeonState.reset();
  }

  toggle(value) {
    const newVal = typeof value === "boolean" ? value : !this.active;
    this.active = newVal;
    DungeonConfig.enabled = newVal;
    OverlayManager.setDungeonMapEnabled?.(newVal && isInDungeon());
  }
}

new DungeonMap();
