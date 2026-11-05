export const RoomTypes = {
  ENTRANCE: "entrance",
  NORMAL: "normal",
  RARE: "rare",
  PUZZLE: "puzzle",
  TRAP: "trap",
  YELLOW: "yellow",
  BLOOD: "blood",
  FAIRY: "fairy",
  BOSS: "boss",
  UNKNOWN: "unknown",
};

export const ROOM_TYPE_FROM_MAP_COLOR = {
  119: RoomTypes.UNKNOWN,
  30: RoomTypes.NORMAL,
  34: RoomTypes.NORMAL,
  18: RoomTypes.BLOOD,
};
