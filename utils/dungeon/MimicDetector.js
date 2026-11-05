import DungeonState from "./DungeonState";
import { RoomTypes } from "./RoomTypes";
import { Checkmark } from "./Checkmark";
import { subArea } from "../Utils";

let lastMimicCheck = 0;

export function checkForMimic() {
  if (!DungeonDetector.isInDungeon()) return;

  const floor = DungeonDetector.getDungeonFloor();
  if (![6, 7].includes(floor)) return;

  const now = Date.now();
  if (now - lastMimicCheck < 1500) return;
  lastMimicCheck = now;

  const state = DungeonState;
  if (state.mimicKilled) return;

  for (const room of state.rooms) {
    if (room.type === RoomTypes.BLOOD && room.checkmark !== Checkmark.GREEN) {
      state.mimicRoom = room;
      room.checkmark = Checkmark.WHITE;
      state.setCheckmarkedRoom(room);
      return;
    }
  }
}

export function onWitherKeyObtained() {
  const state = DungeonState;
  state.witherKeys++;
}

export function onWitherDoorOpened() {
  const state = DungeonState;
  if (state.witherKeys > 0) state.witherKeys--;
}

export function onBloodDoorOpened() {
  const state = DungeonState;
  state.bloodKey = false;
}

export function onMimicRevealed() {
  const state = DungeonState;
  const bloodRoom = state.rooms.find((r) => r.type === RoomTypes.BLOOD);
  if (bloodRoom) {
    state.mimicKilled = true;
    state.setCheckmarkedRoom(bloodRoom);
    bloodRoom.checkmark = Checkmark.GREEN;
    bloodRoom.updateRenderVariables(1, 1);
  }
}

export function onMimicKilledByPlayer(playerName) {
  const state = DungeonState;
  const bloodRoom = state.rooms.find((r) => r.type === RoomTypes.BLOOD);
  if (bloodRoom) {
    state.mimicKilled = true;
    state.setCheckmarkedRoom(bloodRoom);
    bloodRoom.checkmark = Checkmark.GREEN;
    bloodRoom.updateRenderVariables(1, 1);
  }
}
