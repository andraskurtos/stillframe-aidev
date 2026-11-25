import { ACT1 } from "./act1-transit";
import { ACT2 } from "./act2-office-tower";
import { ACT3 } from "./act3-rooftops";
export type { LevelDef } from "./level-builder";

export var LEVELS = [...ACT1, ...ACT2, ...ACT3];
export var ACT_NAMES = {
  1: "TRANSIT",
  2: "OFFICE TOWER",
  3: "ROOFTOPS"
};

