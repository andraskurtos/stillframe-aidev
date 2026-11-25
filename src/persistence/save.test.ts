import { beforeEach, test, expect } from "vitest";
import { fmtTime } from "../ui/format";
import { defaultSettings, loadSave } from "./save";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
});

test("no save → fresh defaults", () => {
  expect(loadSave()).toEqual({ version: 1, settings: defaultSettings(), levels: {} });
});

test("wrong version → fresh", () => {
  localStorage.setItem("stillframe.save", JSON.stringify({ version: 2 }));
  expect(loadSave().levels).toEqual({});
});

test("partial settings are merged with defaults", () => {
  localStorage.setItem(
    "stillframe.save",
    JSON.stringify({ version: 1, settings: { fov: 100 }, levels: { "1-1": { cleared: true } } }),
  );
  const s = loadSave();
  expect(s.settings.fov).toBe(100);
  expect(s.settings.sensitivity).toBe(1);
  expect(s.levels["1-1"].cleared).toBe(true);
});

test("corrupt JSON → fresh", () => {
  localStorage.setItem("stillframe.save", "{");
  expect(loadSave().version).toBe(1);
});

test("fmtTime formats m:ss.cc", () => {
  expect(fmtTime(75.5)).toBe("1:15.50");
});
