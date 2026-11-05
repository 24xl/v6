export class DungeonPlayer {
  constructor(name) {
    this.player = name;
    this.iconX = 0;
    this.iconY = 0;
    this.realX = 0;
    this.realZ = 0;
    this.rotation = 0;
    this.currentRoom = null;
    this.lastRoom = null;
    this.inRender = false;
    this.skinTexture = null;
    this.visitedComponents = new Array(36).fill(0);
    this.lastRoomCheck = null;
    this.clearedRooms = { solo: 0, stacked: 0 };
    this.deaths = 0;
  }

  printClearStats(dungeonMap) {
    // Can be called via command
  }

  renderHead(holdingLeaps, mapScale, headScale) {
    // Implemented in renderer
  }
}
