import { test, expect } from "vitest";
import { TimeScaleDriver } from "./time-scale-driver";

test("starts at MIN", () => {
  expect(new TimeScaleDriver().value).toBe(0.015);
});

test("no input stays at MIN", () => {
  const d = new TimeScaleDriver();
  expect(d.update(1 / 60, 0, 4, 0, false, false)).toBe(0.015);
});

test("full walking speed approaches 1", () => {
  const d = new TimeScaleDriver();
  for (let i = 0; i < 120; i++) {
    d.update(1 / 60, 4, 4, 0, false, false);
  }
  expect(d.value).toBeGreaterThan(0.99);
});

test("airborne floor is 0.8", () => {
  const d = new TimeScaleDriver();
  for (let i = 0; i < 120; i++) {
    d.update(1 / 60, 0, 4, 0, true, false);
  }
  expect(d.value).toBeCloseTo(0.8, 2);
});

test("action kick drives to 1", () => {
  const d = new TimeScaleDriver();
  d.actionKick();
  for (let i = 0; i < 6; i++) {
    d.update(1 / 60, 0, 4, 0, false, false);
  }
  expect(d.value).toBeGreaterThan(0.8);
});
