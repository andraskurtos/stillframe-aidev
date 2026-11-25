import { test, expect } from "vitest";
import { LEVELS } from "../levels";
import { defaultSettings } from "../persistence/save";
import { Ui } from "./ui";

function makeUi(clearedIds: string[] = []) {
  const levels: Record<string, { cleared: boolean }> = {};
  for (const id of clearedIds) levels[id] = { cleared: true };
  const ui = Object.create(Ui.prototype) as Ui;
  ui.save = { version: 1, settings: defaultSettings(), levels };
  ui.levels = LEVELS;
  return ui;
}

test("level 0 (1-1) is unlocked on a fresh save", () => {
  const ui = makeUi();
  expect(ui.isUnlocked(0)).toBe(true);
});

test("level 1 (1-2) is locked until 1-1 is cleared", () => {
  expect(makeUi().isUnlocked(1)).toBe(false);
  expect(makeUi(["1-1"]).isUnlocked(1)).toBe(true);
});

