# Known Bugs (Preserved During Refactor)

> **Policy:** No behaviour changes during the TypeScript/Vite restructure. Any bug discovered while reading or moving code is logged here with a brief description and intentionally left unfixed until a later testing/bugfix phase.

1. **PLAY button does not start level 1-1** — `Ui.isUnlocked(index)` (`legacy/Lab05-Testing-Index.html` L3717-3722, now `src/ui/ui.ts`) checks `if (index < 0) return true;` instead of `index <= 0`. For level 0 (`1-1`), `this.levels[-1]` is `undefined`, so `isUnlocked(0)` returns `false` and `Game.startLevel` returns early without starting the game.
2. **Time-scale speed arguments swapped** — `Game.frame` (`legacy/Lab05-Testing-Index.html` L6998, now `src/app/game.ts`) calls `this.driver.update(dt, WALK_SPEED, this.player.planarSpeed, ...)` whereas `TimeScaleDriver.update` expects `(realDt, planarSpeed, maxSpeed, ...)`. Because `planarSpeed` and `maxSpeed` are reversed, `moveInput` becomes `clamp(WALK_SPEED / planarSpeed, 0, 1)`, causing time to run at full speed when standing still (`4 / 0 = Infinity -> 1`).
