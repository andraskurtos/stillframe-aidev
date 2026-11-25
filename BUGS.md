# Bugs Found & Fixed

---

## BUG-1: PLAY button does not start level 1-1 (and level 1-1 is locked)

- **Steps to reproduce:**
  1. Open the game with a fresh `localStorage` (no prior save).
  2. Click **PLAY** on the title screen, or click **LEVELS** and try to select `1-1 PLATFORM`.
  3. Nothing happens on **PLAY**, and `1-1 PLATFORM` is disabled and labelled `LOCKED`.
- **Root cause:** `src/ui/ui.ts` — `Ui.isUnlocked(index)` checked `if (index < 0) return true;` instead of `if (index <= 0) return true;`. For level `0` (`1-1`), it looked up `this.levels[-1]` (`undefined`), returned `false`, and caused `Game.startLevel(0)` to return early.
- **Fix:** Changed the guard in `Ui.isUnlocked(index)` to `if (index <= 0) return true;`.
- **How verified:** Added unit tests in `src/ui/ui.test.ts` verifying `isUnlocked(0) === true` on a fresh save and `isUnlocked(1)` unlocking only after `"1-1"` is cleared; watched the test fail before the fix and pass after (`npm test`).

---

## BUG-2: Time-scale speed arguments swapped (core mechanic inverted)

- **Steps to reproduce:**
  1. Start any level and stand completely still (do not press movement keys or look around).
  2. Observe the world speed (enemies, bullets, crosshair): time runs at full speed (`1.0`) when stationary instead of slowing down to `0.015`.
- **Root cause:** `src/app/game.ts` — `Game.frame(t)` called `this.driver.update(dt, WALK_SPEED, this.player.planarSpeed, ...)`, swapping `planarSpeed` and `maxSpeed`. `TimeScaleDriver.update(realDt, planarSpeed, maxSpeed, ...)` computes `clamp(planarSpeed / maxSpeed, 0, 1)`, which evaluated `clamp(4 / 0, 0, 1) = 1` whenever the player stood still.
- **Fix:** Swapped the arguments back to `this.driver.update(dt, this.player.planarSpeed, WALK_SPEED, this.player.lookSpeed, !this.player.grounded, busy)`.
- **How verified:** Added a regression test in `src/app/game.test.ts` (`standing still in Game.frame keeps timeScale near MIN`) that runs `Game.prototype.frame` with zero player velocity; watched it fail (`timeScale` jumped toward `1`) before the fix and pass (`< 0.1`) after (`npm test`).

---

## BUG-3: Horizontal mouse look is inverted

- **Steps to reproduce:**
  1. Start any level with pointer lock active.
  2. Move the mouse to the right (`mouseDx > 0`).
  3. The camera rotates to the **left** instead of to the right.
- **Root cause:** `src/gameplay/player-controller.ts` — `PlayerController.look(input, dt, s)` updated yaw with `this.yaw += input.mouseDx * s.sensitivity;`. Because `Camera.forward()` and `PlayerController.update()` define forward as `(-Math.sin(yaw), 0, -Math.cos(yaw))`, increasing `yaw` rotates counter-clockwise (left, `-X`), while moving the mouse right gives positive `mouseDx`.
- **Fix:** Changed the sign to `this.yaw -= input.mouseDx * s.sensitivity;`.
- **How verified:** Added a unit test in `src/gameplay/player-controller.test.ts` (`moving mouse right turns camera right (+X)`) asserting `-Math.sin(pc.yaw) > 0` after positive `mouseDx`; watched it fail before the fix and pass after (`npm test`).

---

## BUG-4: Incoming threat post-process blacks out the entire screen

- **Steps to reproduce:**
  1. Start a level with armed enemies and let an enemy fire a bullet within 8 m or let a marksman start telegraphing.
  2. The entire viewport pulses to solid black (`rgb(0, 0, 0)`) and stays darkened for seconds after the threat passes.
- **Root cause:** `src/graphics/shaders/final.wgsl` — `fsFinal()` executed `mapped *= 1.0 - post.danger.x * threatPulse;`. Whenever `Game.incomingThreat()` returns `1` (enemy bullet within 8 m or active marksman telegraph), `post.danger.x` ramps to `1.0` in 0.05 s and `threatPulse` is `1.0` for most of the sine wave, multiplying the entire image to `0.0`. Additionally, `Game.updatePost()` in `src/app/game.ts` used a very slow decay constant (`tau = 2.5` s).
- **Fix:** Replaced the full-screen blackout in `src/graphics/shaders/final.wgsl` with a radial red edge-vignette tint (`let threatEdge = smoothstep(0.1, 0.65, radial * 1.6) * post.danger.x * (0.4 + 0.6 * threatPulse); mapped = mix(mapped, vec3f(0.85, 0.08, 0.12), threatEdge * 0.45);`) and tightened threat decay in `Game.updatePost()` from `2.5` s to `0.35` s.
- **How verified:** Added a shader regression check in `src/graphics/shaders/shaders.test.ts` verifying `SHADERS.final` no longer contains `mapped *= 1.0 - post.danger.x` and still compiles cleanly in the bundle (`npm test && npm run build`).

---

## BUG-5: `pause` action (`Escape` / gamepad Start) is never handled in `Game.frame()`

- **Steps to reproduce:**
  1. Press Start (button 9) on a gamepad during gameplay, or press `Escape` while on the pause screen to resume (or while playing without pointer lock).
  2. Nothing happens — keyboard `Escape` only paused indirectly because the browser exited pointer lock.
- **Root cause:** `src/app/game.ts` — `Game.frame(t)` never checked `input.wasPressed("pause")`, even though `pause` is bound to `Escape` and gamepad button `9` in `src/engine/input.ts`.
- **Fix:** Added an `if (input.wasPressed("pause"))` handler in `Game.frame(t)` that pauses (and exits pointer lock if active) from `"playing"` or `"intro"`, and resumes from `"paused"`.
- **How verified:** Added two unit tests in `src/app/game.test.ts` (`pressing pause in playing state pauses the game` and `pressing pause in paused state resumes the game`); watched both fail before the fix and pass after (`npm test`).
