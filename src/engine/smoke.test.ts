import { mat4 } from "wgpu-matrix";
import { test, expect } from "vitest";

test("wgpu-matrix resolves from node_modules", () => {
  expect(Array.from(mat4.identity())).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
});
