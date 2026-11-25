import { test, expect, vi } from "vitest";
import { Time } from "../engine/time";
import { PlayerController } from "../gameplay/player-controller";
import { TimeScaleDriver } from "../gameplay/time-scale-driver";
import { defaultSettings } from "../persistence/save";
import { Game } from "./game";

function makeFakeGame(state: string, pressedActions: string[] = []) {
  const pressed = new Set(pressedActions);
  const g = Object.create(Game.prototype) as any;
  g.state = state;
  g.stateTime = 0;
  g.runRealTime = 0;
  g.debugOverlayForced = false;
  g.save = { version: 1, settings: defaultSettings(), levels: {} };
  g.input = {
    pointerLocked: true,
    mouseDx: 0,
    mouseDy: 0,
    update: vi.fn(),
    wasPressed: (a: string) => pressed.has(a),
    moveAxes: () => ({ x: 0, y: 0 }),
    anyPressed: () => pressed.size > 0,
  };
  g.ui = {
    update: vi.fn(),
    showLockHint: vi.fn(),
  };
  g.player = new PlayerController();
  g.player.reset([0, 0, 0], 0);
  g.driver = new TimeScaleDriver();
  g.recorder = { push: vi.fn() };
  g.world = {
    static: {
      moveCharacter: () => ({ grounded: true, hitWall: false, hitCeiling: false }),
    },
    enemies: [],
    player: { burstLeft: 0 },
    applyPlayerFrame: () => false,
  };
  g.pause = vi.fn();
  g.resume = vi.fn();
  return g;
}

test("standing still in Game.frame keeps timeScale near MIN", () => {
  const g = makeFakeGame("playing");
  const t = new Time();
  t.realDt = 1 / 60;
  g.frame(t);
  expect(t.timeScale).toBeLessThan(0.1);
});

test("pressing pause in playing state pauses the game", () => {
  const g = makeFakeGame("playing", ["pause"]);
  const t = new Time();
  t.realDt = 1 / 60;
  g.frame(t);
  expect(g.pause).toHaveBeenCalledTimes(1);
});

test("pressing pause in paused state resumes the game", () => {
  const g = makeFakeGame("paused", ["pause"]);
  const t = new Time();
  t.realDt = 1 / 60;
  g.frame(t);
  expect(g.resume).toHaveBeenCalledTimes(1);
});

