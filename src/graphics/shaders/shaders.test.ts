import { test, expect } from "vitest";
import { SHADERS } from "./index";

const cases = {
  scene: ["vsMain", "fsMain"],
  shadow: ["vsShadow"],
  glass: ["vsGlass", "fsGlass"],
  fx: ["vsFx", "fsFx"],
  outline: ["vsFull", "fsOutline"],
  bloom: ["vsFull", "fsPrefilter", "fsDown", "fsUp"],
  final: ["vsFull", "fsFinal"],
} as const;

for (const [name, entries] of Object.entries(cases)) {
  test(`${name} shader contains ${entries.join(", ")}`, () => {
    const src = SHADERS[name as keyof typeof SHADERS];
    expect(src.length).toBeGreaterThan(100);
    for (const e of entries) {
      expect(src).toContain(`fn ${e}(`);
    }
    expect(src).not.toContain("`");
  });
}

test("final shader does not multiply whole viewport to black on threat", () => {
  expect(SHADERS.final).not.toContain("mapped *= 1.0 - post.danger.x");
});
