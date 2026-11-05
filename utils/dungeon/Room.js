import { RoomTypes } from "./RoomTypes";
import { Checkmark } from "./Checkmark";

export class Room {
  constructor(components = [], type = RoomTypes.UNKNOWN) {
    this.components = components;
    this.type = type;
    this.checkmark = Checkmark.UNEXPLORED;
    this.explored = false;
    this.secrets = 0;
    this.foundSecrets = 0;
    this.corner = null;
    this.rotation = null;
    this.name = null;
    this.highlighted = false;
    this.checkmarkX = 0;
    this.checkmarkY = 0;
    this.checkmarkWidth = 0;
    this.checkmarkHeight = 0;
    this.roomNameX = 0;
    this.roomNameY = 0;
    this.checkmarkImage = null;
  }

  getName(includeType = false) {
    if (!this.name) return "Unknown";
    if (includeType) return `${this.name} (${this.type})`;
    return this.name;
  }

  addComponents(newComponents) {
    const existing = new Set(this.components.map((c) => `${c[0]},${c[1]}`));
    for (const comp of newComponents) {
      const key = `${comp[0]},${comp[1]}`;
      if (!existing.has(key)) {
        this.components.push(comp);
        existing.add(key);
      }
    }
  }

  loadFromRoomMapColor(color) {
    if (color === 119) {
      this.type = RoomTypes.UNKNOWN;
      this.secrets = 0;
    } else if (color === 30 || color === 34) {
      this.type = RoomTypes.NORMAL;
      this.secrets = 7;
    } else if (color === 18) {
      this.type = RoomTypes.BLOOD;
      this.secrets = 0;
    } else {
      this.type = RoomTypes.UNKNOWN;
      this.secrets = 0;
    }
  }

  draw(bufferedImage) {
    // Implemented in DungeonMap renderer
  }

  updateRenderVariables(
    mapScale,
    mapCorner,
    mapRoomSize,
    mapGapSize,
    defaultMapSize,
  ) {
    if (!this.components.length || !this.corner) return;

    const [cx, cz] = this.components[0];
    const roomCenterX =
      mapCorner[0] + Math.floor(mapRoomSize / 2) + mapGapSize * cx;
    const roomCenterY =
      mapCorner[1] + Math.floor(mapRoomSize / 2) + 1 + mapGapSize * cz;

    this.checkmarkX = roomCenterX;
    this.checkmarkY = roomCenterY;

    const scaleX = defaultMapSize[0] / 128;
    const scaleY = defaultMapSize[1] / 128;

    this.checkmarkX = Math.floor(this.checkmarkX * scaleX);
    this.checkmarkY = Math.floor(this.checkmarkY * scaleY);

    this.roomNameX = this.checkmarkX;
    this.roomNameY = this.checkmarkY - Math.floor(mapRoomSize * scaleY * 0.3);
  }

  toString() {
    return `Room(${this.name || "?"} type=${this.type} checkmark=${this.checkmark} components=${this.components.length})`;
  }
}
