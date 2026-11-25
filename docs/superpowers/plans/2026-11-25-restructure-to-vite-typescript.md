# STILLFRAME → npm + Vite + TypeScript Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single 7 400-line `Lab05-Testing-Index.html` into a team-friendly npm project (Vite + TypeScript) split into responsibility-based modules, with shaders in their own files, `wgpu-matrix` as a real dependency, F5 dev/production debugging with working TypeScript breakpoints in VS Code / Antigravity IDE, a `BUGS.md` log of untouched bugs, and a `PART2.md` explaining the new module structure.

**Architecture:** Incremental, behaviour-preserving **strangler-fig extraction**. First we get the monolithic script running inside Vite + TypeScript with `wgpu-matrix` from `node_modules` (Task 3), so the real game is runnable and verifiable from the very first code move. Then, in small bottom-up steps along the dependency graph (`engine` → `graphics` → `audio` → `levels` → `gameplay` → `visuals` → `ui`/`persistence` → `app`), we peel one subsystem at a time out of `src/main.ts` into its own modules, importing it right back into `src/main.ts`. After **every** task, tests pass, the build succeeds, and the game is verified to behave identically to `legacy/Lab05-Testing-Index.html`.

**Tech Stack:** Node 22 LTS, npm, Vite (latest major, ≥ 7), TypeScript (latest 5.x), Vitest, `wgpu-matrix` 3.4.2, `@webgpu/types`, ESLint (flat config + typescript-eslint), Prettier, VS Code `js-debug` (`chrome` launch type, built into VS Code and Antigravity IDE).

**Spec:** the user's requests (this conversation) + [PART1.md](../../../PART1.md) (code map, subsystem list, line ranges).

## Global Constraints

- **Strictly zero behaviour changes.** Every quirk and bug of the original game MUST be preserved during this refactor (later lab parts test and fix them).
- **Bug log policy (`BUGS.md`).** Whenever you discover a bug while reading or extracting code, append a brief entry to `BUGS.md` (symptom, file/line, one-sentence cause) and **promptly ignore it** — do not fix it. Start `BUGS.md` in Task 1 with the bugs already noticed: PLAY button not starting level 1-1 (`Ui.isUnlocked(0)` returns `false`), swapped arguments in `driver.update(dt, WALK_SPEED, this.player.planarSpeed, ...)` (legacy L6998).
- **Small, step-by-step, verifiable changes.** Keep each extraction commit small and scoped to one responsibility. After every extraction task, run `npm test && npm run build` and verify in the browser that the game still behaves identically (same title screen orbit, same preserved PLAY bug, same gameplay when seeded).
- **Verbatim code moves.** Do not rename variables, merge duplicate constants, or refactor logic during extraction (Tasks 3–12). Allowed edits: `import`/`export`, `import type`, minimal type annotations required by `tsc`, replacing the CDN import with `wgpu-matrix`, and swapping inline shader strings for `?raw` `.wgsl` imports.
- Bundler-suffixed names (`GRAVITY2`, `GRAVITY3`, `WHITE2`, `WHITE3`, `MAX_PITCH2`, `CELL2`, `GLOVE2`, `lerp2`, `tmp`, `m2`, `scale2`, `info2`) keep their names until the optional Task 15 cleanup.
- `wgpu-matrix` version **3.4.2** (matching legacy L505). No other runtime dependency.
- Dev server: `http://localhost:5173` (`strictPort`). Production preview: `http://localhost:4173` (`strictPort`).
- Node **≥ 22.12** (`.nvmrc` = `22`, `package.json` `engines.node` = `">=22.12"`).
- Files: `kebab-case.ts`; one exported class per file where the legacy code had one class; tests colocated as `*.test.ts`.
- Line endings LF (convert CRLF from the legacy file when extracting).

## Review Focus

1. **Shader text drift** — a missing line or stray backtick in a `.wgsl` file only fails at runtime in the GPU compiler. Pinned by `src/graphics/shaders/shaders.test.ts` (Task 5): each file non-empty, no backticks, and contains all expected entry points.
2. **Breakpoints silently not binding in the production config** — happens if `build.sourcemap` is off or `webRoot` is wrong. Pinned by the manual verification step in Task 2 (breakpoint in a `.ts` file must bind solid red and pause in both launch configs).
3. **Circular imports producing `undefined` at module-evaluation time** (`World` ↔ `enemy-ai`, `Game` ↔ everything). Pinned by `src/gameplay/world.test.ts` (Task 9) constructing a `World` in Node, and by `import type` (`verbatimModuleSyntax`).
4. **F5 hanging forever** because the background-task problem matcher never sees Vite's "ready" line (ANSI colour codes). Pinned by `endsPattern: "Local.*http"` and the Task 2 verification.
5. **Subtle behavioural drift during extraction** — e.g. duplicating module-level state (`nextMeshId`, `visualRng` seed `12648430`), accidentally "fixing" a bug, or changing init order. Pinned by the strangler-fig per-task smoke verification, the `visualRng` singleton check (Task 10), and the full side-by-side parity checklist (Task 12).

---

## File Structure

```
lab5/
├── index.html                    # Vite entry: <canvas id="gfx">, #overlay, #unsupported, <script type="module" src="/src/main.ts">
├── package.json / package-lock.json
├── tsconfig.json
├── vite.config.ts                # Vite + Vitest config (ports, sourcemaps)
├── eslint.config.js / .prettierrc.json / .editorconfig / .gitattributes / .gitignore / .nvmrc
├── .vscode/
│   ├── launch.json               # F5: "Dev (Vite + Chrome)" and "Production (build + preview + Chrome)"
│   ├── tasks.json                # dev-server, build, preview-server, terminate helpers
│   ├── extensions.json           # recommended: WGSL, ESLint, Prettier, Vitest
│   └── settings.json
├── README.md                     # how to install, run, debug, test; quick folder tour
├── PART1.md                      # (exists) original analysis — links updated to legacy/
├── PART2.md                      # (Task 14) final module structure & rationale for the split
├── BUGS.md                       # (Task 1+) running log of discovered bugs (brief description, ignored during refactor)
├── legacy/
│   └── Lab05-Testing-Index.html  # original, untouched, kept for reference and parity checks
└── src/
    ├── main.ts                   # boot(): create Gfx, Game, start loop          (legacy L7394-7418)
    ├── vite-env.d.ts             # /// <reference types="vite/client" />
    ├── styles/
    │   └── main.css              # all CSS                                         (L8-493)
    ├── app/                      # glue that owns and wires every subsystem
    │   └── game.ts               # Game class, state machine, render glue          (L6696-7392)
    ├── engine/                   # game-agnostic foundations, no deps on game code
    │   ├── math.ts               # v3, lerp, approach, angleDiff, …                (L2158-2232)
    │   ├── rng.ts                # Rng                                             (L4614-4637)
    │   ├── time.ts               # Time, FIXED_STEP, MAX_REAL_DT, MAX_STEPS_PER_FRAME (L2056-2118)
    │   ├── loop.ts               # Loop (requestAnimationFrame)                    (L2120-2156)
    │   ├── input.ts              # Input, DEFAULT_BINDINGS, gamepad constants      (L1876-2054)
    │   └── camera.ts             # Camera, MAX_PITCH                               (L1836-1874)
    ├── graphics/                 # WebGPU: device, meshes, renderer, shaders (no game knowledge)
    │   ├── gfx.ts                # Gfx, UnsupportedError                           (L507-622)
    │   ├── mesh.ts               # Mesh, vertex layout, createBufferWithData       (L632-664)
    │   ├── color.ts              # srgbHex                                         (L3816-3822)
    │   ├── mesh-builder.ts       # BOX_FACES, CORNER_SIGNS, MeshBuilder            (L3823-3923)
    │   ├── renderer.ts           # Renderer, defaultPostParams, constants, WHITE   (L1135-1834)
    │   └── shaders/
    │       ├── index.ts          # SHADERS: composes common/fullscreen chunks + stage files
    │       ├── common.wgsl       # (L667-715)
    │       ├── scene.wgsl        # (L719-784)
    │       ├── shadow.wgsl       # (L788-795)
    │       ├── glass.wgsl        # (L799-856)
    │       ├── fx.wgsl           # (L860-934)
    │       ├── fullscreen.wgsl   # legacy "post_default" (L938-960)
    │       ├── outline.wgsl      # (L964-1016)
    │       ├── bloom.wgsl        # (L1020-1066)
    │       ├── final.wgsl        # (L1070-1132)
    │       └── shaders.test.ts
    ├── audio/
    │   ├── audio-engine.ts       # AudioEngine                                     (L2233-2400)
    │   └── synths.ts             # make, noise, filters, gunshot, SYNTHS           (L2401-2508)
    ├── levels/                   # pure data: what each level contains
    │   ├── level-builder.ts      # LevelBuilder, level()                           (L2509-2610)
    │   ├── act1-transit.ts       # platform…lastTrain, ACT1                        (L2611-2837)
    │   ├── act2-office-tower.ts  # lobby…boardroom, ACT2                           (L2839-3062)
    │   ├── act3-rooftops.ts      # roof/acUnit/skyline helpers, ledge…spire, ACT3  (L3064-3386)
    │   ├── index.ts              # LEVELS, ACT_NAMES                               (L3388-3394)
    │   └── levels.test.ts
    ├── gameplay/                 # simulation: rules, physics, AI — no rendering/audio/DOM
    │   ├── constants.ts          # EYE_HEIGHT, PLAYER_*, REACH, THROW_SPEED, REST_ROT, … (L5198-5220)
    │   ├── items.ts              # BULLET_*, WEAPONS, isWeapon, isGun, newItem, ITEM_*, FRAGILE (L4792-4824)
    │   ├── physics/
    │   │   ├── static-world.ts   # StaticWorld, CELL, EPS                          (L3997-4203)
    │   │   └── intersect.ts      # cellKey, clampN, rayBox, segmentSphere, segmentCapsule (L4204-4304)
    │   ├── navigation/
    │   │   └── nav-grid.ts       # NavGrid + constants                             (L4305-4582)
    │   ├── enemies/
    │   │   ├── enemy.ts          # ENEMY_PARAMS, enemy constants, createEnemy, enemyIsTwoHanded, enemyMuzzle, scratch vectors, savePrev (L4826-4915)
    │   │   └── enemy-ai.ts       # updateEnemy, setState, applyGravityAndMove, nextWaypoint, handleShooting, aimDirection, fireVolley, meleeStrike (L4916-5196)
    │   ├── world.ts              # World, removeDead                               (L5221-6063)
    │   ├── player-controller.ts  # PlayerController + movement constants           (L6064-6159)
    │   ├── time-scale-driver.ts  # TimeScaleDriver  ← the key mechanic             (L6161-6190)
    │   ├── replay.ts             # ReplayRecorder, ReplayPlayer                    (L6571-6621)
    │   ├── world.test.ts
    │   └── time-scale-driver.test.ts
    ├── visuals/                  # game-specific looks built on graphics/ (meshes, FX, poses)
    │   ├── visual-rng.ts         # export const visualRng = new Rng(12648430)      (L4638)
    │   ├── themes.ts             # m(), THEMES                                     (L3924-3996)
    │   ├── level-mesh.ts         # buildLevelMesh, buildLevelScene                 (L4583-4613)
    │   ├── mesh-library.ts       # PART_IDS/EXTENTS/CENTER, palette, buildMeshLibrary (L4640-4791)
    │   ├── enemy-pose.ts         # createPose, computePose, lerp2, easeOut         (L6623-6695)
    │   ├── fx-system.ts          # FxSystem, randomUnit, compact, MAX_*            (L6192-6454)
    │   └── viewmodel.ts          # Viewmodel, GLOVE2                               (L6455-6570)
    ├── ui/                       # DOM: menus, HUD, overlays
    │   ├── ui.ts                 # Ui                                              (L3400-3733)
    │   ├── format.ts             # fmtTime                                         (L3395-3399)
    │   ├── debug-overlay.ts      # DebugOverlay                                    (L3779-3815)
    │   └── unsupported-panel.ts  # showUnsupported                                 (L623-630)
    └── persistence/
        ├── save.ts               # KEY, defaultSettings, loadSave, writeSave       (L3735-3777)
        └── save.test.ts
```

**Allowed dependencies (enforced by ESLint in Task 13):**

| Folder | May import from |
|---|---|
| `engine/` | `wgpu-matrix` only |
| `graphics/` | `engine/`, `wgpu-matrix` |
| `audio/` | `engine/` |
| `levels/` | nothing in `src/` except `levels/` |
| `gameplay/` | `engine/`, `levels/` (types), `gameplay/` |
| `visuals/` | `engine/`, `graphics/`, `gameplay/`, `levels/` (types) |
| `ui/`, `persistence/` | `engine/`, `levels/` (types), `persistence/` (types) |
| `app/` | everything |

**Strangler-fig extraction recipe (applies to Tasks 4–12):**
1. Move the target declarations **out of `src/main.ts`** into their new module file(s), keeping expressions verbatim.
2. Convert `var X = class _X {` → `export class X {` (updating internal `_X` references to `X`); prefix every symbol used elsewhere with `export`.
3. Add `import` (and `import type` for type-only references) in the new module(s) and import the extracted symbols back into `src/main.ts` so `src/main.ts` shrinks cleanly while staying runnable.
4. Add only the minimal type annotations `tsc` requires (e.g. uninitialised class fields, `any` where unclear). Do **not** alter behaviour.
5. If you notice any bug while moving code, append a one-paragraph entry to `BUGS.md` and leave the bug untouched.
6. Verify: run `npm test && npm run build` AND do a quick browser check (`npm run dev` or F5 Dev) to confirm the game still loads and behaves the same.

---

### Task 0: Toolchain prerequisites

The machine currently has Node 20.20.2 with npm 12.2.0, which prints `"npm v12.2.0 does not support Node.js v20.20.2"`.

**Files:**
- Create: `.nvmrc`

- [ ] **Step 1:** Install/activate Node 22 LTS (e.g. `nvm install 22 && nvm use 22`) and write `22` into `.nvmrc`.
- [ ] **Step 2: Verify** — Run: `node -v && npm -v`. Expected: `v22.x` (≥ 22.12) and no version-mismatch warning.
- [ ] **Step 3: Commit** — `git add .nvmrc && git commit -m "chore: pin Node 22 via .nvmrc"`

---

### Task 1: Scaffold the npm + Vite + TypeScript + Vitest project and `BUGS.md`

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` (placeholder), `src/main.ts` (placeholder), `src/vite-env.d.ts`, `src/engine/smoke.test.ts` (temporary), `BUGS.md`, `.gitignore`, `.editorconfig`, `.gitattributes`
- Move: `Lab05-Testing-Index.html` → `legacy/Lab05-Testing-Index.html` (`git mv` if tracked, else `mv`)
- Modify: `PART1.md` — update links `Lab05-Testing-Index.html#…` → `legacy/Lab05-Testing-Index.html#…`

**Interfaces:**
- Produces npm scripts used by every later task and by `.vscode/tasks.json`:
  `dev` = `vite`, `build` = `tsc --noEmit && vite build`, `preview` = `vite preview`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `test:watch` = `vitest`.

- [ ] **Step 1:** `npm init -y`; set `"private": true`, `"type": "module"`, `"name": "stillframe"`, `"engines": { "node": ">=22.12" }`, and the scripts above.
- [ ] **Step 2:** `npm i wgpu-matrix@3.4.2` and `npm i -D vite typescript vitest @webgpu/types`.
- [ ] **Step 3:** `tsconfig.json` with: `target` `ES2022`, `module` `ESNext`, `moduleResolution` `Bundler`, `lib` `["ES2022","DOM","DOM.Iterable"]`, `types` `["vite/client","@webgpu/types"]`, `strict` `false`, `noImplicitAny` `false`, `isolatedModules` `true`, `verbatimModuleSyntax` `true`, `useDefineForClassFields` `true`, `noEmit` `true`, `skipLibCheck` `true`, `include` `["src","vite.config.ts"]`.
- [ ] **Step 4:** `vite.config.ts` using `defineConfig` from `vitest/config`: `server: { port: 5173, strictPort: true }`, `preview: { port: 4173, strictPort: true }`, `build: { target: "es2022", sourcemap: true, outDir: "dist" }`, `test: { environment: "node", include: ["src/**/*.test.ts"] }`.
- [ ] **Step 5:** `.gitignore` (`node_modules/`, `dist/`, `*.log`, `.vite/`), `.editorconfig` (LF, utf-8, 2 spaces, final newline), `.gitattributes` (`* text=auto eol=lf`).
- [ ] **Step 6:** Create `BUGS.md` with a short header explaining that bugs listed here are intentionally preserved during the restructure, seeded with the two bugs already known:
  1. **PLAY button does not start level 1-1** — `Ui.isUnlocked(0)` checks `index < 0` instead of `index <= 0`, so level 0 is reported locked and `Game.startLevel` returns early.
  2. **Time-scale speed arguments swapped** — `Game.frame` calls `this.driver.update(dt, WALK_SPEED, this.player.planarSpeed, ...)` instead of `(dt, this.player.planarSpeed, WALK_SPEED, ...)`, inverting `moveInput`.
- [ ] **Step 7:** Placeholder `index.html` (`<script type="module" src="/src/main.ts">`), `src/main.ts` (`console.info("[boot] scaffold ok");`), and `src/vite-env.d.ts` (`/// <reference types="vite/client" />`).
- [ ] **Step 8: Write the smoke test** `src/engine/smoke.test.ts`:
  ```ts
  import { mat4 } from "wgpu-matrix";
  import { test, expect } from "vitest";
  test("wgpu-matrix resolves from node_modules", () => {
    expect(Array.from(mat4.identity())).toEqual([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  });
  ```
- [ ] **Step 9: Verify** — Run: `npm test && npm run build`. Expected: 1 test passed; `dist/index.html` and `dist/assets/*.js.map` exist.
- [ ] **Step 10:** Move `Lab05-Testing-Index.html` → `legacy/Lab05-Testing-Index.html` and update `PART1.md` links (`sed -i 's#](Lab05-Testing-Index.html#](legacy/Lab05-Testing-Index.html#g' PART1.md`). Verify `grep -c "](legacy/" PART1.md` > 0 and `grep -c "](Lab05" PART1.md` = 0.
- [ ] **Step 11: Commit** — `git add -A && git commit -m "chore: scaffold Vite + TypeScript + Vitest project, BUGS.md, move legacy file"`

---

### Task 2: F5 debugging in VS Code / Antigravity IDE

Set up before moving game code so every single extraction task can be debugged and verified with F5.

**Files:**
- Create: `.vscode/tasks.json`, `.vscode/launch.json`, `.vscode/extensions.json`, `.vscode/settings.json`

**Interfaces:**
- Produces task labels: `dev-server` (background), `build`, `preview-server` (background, `dependsOn: "build"`).
- Produces launch configs: `Dev (Vite + Chrome)`, `Production (build + preview + Chrome)`.

- [ ] **Step 1: `.vscode/tasks.json`** — three `"type": "npm"` tasks:
  - `dev-server`: `"script": "dev"`, `"isBackground": true`.
  - `build`: `"script": "build"`, `"group": "build"`, `"problemMatcher": ["$tsc"]`.
  - `preview-server`: `"script": "preview"`, `"isBackground": true`, `"dependsOn": "build"`.
  Both background tasks use:
  ```jsonc
  "problemMatcher": {
    "owner": "vite",
    "pattern": { "regexp": "x^", "file": 1, "location": 2, "message": 3 },
    "background": { "activeBegins": true, "beginsPattern": "VITE", "endsPattern": "Local.*http" }
  }
  ```
- [ ] **Step 2: `.vscode/launch.json`** — two `"type": "chrome"`, `"request": "launch"` configs, both with `"webRoot": "${workspaceFolder}"`, `"sourceMaps": true`, and `"runtimeArgs": ["--enable-unsafe-webgpu", "--enable-features=Vulkan"]`:
  - `Dev (Vite + Chrome)`: `"url": "http://localhost:5173"`, `"preLaunchTask": "dev-server"`, `"postDebugTask": "${input:stopDev}"`.
  - `Production (build + preview + Chrome)`: `"url": "http://localhost:4173"`, `"preLaunchTask": "preview-server"`, `"postDebugTask": "${input:stopPreview}"`.
  - `inputs`: `stopDev` and `stopPreview` calling `workbench.action.tasks.terminate` on `dev-server` / `preview-server`.
- [ ] **Step 3:** `.vscode/extensions.json` (`PolyMeilex.wgsl`, `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`, `vitest.explorer`) and `.vscode/settings.json` (`"typescript.tsdk": "node_modules/typescript/lib"`, `"files.eol": "\n"`, `"editor.formatOnSave": true`).
- [ ] **Step 4: Verify dev F5** — Place a breakpoint on `console.info` in `src/main.ts`, select **Dev (Vite + Chrome)**, press **F5**. Expected: Vite starts, Chrome opens `localhost:5173`, breakpoint binds solid red and pauses; stopping debug terminates `dev-server`.
- [ ] **Step 5: Verify production F5** — Select **Production (build + preview + Chrome)**, press **F5**. Expected: `tsc` + `vite build` run, preview starts on `4173`, the same breakpoint in `src/main.ts` binds and pauses via sourcemaps.
- [ ] **Step 6: Commit** — `git add .vscode && git commit -m "chore: F5 launch configs for dev and production with TS breakpoints"`

---

### Task 3: Establish the runnable baseline (HTML, CSS, monolithic `src/main.ts` + npm `wgpu-matrix`)

Getting the full game running inside Vite + TypeScript first lets us verify behaviour after **every** subsequent extraction task.

**Files:**
- Modify: `index.html` — `<head>` from legacy L1-7, body from L497-503, `<script type="module" src="/src/main.ts"></script>`.
- Create: `src/styles/main.css` (legacy L9-493, LF line endings).
- Modify: `src/main.ts` — `import "./styles/main.css";` + `import { mat4, vec3 } from "wgpu-matrix";` + legacy L507-7418 (LF line endings), with only the minimal type annotations `tsc` needs (e.g. uninitialised class fields typed as `any`).

- [ ] **Step 1:** Extract `index.html`, `src/styles/main.css`, and the monolithic `src/main.ts`. Confirm `grep -rn "cdn.jsdelivr" src index.html` returns nothing.
- [ ] **Step 2: Verify build & baseline parity** — Run `npm run build` (must pass `tsc --noEmit` and produce `dist/`). Launch F5 **Dev** and verify:
  - Title screen renders the slowly orbiting level; no new console errors.
  - Clicking PLAY does **not** start the game (preserved bug).
  - Seeding `stillframe.save` with `{"version":1,"settings":{},"levels":{"1-1":{"cleared":true}}}` and reloading lets CONTINUE start level 1-2 with audio, HUD, and enemies working identically to `legacy/Lab05-Testing-Index.html`.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "refactor: establish runnable Vite + TS baseline with npm wgpu-matrix"`

---

### Task 4: Extract `engine/` modules

**Files:**
- Create: `src/engine/math.ts`, `rng.ts`, `time.ts`, `loop.ts`, `input.ts`, `camera.ts`, `src/engine/time.test.ts`
- Modify: `src/main.ts` (remove extracted blocks, import them from `./engine/*`)
- Delete: `src/engine/smoke.test.ts`

**Interfaces:**
- Produces: `math.ts` (`v3, set, copy, scale, lerp, dot, lenSq, len, distSq, distXZ, normalize, clamp, lerpN, approach, angleDiff, lerpAngle, turnToward, yawOf, dirFromYawPitch`); `rng.ts` (`class Rng`); `time.ts` (`class Time, FIXED_STEP, MAX_REAL_DT, MAX_STEPS_PER_FRAME`); `loop.ts` (`class Loop`); `input.ts` (`class Input, DEFAULT_BINDINGS`); `camera.ts` (`class Camera`, imports `mat4, vec3` from `"wgpu-matrix"`).

- [ ] **Step 1: Write characterization tests** `src/engine/time.test.ts`:
  ```ts
  test("FIXED_STEP is 1/120", () => expect(FIXED_STEP).toBeCloseTo(1/120));
  test("realDt is clamped to 0.1 s", () => { const t = new Time(); t.beginFrame(0); t.beginFrame(5000); expect(t.realDt).toBe(0.1); });
  test("scale 1 at 60 fps yields 2 fixed steps", () => {
    const t = new Time(); t.beginFrame(0); t.beginFrame(1000/60); t.timeScale = 1; t.advanceSim();
    let n = 0; while (t.consumeStep()) n++; expect(n).toBe(2);
  });
  test("frozen lock gives zero sim time", () => { const t = new Time(); t.lock = "frozen"; expect(t.effectiveScale()).toBe(0); });
  test("more than 8 steps drops the accumulator", () => {
    const t = new Time(); t.accumulator = 1; let n = 0; while (t.consumeStep()) n++; expect(n).toBe(8); expect(t.accumulator).toBe(0);
  });
  ```
- [ ] **Step 2:** Run `npm test` — Expected: FAIL (`Cannot find module './time'`).
- [ ] **Step 3:** Extract the six modules from `src/main.ts` using the strangler-fig recipe and wire imports back into `src/main.ts`.
- [ ] **Step 4: Verify** — `npm test && npm run build`. Expected: 5 passed, 0 type errors. Quick browser check: game boots and orbits title screen identically.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: extract engine modules (math, rng, time, loop, input, camera)"`

---

### Task 5: Extract `graphics/` modules and `.wgsl` shader files

**Files:**
- Create: `src/graphics/gfx.ts`, `mesh.ts`, `color.ts`, `mesh-builder.ts`, `renderer.ts`
- Create: the nine `src/graphics/shaders/*.wgsl` files (exact inner text between backticks), `src/graphics/shaders/index.ts`, `src/graphics/shaders/shaders.test.ts`
- Modify: `src/main.ts` (remove extracted blocks, import from `./graphics/*`)

**Interfaces:**
- Produces: `shaders/index.ts` exporting `SHADERS: Record<"scene"|"shadow"|"glass"|"fx"|"outline"|"bloom"|"final", string>` via `?raw` imports (same concatenation order as legacy L1305-1311).
- `renderer.ts` uses `SHADERS.*` and exports `class Renderer, defaultPostParams, WHITE`.
- `gfx.ts` exports `class Gfx, UnsupportedError`; `mesh.ts` exports `class Mesh, VERTEX_FLOATS, VERTEX_STRIDE, STATIC_VERTEX_LAYOUT, createBufferWithData`; `color.ts` exports `srgbHex`; `mesh-builder.ts` exports `class MeshBuilder`.

- [ ] **Step 1: Write the failing test** `src/graphics/shaders/shaders.test.ts`:
  ```ts
  const cases = { scene: ["vsMain","fsMain"], shadow: ["vsShadow"], glass: ["vsGlass","fsGlass"], fx: ["vsFx","fsFx"],
                  outline: ["vsFull","fsOutline"], bloom: ["vsFull","fsPrefilter","fsDown","fsUp"], final: ["vsFull","fsFinal"] };
  for (const [name, entries] of Object.entries(cases))
    test(`${name} shader contains ${entries.join(", ")}`, () => {
      const src = SHADERS[name as keyof typeof SHADERS];
      expect(src.length).toBeGreaterThan(100);
      for (const e of entries) expect(src).toContain(`fn ${e}(`);
      expect(src).not.toContain("`");
    });
  ```
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Extract the 9 `.wgsl` files, create `shaders/index.ts`, extract the 5 graphics TS modules from `src/main.ts`, and wire imports back into `src/main.ts`.
- [ ] **Step 4: Verify** — `npm test && npm run build`. Quick browser check: WebGPU shaders compile with zero `[gfx]` errors/warnings in console, scene renders identically.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: extract graphics modules and move shaders to .wgsl files"`

---

### Task 6: Extract `audio/` modules

**Files:**
- Create: `src/audio/audio-engine.ts` (`class AudioEngine`), `src/audio/synths.ts` (`SYNTHS` + synth helpers)
- Modify: `src/main.ts` (remove extracted blocks, import `AudioEngine`)

- [ ] **Step 1:** Extract using the strangler-fig recipe; keep `synths.ts` helpers module-local unless `AudioEngine` uses them.
- [ ] **Step 2: Verify** — `npm test && npm run build`. Quick browser check: UI click sound and gunshot SFX still play identically.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "refactor: extract audio modules"`

---

### Task 7: Extract `levels/` modules

**Files:**
- Create: `src/levels/level-builder.ts`, `act1-transit.ts`, `act2-office-tower.ts`, `act3-rooftops.ts`, `index.ts`, `levels.test.ts`
- Modify: `src/main.ts` (remove level definitions, import `LEVELS, ACT_NAMES`)

**Interfaces:**
- Produces: `level-builder.ts` exports `class LevelBuilder`, `level(meta, build)`, and `type LevelDef`; `index.ts` exports `LEVELS: LevelDef[]`, `ACT_NAMES`.

- [ ] **Step 1: Write the failing test** `src/levels/levels.test.ts`:
  ```ts
  test("15 levels, 5 per act", () => { expect(LEVELS).toHaveLength(15); for (const a of [1,2,3]) expect(LEVELS.filter(l => l.act === a)).toHaveLength(5); });
  test("ids are unique and ordered", () => expect(LEVELS.map(l => l.id)).toEqual(["1-1","1-2","1-3","1-4","1-5","2-1","2-2","2-3","2-4","2-5","3-1","3-2","3-3","3-4","3-5"]));
  test("first level is PLATFORM with 3 waves", () => { expect(LEVELS[0].name).toBe("PLATFORM"); expect(LEVELS[0].waves).toHaveLength(3); });
  test("every level has boxes and a player spawn", () => { for (const l of LEVELS) { expect(l.boxes.length).toBeGreaterThan(0); expect(l.player.pos).toHaveLength(3); } });
  ```
  (If legacy IDs differ, match the legacy file verbatim.)
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Extract from `src/main.ts` and wire imports back.
- [ ] **Step 4: Verify** — `npm test && npm run build`. Quick browser check: LEVELS screen still lists all 3 acts and 15 levels identically.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: extract level data into per-act modules"`

---

### Task 8: Extract `gameplay/` foundations (physics, navigation, items, constants)

Splitting `gameplay/` into two small tasks keeps each diff easy to review.

**Files:**
- Create: `src/gameplay/constants.ts`, `items.ts`, `physics/intersect.ts`, `physics/static-world.ts`, `navigation/nav-grid.ts`
- Modify: `src/main.ts` (remove extracted blocks, import them)

**Interfaces:**
- Consumes: `engine/math`.
- Produces: `StaticWorld`, `cellKey, clampN, rayBox, segmentSphere, segmentCapsule`, `NavGrid`, `BULLET_*, WEAPONS, isWeapon, isGun, newItem, ITEM_NAMES, ITEM_RADIUS, FRAGILE`, `EYE_HEIGHT, PLAYER_*, REACH, PROP_PHYS_RADIUS, GRAVITY2, THROW_SPEED, PUNCH_*, SLASH_RANGE, SHOT_HEARING, REST_ROT`.

- [ ] **Step 1:** Extract the five modules from `src/main.ts` using the strangler-fig recipe. Keep `REST_ROT` in `constants.ts` (verbatim).
- [ ] **Step 2: Verify** — `npm test && npm run build`; `grep -rnE "document\.|window\.|graphics/|visuals/" src/gameplay` → no output. Quick browser check: game runs identically.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "refactor: extract gameplay physics, navigation, items, and constants"`

---

### Task 9: Extract `gameplay/` simulation (enemies, world, player controller, time-scale driver, replay)

**Files:**
- Create: `src/gameplay/enemies/enemy.ts`, `enemies/enemy-ai.ts`, `world.ts`, `player-controller.ts`, `time-scale-driver.ts`, `replay.ts`
- Create: `src/gameplay/world.test.ts`, `src/gameplay/time-scale-driver.test.ts`
- Modify: `src/main.ts` (remove extracted blocks, import them)

**Interfaces:**
- Consumes: `engine/*`, `levels` (`type LevelDef`), Task 8 modules.
- Produces: `class World`, `class PlayerController`, `WALK_SPEED`, `class TimeScaleDriver`, `class ReplayRecorder`, `class ReplayPlayer`, `enemyIsTwoHanded`, `enemyMuzzle`.
- `enemy-ai.ts` uses `import type { World } from "../world"` so there is no runtime import cycle.

- [ ] **Step 1: Write the failing tests.**
  `src/gameplay/world.test.ts`:
  ```ts
  test("PLATFORM starts with 1 enemy and 4 remaining", () => {
    const w = new World(LEVELS[0]); expect(w.enemies).toHaveLength(1); expect(w.remainingEnemies).toBe(4);
  });
  test("one simulated second runs headless", () => {
    const w = new World(LEVELS[0]); for (let i = 0; i < 120; i++) w.step(FIXED_STEP);
    expect(w.simTime).toBeCloseTo(1, 5); expect(w.cleared).toBe(false);
  });
  test("every level builds a World", () => { for (const l of LEVELS) expect(() => new World(l)).not.toThrow(); });
  ```
  `src/gameplay/time-scale-driver.test.ts` (characterizes `TimeScaleDriver.update` itself, not the buggy call site in `Game`):
  ```ts
  test("starts at MIN", () => expect(new TimeScaleDriver().value).toBe(0.015));
  test("no input stays at MIN", () => { const d = new TimeScaleDriver(); expect(d.update(1/60, 0, 4, 0, false, false)).toBe(0.015); });
  test("full walking speed approaches 1", () => { const d = new TimeScaleDriver(); for (let i=0;i<120;i++) d.update(1/60, 4, 4, 0, false, false); expect(d.value).toBeGreaterThan(0.99); });
  test("airborne floor is 0.8", () => { const d = new TimeScaleDriver(); for (let i=0;i<120;i++) d.update(1/60, 0, 4, 0, true, false); expect(d.value).toBeCloseTo(0.8, 2); });
  test("action kick drives to 1", () => { const d = new TimeScaleDriver(); d.actionKick(); for (let i=0;i<6;i++) d.update(1/60, 0, 4, 0, false, false); expect(d.value).toBeGreaterThan(0.8); });
  ```
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Extract the six modules from `src/main.ts` and wire imports back.
- [ ] **Step 4: Verify** — `npm test && npm run build`; `grep -rnE "document\.|window\.|graphics/|visuals/" src/gameplay` → no output. Quick browser check: seeded level 1-2 plays identically (movement, shooting, enemy AI).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: extract gameplay simulation (enemies, world, player, time-scale, replay)"`

---

### Task 10: Extract `visuals/` modules

**Files:**
- Create: `src/visuals/visual-rng.ts`, `themes.ts`, `level-mesh.ts`, `mesh-library.ts`, `enemy-pose.ts`, `fx-system.ts`, `viewmodel.ts`
- Modify: `src/main.ts` (remove extracted blocks, import them)

**Interfaces:**
- Produces: `visualRng` (singleton, seed `12648430`, imported by `mesh-library.ts` and `fx-system.ts` — must not be instantiated twice), `THEMES`, `buildLevelMesh`, `buildMeshLibrary`, `PART_IDS`, `createPose`, `computePose`, `class FxSystem`, `class Viewmodel`.

- [ ] **Step 1:** Extract from `src/main.ts` using the strangler-fig recipe.
- [ ] **Step 2: Verify** — `npm test && npm run build`; `grep -rn "new Rng(12648430)" src | wc -l` → `1`. Quick browser check: level geometry, enemy glass/pose, viewmodel hands, and shatter FX look identical.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "refactor: extract visuals (themes, meshes, pose, fx, viewmodel)"`

---

### Task 11: Extract `ui/` and `persistence/` modules

**Files:**
- Create: `src/ui/ui.ts`, `format.ts`, `debug-overlay.ts`, `unsupported-panel.ts`, `src/persistence/save.ts`, `src/persistence/save.test.ts`
- Modify: `src/main.ts` (remove extracted blocks, import them)

**Interfaces:**
- Produces: `class Ui`, `fmtTime`, `class DebugOverlay`, `showUnsupported`, `loadSave`, `writeSave`, `defaultSettings`, `type SaveData`, `type Settings`.

- [ ] **Step 1: Write the failing test** `src/persistence/save.test.ts` (stub `globalThis.localStorage` with a `Map`-backed mock in `beforeEach`):
  ```ts
  test("no save → fresh defaults", () => expect(loadSave()).toEqual({ version: 1, settings: defaultSettings(), levels: {} }));
  test("wrong version → fresh", () => { localStorage.setItem("stillframe.save", JSON.stringify({ version: 2 })); expect(loadSave().levels).toEqual({}); });
  test("partial settings are merged with defaults", () => {
    localStorage.setItem("stillframe.save", JSON.stringify({ version: 1, settings: { fov: 100 }, levels: { "1-1": { cleared: true } } }));
    const s = loadSave(); expect(s.settings.fov).toBe(100); expect(s.settings.sensitivity).toBe(1); expect(s.levels["1-1"].cleared).toBe(true);
  });
  test("corrupt JSON → fresh", () => { localStorage.setItem("stillframe.save", "{"); expect(loadSave().version).toBe(1); });
  test("fmtTime formats m:ss.cc", () => expect(fmtTime(75.5)).toBe("1:15.50"));
  ```
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Extract from `src/main.ts` and wire imports back.
- [ ] **Step 4: Verify** — `npm test && npm run build`. Quick browser check: menus, settings persistence, HUD, and preserved PLAY bug behave identically.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "refactor: extract UI and persistence modules"`

---

### Task 12: Extract `app/game.ts`, finalize `src/main.ts`, and run full side-by-side parity check

**Files:**
- Create: `src/app/game.ts` (`class Game` + `BASE_SENSITIVITY`, `ENEMY_TINT`, `ENEMY_EMISSIVE`, `SHOT_SFX`, `IDENTITY`, `WHITE3`, `CORE`, `TRAIL_*`)
- Modify: `src/main.ts` — now contains only `import "./styles/main.css"`, imports of `Gfx`, `UnsupportedError`, `showUnsupported`, `Game`, and `boot()` (~30 lines).

- [ ] **Step 1:** Extract `Game` into `src/app/game.ts`, leaving `src/main.ts` as the clean entry point.
- [ ] **Step 2: Verify build & tests** — `npm test && npm run build`. Expected: all tests green, clean build, `dist/assets/*.js.map` present.
- [ ] **Step 3: Full side-by-side parity check (manual).** Launch F5 **Dev** (`localhost:5173`) and open `legacy/Lab05-Testing-Index.html` in a second tab (`python3 -m http.server 8000` inside `legacy/` if needed). Check both tabs:
  - [ ] Title screen renders the slowly orbiting level; same console output.
  - [ ] PLAY does **not** start the game in either tab (preserved bug in `BUGS.md`).
  - [ ] Seed `stillframe.save` with `{"version":1,"settings":{},"levels":{"1-1":{"cleared":true}}}`, reload. PLAY/CONTINUE starts 1-2 in both; intro words, HUD, time-slow desaturation, gunfire SFX, enemy shatter, and pause menu behave the same.
  - [ ] Settings changes persist after reload in both.
  - [ ] Launch F5 **Production** (`localhost:4173`): same checks pass.
  - [ ] A breakpoint in `src/gameplay/time-scale-driver.ts` `update()` binds solid red and hits in **both** Dev and Production F5 launch configs.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "refactor: extract Game orchestrator; finalize thin main.ts entry"`

---

### Task 13: Guard rails (ESLint layer boundaries, Prettier, `README.md`)

**Files:**
- Create: `eslint.config.js`, `.prettierrc.json`, `.prettierignore` (`dist`, `legacy`, `*.wgsl`), `README.md`
- Modify: `package.json` (scripts `lint` = `eslint .`, `format` = `prettier --write .`)

- [ ] **Step 1:** `npm i -D eslint @eslint/js typescript-eslint globals prettier`. Configure `eslint.config.js` with `typescript-eslint` recommended (`no-explicit-any` and `no-unused-vars` as `warn` while TS is non-strict), ignoring `dist/` and `legacy/`, plus one `no-restricted-imports` rule per folder enforcing the "Allowed dependencies" table.
- [ ] **Step 2: Verify the boundary rule bites** — temporarily add `import "../graphics/gfx";` to `src/gameplay/world.ts`, run `npm run lint`. Expected: `no-restricted-imports` error. Remove it, re-run `npm run lint`. Expected: 0 errors.
- [ ] **Step 3:** Run `npm run format` once and commit formatting in its own commit (`style: apply prettier`) so formatting diffs never mix with logic.
- [ ] **Step 4:** Write `README.md`: prerequisites (Node 22, WebGPU browser), `npm ci`, F5 Dev vs Production instructions, npm scripts table, short folder tour, how to add a level, how to edit a shader.
- [ ] **Step 5: Verify** — `npm run lint && npm test && npm run build`. Expected: all pass.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: add ESLint dependency boundaries, Prettier, and README"`

---

### Task 14: Write `PART2.md`

Deliverable requested for the end of the implementation.

**Files:**
- Create: `PART2.md` (repo root, alongside `PART1.md` and `BUGS.md`)

- [ ] **Step 1:** Write `PART2.md` covering:
  1. **Overview of the new project layout** — annotated directory tree linking to the real `src/` folders.
  2. **Why it was split this way** — rationale for each top-level boundary (`engine` vs `gameplay` vs `graphics` vs `visuals` vs `audio` vs `levels` vs `ui`/`persistence` vs `app`), why responsibility beats technical-layer folders for a team, and the dependency diagram / ESLint-enforced rules.
  3. **Shaders, dependencies, and tooling** — how `.wgsl` files are imported with `?raw` and tested, replacing the jsDelivr CDN import with `wgpu-matrix` 3.4.2, and how Vite + sourcemaps + `.vscode/launch.json` enable F5 dev/prod debugging with TypeScript breakpoints.
  4. **How behaviour parity was preserved** — summary of the strangler-fig steps, characterization tests, manual parity checks, and a link to [BUGS.md](BUGS.md) for the bugs intentionally left unfixed.
- [ ] **Step 2: Verify** — Check all relative links in `PART2.md` point to existing files; run `npm run lint && npm test && npm run build` one last time.
- [ ] **Step 3: Commit** — `git add PART2.md && git commit -m "docs: add PART2.md explaining module structure and rationale"`

---

### Task 15 (optional follow-up, parallelisable per folder): naming cleanup and strict TypeScript

Only after `PART2.md` is done and parity is confirmed. Still zero behaviour changes.

- [ ] **Step 1:** Rename bundler-suffixed identifiers (`GRAVITY` → `ENEMY_GRAVITY`, `GRAVITY2` → `PROP_GRAVITY`, `GRAVITY3` → `PLAYER_GRAVITY`, `MAX_PITCH2` → `PLAYER_MAX_PITCH`, `WHITE2` → `PALETTE_WHITE`, `WHITE3` → `TINT_WHITE`, `CELL2` → `NAV_CELL`, `GLOVE2` → `GLOVE_TINT`, `lerp2` → `lerpScalar`) using IDE rename (F2). Verify `npm test && npm run build`; commit.
- [ ] **Step 2:** Enable `"strict": true` incrementally per folder (`engine` → `levels` → `persistence` → `gameplay` → `graphics` → `audio` → `visuals` → `ui` → `app`) via a `tsconfig.strict.json` that expands one folder per PR, running `npm run lint && npm test && npm run build` and a parity spot-check on each.
