import { DoorTypes } from "./DoorTypes";

export class Door {
  constructor(x, z, gx, gz, type = DoorTypes.NORMAL) {
    this.x = x;
    this.z = z;
    this.gx = gx;
    this.gz = gz;
    this.type = type;
    this.explored = false;
    this.drawX = 0;
    this.drawY = 0;
    this.drawWidth = 0;
    this.drawHeight = 0;
  }

  updateRenderVariables(mapCorner, mapRoomSize, mapGapSize, defaultMapSize) {
    const mapX =
      mapCorner[0] +
      Math.floor(mapRoomSize / 2) +
      Math.floor(mapGapSize / 2) * this.gx;
    const mapY =
      mapCorner[1] +
      Math.floor(mapRoomSize / 2) +
      Math.floor(mapGapSize / 2) * this.gz;

    const scaleX = defaultMapSize[0] / 128;
    const scaleY = defaultMapSize[1] / 128;

    this.drawX = Math.floor(mapX * scaleX);
    this.drawY = Math.floor(mapY * scaleY);
    this.drawWidth = Math.ceil(mapGapSize * scaleX);
    this.drawHeight = Math.ceil(mapGapSize * scaleY);
  }

  draw(bufferedImage) {
    // Implemented in DungeonMap renderer
  }

  toString() {
    return `Door(type=${this.type} gx=${this.gx} gz=${this.gz})`;
  }
}
