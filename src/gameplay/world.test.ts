import { test, expect } from "vitest";
import { FIXED_STEP } from "../engine/time";
import { LEVELS } from "../levels";
import { World } from "./world";

test("PLATFORM starts with 1 enemy and 4 remaining", () => {
  const w = new World(LEVELS[0]);
  expect(w.enemies).toHaveLength(1);
  expect(w.remainingEnemies).toBe(4);
});

test("one simulated second runs headless", () => {
  const w = new World(LEVELS[0]);
  for (let i = 0; i < 120; i++) {
    w.step(FIXED_STEP);
  }
  expect(w.simTime).toBeCloseTo(1, 5);
  expect(w.cleared).toBe(false);
});

test("every level builds a World", () => {
  for (const l of LEVELS) {
    expect(() => new World(l)).not.toThrow();
  }
});
