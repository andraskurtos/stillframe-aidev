import { copy, v3 } from "../../engine/math";
import { newItem } from "../items";

export var ENEMY_PARAMS = {
  walker: { speed: 2.3, turnRate: 5, reaction: 0.5, aimError: 3.2, keepDist: 6, cooldownMul: 2.4, hp: 2, defaultWeapon: "pistol" },
  rusher: { speed: 5.2, turnRate: 9, reaction: 0.25, aimError: 0, keepDist: 0, cooldownMul: 1, hp: 2, defaultWeapon: null },
  marksman: { speed: 1.1, turnRate: 3.2, reaction: 0.7, aimError: 1, keepDist: 40, cooldownMul: 1, hp: 2, defaultWeapon: "carbine" }
};
export var ENEMY_RADIUS = 0.3;
export var ENEMY_HEIGHT = 1.8;
export var HEAD_OFFSET = 1.7;
export var HEAD_RADIUS = 0.17;
export var BODY_A = 0.25;
export var BODY_B = 1.45;
export var BODY_RADIUS = 0.27;
export var SPAWN_TIME = 0.6;
export var MELEE_TIME = 0.55;
export var MELEE_STRIKE_AT = 0.65;
export var MELEE_RANGE = 1.5;
export var TELEGRAPH = 0.6;
export var MARKSMAN_COOLDOWN = 1.9;
export var GRAVITY = 18;
export var MUZZLE_LOCAL = [0.24, 1.48, -0.72];
export function createEnemy(id, kind, pos, yaw, weapon, idle, seed) {
  const params = ENEMY_PARAMS[kind];
  const w = weapon === void 0 ? params.defaultWeapon : weapon;
  return {
    id,
    kind,
    alive: true,
    pos: [pos[0], pos[1], pos[2]],
    prevPos: [pos[0], pos[1], pos[2]],
    vel: v3(),
    yaw,
    prevYaw: yaw,
    grounded: false,
    state: idle ? "idle" : "alert",
    stateTime: 0,
    hp: params.hp,
    weapon: w ? newItem(w) : null,
    fireCooldown: 0.6,
    burstLeft: 0,
    burstTimer: 0,
    aimTimer: params.reaction,
    telegraph: 0,
    lockedDir: [0, 0, -1],
    meleeT: 0,
    prevMeleeT: 0,
    meleeCooldown: 0,
    stunTimer: 0,
    path: null,
    pathIndex: 0,
    repathTimer: 0,
    seesPlayer: false,
    walkPhase: seed * 6.28,
    prevWalkPhase: seed * 6.28,
    moveBlend: 0,
    prevMoveBlend: 0,
    aimBlend: 0,
    prevAimBlend: 0,
    aimPitch: 0,
    hitFlash: 0,
    spawnT: 0,
    prevSpawnT: 0,
    strafeSeed: seed * 10,
    targetPropId: -1,
    lastShotId: -1
  };
}
export function enemyIsTwoHanded(e) {
  return !!e.weapon && (e.weapon.kind === "scatter" || e.weapon.kind === "carbine");
}
export function enemyMuzzle(e, out) {
  const c = Math.cos(e.yaw);
  const s = Math.sin(e.yaw);
  const lx = MUZZLE_LOCAL[0], lz = MUZZLE_LOCAL[2];
  out[0] = e.pos[0] + lx * c + lz * s;
  out[1] = e.pos[1] + MUZZLE_LOCAL[1];
  out[2] = e.pos[2] - lx * s + lz * c;
  return out;
}
export var scratchA = v3();
export var scratchB = v3();
export var scratchC = v3();
export function savePrev(e) {
  copy(e.prevPos, e.pos);
  e.prevYaw = e.yaw;
  e.prevWalkPhase = e.walkPhase;
  e.prevMoveBlend = e.moveBlend;
  e.prevAimBlend = e.aimBlend;
  e.prevSpawnT = e.spawnT;
  e.prevMeleeT = e.meleeT;
}
