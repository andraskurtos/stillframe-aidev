import { test, expect } from "vitest";
import { Time, FIXED_STEP } from "./time";

test("FIXED_STEP is 1/120", () => {
  expect(FIXED_STEP).toBeCloseTo(1 / 120);
});

test("realDt is clamped to 0.1 s", () => {
  const t = new Time();
  t.beginFrame(0);
  t.beginFrame(5000);
  expect(t.realDt).toBe(0.1);
});

test("scale 1 at 60 fps yields 2 fixed steps", () => {
  const t = new Time();
  t.beginFrame(0);
  t.beginFrame(1000 / 60);
  t.timeScale = 1;
  t.advanceSim();
  let n = 0;
  while (t.consumeStep()) n++;
  expect(n).toBe(2);
});

test("frozen lock gives zero sim time", () => {
  const t = new Time();
  t.lock = "frozen";
  expect(t.effectiveScale()).toBe(0);
});

test("more than 8 steps drops the accumulator", () => {
  const t = new Time();
  t.accumulator = 1;
  let n = 0;
  while (t.consumeStep()) n++;
  expect(n).toBe(8);
  expect(t.accumulator).toBe(0);
});
