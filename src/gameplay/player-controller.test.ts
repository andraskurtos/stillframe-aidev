import { test, expect } from "vitest";
import { PlayerController } from "./player-controller";

test("moving mouse right turns camera right (+X)", () => {
  const pc = new PlayerController();
  pc.reset([0, 0, 0], 0);
  pc.look({ mouseDx: 100, mouseDy: 0 }, 1 / 60, { sensitivity: 0.0022, invertY: false });
  const forwardX = -Math.sin(pc.yaw);
  expect(forwardX).toBeGreaterThan(0);
});

