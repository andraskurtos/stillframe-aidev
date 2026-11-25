import { test, expect } from "vitest";
import { FIXED_STEP } from "../engine/time";
import { level } from "../levels/level-builder";
import { createEnemy } from "./enemies/enemy";
import { BULLET_SPEED, isGun, isWeapon, ITEM_NAMES, newItem } from "./items";
import { World } from "./world";

function arenaLevel(overrides: Record<string, any> = {}) {
  return level(
    {
      id: "test-katana",
      name: "ARENA",
      act: 1,
      theme: "transit",
      words: [],
      seed: 1,
      player: { pos: [0, 0, 4], yaw: 0, item: "katana" },
      props: [],
      waves: [],
      ...overrides,
    },
    (b) => {
      b.room(-10, -10, 10, 10, 5, { ceiling: true });
    },
  );
}

test("katana is registered as a melee weapon", () => {
  expect(isWeapon("katana")).toBe(true);
  expect(isGun("katana")).toBe(false);
  expect(ITEM_NAMES.katana).toBe("KATANA");
});

test("clicking with katana deflects a close enemy bullet along player aim", () => {
  const w = new World(arenaLevel());
  // Spawn an enemy bullet 1.5m directly in front of player eyes (eye = [0, 1.6, 4], fwd = [0, 0, -1])
  w.spawnProjectile([0, 1.6, 2.5], [0, 0, 1], 99, 1);
  const bullet = w.projectiles[0];

  w.applyPlayerFrame({
    pos: [0, 0, 4],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: true,
    fire: true,
    throwItem: false,
    interact: false,
    steps: 0,
  });

  expect(bullet.alive).toBe(true);
  expect(bullet.ownerId).toBe(0);
  expect(bullet.vel[2]).toBeCloseTo(-BULLET_SPEED, 2);
  expect(w.events.some((e) => e.type === "slice")).toBe(true);
});

test("deflected bullet kills an enemy in front of the player", () => {
  const w = new World(
    arenaLevel({
      waves: [{ when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -2], weapon: null }] }],
    }),
  );
  // Spawn enemy bullet right in front of player, heading toward player
  w.spawnProjectile([0, 1.4, 2.5], [0, 0, 1], w.enemies[0].id, 1);

  // Player deflects it straight forward toward the enemy at z = -2
  w.applyPlayerFrame({
    pos: [0, 0, 4],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: true,
    fire: true,
    throwItem: false,
    interact: false,
    steps: 0,
  });

  for (let i = 0; i < 60; i++) w.step(FIXED_STEP);
  expect(w.enemies).toHaveLength(0);
  expect(w.stats.kills).toBe(1);
});

test("thrown katana flies like a spear (no spin, aligned to aim) and instakills on body hit", () => {
  const w = new World(
    arenaLevel({
      waves: [{ when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -2], weapon: null }] }],
    }),
  );

  // Aim slightly down at enemy's torso (body hit, not head)
  w.applyPlayerFrame({
    pos: [0, 0, 4],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: -0.09,
    grounded: true,
    fire: false,
    throwItem: true,
    interact: false,
    steps: 0,
  });

  expect(w.player.held).toBeNull();
  const thrownKatana = w.props.find((p) => p.item.kind === "katana");
  expect(thrownKatana).toBeDefined();
  expect(thrownKatana.angVel).toEqual([0, 0, 0]);
  expect(thrownKatana.rot[0]).toBeCloseTo(-0.09, 3);
  expect(thrownKatana.rot[1]).toBeCloseTo(0, 3);

  for (let i = 0; i < 90; i++) w.step(FIXED_STEP);
  expect(w.enemies).toHaveLength(0);
  expect(w.stats.kills).toBe(1);
});

test("katana enemy spawns with a katana and drops it on death", () => {
  const e = createEnemy(1, "katana", [0, 0, 0], 0, undefined, false, 0.5);
  expect(e.weapon?.kind).toBe("katana");

  const w = new World(
    arenaLevel({
      player: { pos: [0, 0, 4], yaw: 0, item: "pistol" },
      waves: [{ when: { type: "start" }, spawns: [{ kind: "katana", pos: [0, 0] }] }],
    }),
  );
  expect(w.enemies[0].weapon?.kind).toBe("katana");
  w.killEnemy(w.enemies[0], [0, 0, -1], [0, 1.2, 0], false);
  expect(w.props.some((p) => p.item.kind === "katana")).toBe(true);
});

test("player can pick up a dropped katana and slash an enemy", () => {
  const w = new World(
    arenaLevel({
      player: { pos: [0, 0, 4], yaw: 0 },
      props: [{ kind: "katana", pos: [0, 0.2, 3.2] }],
      waves: [{ when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, 2.2], weapon: null }] }],
    }),
  );

  w.applyPlayerFrame({
    pos: [0, 0, 4],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: true,
    fire: false,
    throwItem: false,
    interact: true,
    steps: 0,
  });
  expect(w.player.held?.kind).toBe("katana");

  // Wait out the 0.12s pickup cooldown
  for (let i = 0; i < 20; i++) w.step(FIXED_STEP);

  w.applyPlayerFrame({
    pos: [0, 0, 4],
    vel: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    grounded: true,
    fire: true,
    throwItem: false,
    interact: false,
    steps: 0,
  });
  expect(w.stats.kills).toBe(1);
});
