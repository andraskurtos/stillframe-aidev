import { test, expect } from "vitest";
import { Viewmodel } from "./viewmodel";

function captureKatanaTransform(slashAge: number) {
  const vm = new Viewmodel();
  let katanaMatrix: Float32Array | null = null;
  const katanaMesh = { id: "katana" };
  const renderer = {
    drawMesh(mesh: any, m: Float32Array) {
      if (mesh === katanaMesh) {
        katanaMatrix = new Float32Array(m);
      }
    },
  };
  const meshes = {
    items: { katana: katanaMesh },
    fist: { id: "fist" },
    forearm: { id: "forearm" },
  };
  const p = {
    held: { kind: "katana" },
    pickupAge: 99,
    throwAge: 99,
    recoilAge: 99,
    slashAge,
    punchAge: 99,
    punchSide: 1,
  };
  vm.draw(renderer, meshes, [0, 0, 0], 0, 0, p, 0, true);
  expect(katanaMatrix).not.toBeNull();
  return katanaMatrix!;
}

function transformPoint(m: Float32Array, p: [number, number, number]): [number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

test("katana idle pose is held in right hand and points upright toward top-left", () => {
  const m = captureKatanaTransform(99);
  const handle = transformPoint(m, [0, 0, 0.14]);
  const tip = transformPoint(m, [0, 0.016, -0.94]);

  // Held in right hand (bottom-right)
  expect(handle[0]).toBeGreaterThan(0.1);
  expect(handle[1]).toBeLessThan(0);

  // Tip faces top-left across POV, upright
  expect(tip[0]).toBeLessThan(0);
  expect(tip[1]).toBeGreaterThan(0.2);
  expect(tip[1]).toBeGreaterThan(handle[1] + 0.4);
});

test("katana slash cuts from top-right corner toward bottom-right", () => {
  // Start of cut (top-right wind-up apex at ~20% of 0.25s = 0.05s)
  const mStart = captureKatanaTransform(0.05);
  const tipStart = transformPoint(mStart, [0, 0.016, -0.94]);

  // End of downward cut (~65% of 0.25s = 0.1625s)
  const mEnd = captureKatanaTransform(0.1625);
  const tipEnd = transformPoint(mEnd, [0, 0.016, -0.94]);

  // Starts in top-right quadrant
  expect(tipStart[0]).toBeGreaterThan(0.15);
  expect(tipStart[1]).toBeGreaterThan(0.2);

  // Ends in bottom-right quadrant
  expect(tipEnd[0]).toBeGreaterThan(0.1);
  expect(tipEnd[1]).toBeLessThan(-0.15);
  expect(tipEnd[1]).toBeLessThan(tipStart[1] - 0.5);
});

