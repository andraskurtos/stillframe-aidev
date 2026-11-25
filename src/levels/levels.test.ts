import { test, expect } from "vitest";
import { LEVELS } from "./index";

test("15 levels, 5 per act", () => {
  expect(LEVELS).toHaveLength(15);
  for (const a of [1, 2, 3]) {
    expect(LEVELS.filter((l) => l.act === a)).toHaveLength(5);
  }
});

test("ids are unique and ordered", () => {
  expect(LEVELS.map((l) => l.id)).toEqual([
    "1-1", "1-2", "1-3", "1-4", "1-5",
    "2-1", "2-2", "2-3", "2-4", "2-5",
    "3-1", "3-2", "3-3", "3-4", "3-5",
  ]);
});

test("first level is PLATFORM with 3 waves", () => {
  expect(LEVELS[0].name).toBe("PLATFORM");
  expect(LEVELS[0].waves).toHaveLength(3);
});

test("every level has boxes and a player spawn", () => {
  for (const l of LEVELS) {
    expect(l.boxes.length).toBeGreaterThan(0);
    expect(l.player.pos).toHaveLength(3);
  }
});
