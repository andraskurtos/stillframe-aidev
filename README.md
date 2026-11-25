# STILLFRAME

A first-person WebGPU action-puzzle game where time moves only when you move.

## Prerequisites

- **Node.js** 22 LTS (see `.nvmrc`; `>=20.19` supported)
- A browser with **WebGPU** enabled (recent Chrome, Edge, Safari, or Firefox with WebGPU)

## Getting Started

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Debugging with F5 (VS Code / Antigravity IDE)

Two launch configurations are provided in `.vscode/launch.json`:

1. **Dev (Vite + Chrome)** — starts the Vite dev server on `http://localhost:5173`, launches Chrome with WebGPU flags, and attaches source-mapped TypeScript breakpoints. Stopping the debugger stops the dev server automatically.
2. **Production (build + preview + Chrome)** — runs `tsc --noEmit && vite build`, serves `dist/` via `vite preview` on `http://localhost:4173`, and launches Chrome with sourcemaps enabled so breakpoints in `.ts` files still bind.

Select the desired configuration in the **Run and Debug** panel and press **F5**.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server on `localhost:5173` |
| `npm run build` | Typecheck (`tsc --noEmit`) and build production bundle + sourcemaps into `dist/` |
| `npm run preview` | Serve the production build on `localhost:4173` |
| `npm run typecheck` | Run TypeScript type checking without emitting files |
| `npm test` | Run unit tests once with Vitest |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint (including module boundary checks) |
| `npm run format` | Format source files with Prettier |

## Folder Tour

- `src/main.ts` — Thin entry point (`boot()`).
- `src/app/` — Top-level `Game` orchestrator and game state machine.
- `src/engine/` — Game-agnostic math, RNG, fixed-step time, `requestAnimationFrame` loop, input, camera.
- `src/graphics/` — WebGPU device bootstrap, meshes, multi-pass renderer, and standalone `.wgsl` shaders (`src/graphics/shaders/`).
- `src/audio/` — Procedural Web Audio engine and sound synthesizers.
- `src/levels/` — Declarative level builder and the 15 levels grouped by act.
- `src/gameplay/` — Headless game simulation: physics, nav grid, items, enemy AI, `World`, `PlayerController`, `TimeScaleDriver`, replay.
- `src/visuals/` — Game-specific procedural meshes, themes, enemy poses, particle/shard FX, viewmodel.
- `src/ui/` — DOM menus, HUD, title cards, debug overlay, WebGPU unsupported panel.
- `src/persistence/` — `localStorage` save/settings serialization.
- `legacy/` — Original monolithic `Lab05-Testing-Index.html` preserved untouched for reference and parity checks.

## Common Tasks

- **Add a level:** Define a new `level(...)` in `src/levels/act1-transit.ts`, `act2-office-tower.ts`, or `act3-rooftops.ts`, and include it in that act's exported array (which feeds `LEVELS` in `src/levels/index.ts`).
- **Edit a shader:** Edit any `.wgsl` file under `src/graphics/shaders/`. Vite imports them via `?raw` and reloads the page on save.

## Documentation

- [PART1.md](PART1.md) — Initial analysis of the legacy codebase.
- [PART2.md](PART2.md) — Module structure and architectural rationale.
- [BUGS.md](BUGS.md) — Known bugs preserved untouched during the restructure.
