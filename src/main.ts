import "./styles/main.css";
import { mat4, vec3 } from "wgpu-matrix";
import { THEMES } from "./visuals/themes";
import { buildLevelMesh } from "./visuals/level-mesh";
import { PART_IDS, buildMeshLibrary } from "./visuals/mesh-library";
import { FxSystem } from "./visuals/fx-system";
import { Viewmodel } from "./visuals/viewmodel";
import { createPose, computePose } from "./visuals/enemy-pose";
import { enemyIsTwoHanded } from "./gameplay/enemies/enemy";
import { World } from "./gameplay/world";
import { PlayerController, WALK_SPEED } from "./gameplay/player-controller";
import { TimeScaleDriver } from "./gameplay/time-scale-driver";
import { ReplayRecorder, ReplayPlayer } from "./gameplay/replay";
import { StaticWorld } from "./gameplay/physics/static-world";
import { segmentSphere, segmentCapsule } from "./gameplay/physics/intersect";
import { NavGrid } from "./gameplay/navigation/nav-grid";
import {
  BULLET_SPEED, BULLET_RADIUS, BULLET_LIFE, WEAPONS, isWeapon, isGun,
  newItem, ITEM_NAMES, ITEM_RADIUS, FRAGILE,
} from "./gameplay/items";
import {
  EYE_HEIGHT, PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_BODY_A, PLAYER_BODY_B,
  PLAYER_BODY_R, REACH, PROP_PHYS_RADIUS, GRAVITY2, THROW_SPEED,
  PUNCH_COOLDOWN, PUNCH_RANGE, SLASH_RANGE, SHOT_HEARING, REST_ROT,
} from "./gameplay/constants";
import { LEVELS, ACT_NAMES } from "./levels";
import { AudioEngine } from "./audio/audio-engine";
import { Gfx, UnsupportedError } from "./graphics/gfx";
import { Mesh, VERTEX_FLOATS, VERTEX_STRIDE, STATIC_VERTEX_LAYOUT, createBufferWithData } from "./graphics/mesh";
import { srgbHex } from "./graphics/color";
import { MeshBuilder } from "./graphics/mesh-builder";
import { Renderer, defaultPostParams, WHITE } from "./graphics/renderer";
import { Camera, MAX_PITCH } from "./engine/camera";
import { Input, DEFAULT_BINDINGS } from "./engine/input";
import { Time, FIXED_STEP, MAX_REAL_DT, MAX_STEPS_PER_FRAME } from "./engine/time";
import { Loop } from "./engine/loop";
import {
  v3, set, copy, scale, lerp, dot, lenSq, len, distSq, distXZ,
  normalize, clamp, lerpN, approach, angleDiff, lerpAngle, turnToward,
  yawOf, dirFromYawPitch,
} from "./engine/math";
import { Rng } from "./engine/rng";

function showUnsupported(reason) {
  const panel = document.getElementById("unsupported");
  const reasonEl = document.getElementById("unsupported-reason");
  if (reasonEl)
    reasonEl.textContent = reason;
  if (panel)
    panel.hidden = false;
}

var fmtTime = (s) => {
  const m2 = Math.floor(s / 60);
  const sec = s - m2 * 60;
  return `${m2}:${sec.toFixed(2).padStart(5, "0")}`;
};
var Ui = class {
  handlers;
  save;
  levels;
  root;
  screenEl;
  hudEl;
  cardEl;
  crosshair;
  ammoEl;
  itemEl;
  hintEl;
  infoEl;
  lockEl;
  screen = "none";
  settingsReturn = "title";
  cardTimer = 0;
  cardWords = [];
  cardIndex = 0;
  cardWordTime = 0.32;
  cardOnDone = null;
  lastAmmoKey = "";
  constructor(handlers, save, levels) {
    this.handlers = handlers;
    this.save = save;
    this.levels = levels;
    const root = document.createElement("div");
    root.id = "ui";
    document.body.appendChild(root);
    this.root = root;
    root.innerHTML = `
      <div class="hud" hidden>
        <div class="crosshair"><span></span></div>
        <div class="hud-info"></div>
        <div class="hud-item"></div>
        <div class="hud-ammo"></div>
        <div class="hud-hint"></div>
      </div>
      <div class="card" hidden></div>
      <div class="lock-hint" hidden>CLICK TO CONTINUE</div>
      <div class="screen" hidden></div>`;
    this.hudEl = root.querySelector(".hud");
    this.crosshair = root.querySelector(".crosshair");
    this.ammoEl = root.querySelector(".hud-ammo");
    this.itemEl = root.querySelector(".hud-item");
    this.hintEl = root.querySelector(".hud-hint");
    this.infoEl = root.querySelector(".hud-info");
    this.cardEl = root.querySelector(".card");
    this.screenEl = root.querySelector(".screen");
    this.lockEl = root.querySelector(".lock-hint");
  }
  setSave(save) {
    this.save = save;
  }
  get currentScreen() {
    return this.screen;
  }
  get blocking() {
    return this.screen !== "none" && this.screen !== "replay";
  }
  showLockHint(show) {
    this.lockEl.hidden = !show;
  }
  titleCard(words, wordTime = 0.32, onDone) {
    this.cardWords = words;
    this.cardIndex = 0;
    this.cardTimer = 0;
    this.cardWordTime = wordTime;
    this.cardOnDone = onDone ?? null;
    this.cardEl.hidden = words.length === 0;
    this.renderCardWord();
  }
  get cardActive() {
    return !this.cardEl.hidden;
  }
  hideCard() {
    this.cardEl.hidden = true;
    this.cardWords = [];
    this.cardOnDone = null;
  }
  renderCardWord() {
    const w = this.cardWords[this.cardIndex];
    if (w === void 0)
      return;
    this.cardEl.textContent = w;
    this.cardEl.classList.toggle("alt", this.cardIndex % 2 === 1);
    this.cardEl.classList.remove("pop");
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add("pop");
  }
  update(realDt) {
    if (this.cardEl.hidden || this.cardWords.length === 0)
      return;
    this.cardTimer += realDt;
    if (this.cardTimer >= this.cardWordTime) {
      this.cardTimer = 0;
      this.cardIndex++;
      if (this.cardIndex >= this.cardWords.length) {
        this.cardEl.hidden = true;
        const cb = this.cardOnDone;
        this.cardOnDone = null;
        this.cardWords = [];
        cb?.();
        return;
      }
      this.renderCardWord();
    }
  }
  updateHud(h) {
    this.hudEl.hidden = !h.visible;
    if (!h.visible)
      return;
    const s = (0.6 + 0.6 * (1 - h.timeScale)) * h.crosshairScale;
    this.crosshair.style.transform = `translate(-50%, -50%) scale(${s.toFixed(3)}) rotate(${(h.timeScale * 45).toFixed(1)}deg)`;
    this.crosshair.style.opacity = (0.55 + 0.45 * (1 - h.timeScale)).toFixed(2);
    this.itemEl.textContent = h.itemName ?? "";
    const key = `${h.ammo}/${h.maxAmmo}`;
    if (key !== this.lastAmmoKey) {
      this.lastAmmoKey = key;
      this.ammoEl.innerHTML = "";
      for (let i = 0; i < h.maxAmmo; i++) {
        const tick = document.createElement("i");
        if (i >= h.ammo)
          tick.className = "spent";
        this.ammoEl.appendChild(tick);
      }
    }
    this.hintEl.textContent = h.hint ?? "";
    this.infoEl.textContent = `${h.levelName}   ${h.remaining > 0 ? `${h.remaining} LEFT` : ""}`;
  }
  hideScreen() {
    this.screen = "none";
    this.screenEl.hidden = true;
    this.screenEl.innerHTML = "";
  }
  showTitle() {
    this.screen = "title";
    const next = this.firstUnclearedIndex();
    this.screenEl.hidden = false;
    this.screenEl.className = "screen title";
    this.screenEl.innerHTML = `
      <h1 class="logo">STILL<span>FRAME</span></h1>
      <p class="tagline">time moves only when you move</p>
      <div class="menu">
        <button data-act="play">${next > 0 ? "CONTINUE" : "PLAY"}</button>
        <button data-act="levels">LEVELS</button>
        <button data-act="settings">SETTINGS</button>
      </div>
      <div class="controls">
        <span><b>WASD</b> move</span><span><b>MOUSE</b> look</span><span><b>LMB</b> fire / punch / throw</span>
        <span><b>RMB</b> throw</span><span><b>E</b> pick up</span><span><b>SPACE</b> jump</span><span><b>R</b> restart</span><span><b>ESC</b> pause</span>
      </div>`;
    this.bind({
      play: () => this.handlers.onPlayLevel(next),
      levels: () => this.showLevels(),
      settings: () => this.showSettings("title")
    });
  }
  showLevels() {
    this.screen = "levels";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen levels";
    const acts = [];
    for (const act of [1, 2, 3]) {
      const items = this.levels.map((l, i) => ({ l, i })).filter(({ l }) => l.act === act).map(({ l, i }) => {
        const unlocked = this.isUnlocked(i);
        const rec = this.save.levels[l.id];
        const best = rec?.best !== void 0 ? fmtTime(rec.best) : unlocked ? "—" : "LOCKED";
        return `<button data-level="${i}" ${unlocked ? "" : "disabled"} class="${rec?.cleared ? "cleared" : ""}">
            <em>${l.id}</em><strong>${l.name}</strong><small>${best}</small></button>`;
      }).join("");
      acts.push(`<section><h2>ACT ${act} · ${ACT_NAMES[act]}</h2><div class="grid">${items}</div></section>`);
    }
    this.screenEl.innerHTML = `<h1 class="heading">LEVELS</h1>${acts.join("")}<div class="menu"><button data-act="back">BACK</button></div>`;
    this.screenEl.querySelectorAll("button[data-level]").forEach((b) => {
      b.addEventListener("click", () => {
        this.handlers.onUiSound();
        this.handlers.onPlayLevel(Number(b.dataset.level));
      });
    });
    this.bind({ back: () => this.showTitle() });
  }
  showSettings(returnTo) {
    this.settingsReturn = returnTo;
    this.screen = "settings";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen settings";
    const s = this.save.settings;
    const range = (key, label, min, max, step, fmt) => `<label><span>${label}</span><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${fmt(s[key])}</output></label>`;
    const check = (key, label) => `<label class="check"><span>${label}</span><input type="checkbox" data-key="${key}" ${s[key] ? "checked" : ""}></label>`;
    const pct = (v) => `${Math.round(v * 100)}%`;
    this.screenEl.innerHTML = `
      <h1 class="heading">SETTINGS</h1>
      <div class="form">
        ${range("fov", "Field of view", 70, 110, 1, (v) => `${v}°`)}
        ${range("sensitivity", "Mouse sensitivity", 0.2, 3, 0.05, (v) => v.toFixed(2))}
        ${check("invertY", "Invert Y")}
        ${range("masterVolume", "Master volume", 0, 1, 0.05, pct)}
        ${range("sfxVolume", "Effects volume", 0, 1, 0.05, pct)}
        ${range("musicVolume", "Music volume", 0, 1, 0.05, pct)}
        ${range("resolutionScale", "Resolution scale", 0.5, 1, 0.05, pct)}
        ${check("autoResolution", "Automatic resolution")}
        <label><span>Post effects</span><select data-key="postQuality">
          ${["low", "medium", "high"].map((q) => `<option value="${q}" ${s.postQuality === q ? "selected" : ""}>${q.toUpperCase()}</option>`).join("")}
        </select></label>
        ${range("crosshairScale", "Crosshair size", 0.5, 2, 0.05, pct)}
        ${check("reduceMotion", "Reduce motion (no aberration, grain, bob)")}
        ${check("showFps", "Show FPS")}
      </div>
      <div class="menu"><button data-act="back">BACK</button></div>`;
    const apply = () => this.handlers.onSettingsChanged({ ...this.save.settings });
    this.screenEl.querySelectorAll("input[type=range]").forEach((el) => {
      el.addEventListener("input", () => {
        const key = el.dataset.key;
        const v = Number(el.value);
        this.save.settings[key] = v;
        const out = el.nextElementSibling;
        if (out)
          out.textContent = key === "fov" ? `${v}°` : key === "sensitivity" ? v.toFixed(2) : pct(v);
        apply();
      });
    });
    this.screenEl.querySelectorAll("input[type=checkbox]").forEach((el) => {
      el.addEventListener("change", () => {
        this.save.settings[el.dataset.key] = el.checked;
        apply();
      });
    });
    this.screenEl.querySelectorAll("select").forEach((el) => {
      el.addEventListener("change", () => {
        this.save.settings[el.dataset.key] = el.value;
        apply();
      });
    });
    this.bind({
      back: () => {
        if (this.settingsReturn === "pause")
          this.showPause();
        else
          this.showTitle();
      }
    });
  }
  showPause() {
    this.screen = "pause";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen pause";
    this.screenEl.innerHTML = `
      <h1 class="heading">PAUSED</h1>
      <div class="menu">
        <button data-act="resume">RESUME</button>
        <button data-act="restart">RESTART</button>
        <button data-act="settings">SETTINGS</button>
        <button data-act="menu">MAIN MENU</button>
      </div>`;
    this.bind({
      resume: () => this.handlers.onResume(),
      restart: () => this.handlers.onRestart(),
      settings: () => this.showSettings("pause"),
      menu: () => this.handlers.onMenu()
    });
  }
  showResults(r) {
    this.screen = "results";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen results";
    const acc = r.shots > 0 ? `${Math.round(Math.min(r.kills, r.shots) / r.shots * 100)}%` : "—";
    this.screenEl.innerHTML = `
      <h1 class="heading">${r.level.name}<small>CLEARED</small></h1>
      <table class="stats">
        <tr><th>REAL TIME</th><td>${fmtTime(r.realTime)}${r.newBest ? " <b>NEW BEST</b>" : ""}</td></tr>
        <tr><th>BEST</th><td>${r.best !== void 0 ? fmtTime(r.best) : "—"}</td></tr>
        <tr><th>TIME THAT PASSED</th><td>${fmtTime(r.simTime)}</td></tr>
        <tr><th>KILLS</th><td>${r.kills}</td></tr>
        <tr><th>SHOTS</th><td>${r.shots} <small>(${acc})</small></td></tr>
      </table>
      <div class="menu">
        ${r.hasNext ? '<button data-act="next">NEXT LEVEL</button>' : '<button data-act="menu">THE END</button>'}
        <button data-act="replay">WATCH REPLAY</button>
        <button data-act="retry">RETRY</button>
        ${r.hasNext ? '<button data-act="menu">MAIN MENU</button>' : ""}
      </div>`;
    this.bind({
      next: () => this.handlers.onNext(),
      replay: () => this.handlers.onReplay(),
      retry: () => this.handlers.onRestart(),
      menu: () => this.handlers.onMenu()
    });
  }
  showReplayBar() {
    this.screen = "replay";
    this.screenEl.hidden = false;
    this.screenEl.className = "screen replay";
    this.screenEl.innerHTML = `<div class="replay-label">REPLAY <span>REAL TIME</span></div><div class="replay-skip">click or press any key to skip</div><div class="replay-progress"><i></i></div>`;
    this.screenEl.addEventListener("click", this.skipReplay, { once: true });
  }
  setReplayProgress(p) {
    const bar = this.screenEl.querySelector(".replay-progress i");
    if (bar)
      bar.style.width = `${(p * 100).toFixed(1)}%`;
  }
  skipReplay = () => {
    if (this.screen === "replay")
      this.handlers.onSkipReplay();
  };
  bind(actions) {
    this.screenEl.querySelectorAll("button[data-act]").forEach((b) => {
      const fn = actions[b.dataset.act];
      if (!fn)
        return;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.handlers.onUiSound();
        fn();
      });
    });
  }
  isUnlocked(index) {
    if (index < 0)
      return true;
    const prev = this.levels[index - 1];
    return !!prev && !!this.save.levels[prev.id]?.cleared;
  }
  firstUnclearedIndex() {
    for (let i = 0; i < this.levels.length; i++) {
      if (!this.save.levels[this.levels[i].id]?.cleared)
        return i;
    }
    return 0;
  }
  get rootElement() {
    return this.root;
  }
};

var KEY = "stillframe.save";
function defaultSettings() {
  return {
    fov: 90,
    sensitivity: 1,
    invertY: false,
    masterVolume: 0.8,
    sfxVolume: 1,
    musicVolume: 0.5,
    resolutionScale: 1,
    autoResolution: true,
    postQuality: "high",
    showFps: false,
    reduceMotion: false,
    crosshairScale: 1
  };
}
function loadSave() {
  const fresh = { version: 1, settings: defaultSettings(), levels: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw)
      return fresh;
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1)
      return fresh;
    return {
      version: 1,
      settings: { ...defaultSettings(), ...parsed.settings ?? {} },
      levels: parsed.levels ?? {}
    };
  } catch (err) {
    console.warn("[save] could not read save data:", err);
    return fresh;
  }
}
function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[save] could not write save data:", err);
  }
}

var DebugOverlay = class {
  el;
  visible = true;
  frames = 0;
  accum = 0;
  fps = 0;
  frameMs = 0;
  extra = {};
  constructor(el) {
    this.el = el;
  }
  set(key, value) {
    this.extra[key] = value;
  }
  update(time) {
    this.frames++;
    this.accum += time.realDt;
    if (this.accum < 0.25)
      return;
    this.fps = this.frames / this.accum;
    this.frameMs = this.accum / this.frames * 1e3;
    this.frames = 0;
    this.accum = 0;
    if (!this.visible) {
      this.el.textContent = "";
      return;
    }
    const lines = [
      `fps ${this.fps.toFixed(0)}  (${this.frameMs.toFixed(2)} ms)`,
      `timeScale ${time.effectiveScale().toFixed(3)}  lock ${time.lock}`,
      `sim steps/frame ${time.stepsThisFrame}  simTime ${time.simTime.toFixed(2)}s`,
      ...Object.entries(this.extra).map(([k, v]) => `${k} ${v}`)
    ];
    this.el.textContent = lines.join("\n");
  }
};

var BASE_SENSITIVITY = 22e-4;
var ENEMY_TINT = {
  walker: [0.8, 0.32, 1],
  rusher: [1, 0.26, 0.48],
  marksman: [0.42, 0.48, 1]
};
var ENEMY_EMISSIVE = { walker: 0.9, rusher: 1.1, marksman: 1 };
var SHOT_SFX = { pistol: "pistol", scatter: "scatter", carbine: "carbine", blade: "whoosh" };
var Game = class {
  gfx;
  renderer;
  input;
  audio = new AudioEngine();
  ui;
  overlay;
  loop;
  meshes;
  save;
  camera = new Camera();
  vmCamera = new Camera();
  player = new PlayerController();
  driver = new TimeScaleDriver();
  recorder = new ReplayRecorder();
  fx = new FxSystem();
  viewmodel = new Viewmodel();
  pose = createPose();
  model = mat4.create();
  post = defaultPostParams();
  state = "title";
  stateTime = 0;
  levelIndex = 0;
  def = LEVELS[0];
  scene = null;
  shared = null;
  sceneCache = new Map();
  world;
  replay = null;
  runRealTime = 0;
  flash = [1, 1, 1, 0];
  threat = 0;
  deathDir = [0, 0, -1];
  telegraphing = new Set();
  lastResults = null;
  debugOverlayForced = false;
  perfAccum = 0;
  perfFrames = 0;
  autoScale = 1;
  constructor(gfx, canvas, overlayEl) {
    this.gfx = gfx;
    this.renderer = new Renderer(gfx);
    this.input = new Input(canvas);
    this.overlay = new DebugOverlay(overlayEl);
    this.meshes = buildMeshLibrary(gfx.device);
    this.save = loadSave();
    this.ui = new Ui({
      onPlayLevel: (i) => this.startLevel(i, true),
      onResume: () => this.resume(),
      onRestart: () => this.restart(true),
      onMenu: () => this.toMenu(),
      onNext: () => this.startLevel(Math.min(LEVELS.length - 1, this.levelIndex + 1), true),
      onReplay: () => this.startReplay(),
      onSkipReplay: () => this.endReplay(),
      onSettingsChanged: (s) => this.applySettings(s),
      onUiSound: () => {
        this.audio.unlock();
        this.audio.play("ui", { ignoreTime: true });
      }
    }, this.save, LEVELS);
    this.applySettings(this.save.settings);
    const applyAspect = () => {
      this.camera.aspect = gfx.aspect;
      this.camera.setHorizontalFov(this.save.settings.fov);
      this.vmCamera.aspect = gfx.aspect;
      this.vmCamera.fovYDeg = 54;
    };
    applyAspect();
    gfx.onResize(applyAspect);
    this.vmCamera.near = this.camera.near;
    this.vmCamera.far = this.camera.far;
    document.addEventListener("pointerlockchange", () => {
      if (!this.input.pointerLocked && (this.state === "playing" || this.state === "intro"))
        this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && (this.state === "playing" || this.state === "intro"))
        this.pause();
    });
    window.addEventListener("pointerdown", () => this.audio.unlock(), { capture: true });
    window.addEventListener("keydown", () => this.audio.unlock(), { capture: true });
    this.loadLevel(this.firstUncleared());
    this.toMenu();
    this.loop = new Loop({
      frame: (t) => this.frame(t),
      fixedStep: () => this.fixedStep(),
      render: (t) => this.render(t)
    });
  }
  start() {
    this.loop.start();
  }
  stop() {
    this.loop.stop();
  }
  firstUncleared() {
    const i = LEVELS.findIndex((l) => !this.save.levels[l.id]?.cleared);
    return i < 0 ? 0 : i;
  }
  loadLevel(index) {
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);
    this.def = LEVELS[this.levelIndex];
    let cached = this.sceneCache.get(this.def.id);
    if (!cached) {
      const t0 = performance.now();
      const { scene, shared } = buildLevelMesh(this.gfx.device, this.def);
      cached = { scene, shared };
      this.sceneCache.set(this.def.id, cached);
      console.info(`[game] built level ${this.def.id} in ${(performance.now() - t0).toFixed(1)} ms (${this.def.boxes.length} boxes)`);
    }
    this.scene = cached.scene;
    this.shared = cached.shared;
    const theme = THEMES[this.def.theme];
    this.renderer.lighting = theme.lighting;
    this.renderer.setShadowBounds(this.scene.min, this.scene.max);
    this.resetWorld();
  }
  resetWorld() {
    this.world = new World(this.def, this.shared ?? void 0);
    this.shared = this.world.staticData;
    this.player.reset(this.def.player.pos, this.def.player.yaw);
    this.driver.reset();
    this.recorder.reset();
    this.fx.clear();
    this.telegraphing.clear();
    this.runRealTime = 0;
    this.flash = [1, 1, 1, 0];
    this.replay = null;
  }
  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }
  startLevel(index, lock) {
    if (!this.ui.isUnlocked(index))
      return;
    this.audio.unlock();
    if (lock)
      this.input.requestPointerLock();
    this.loadLevel(index);
    this.ui.hideScreen();
    this.beginIntro(this.def.words, 0.34);
  }
  beginIntro(words, wordTime) {
    this.setState("intro");
    this.ui.titleCard(words, wordTime, () => {
      if (this.state === "intro")
        this.beginPlaying();
    });
  }
  beginPlaying() {
    this.setState("playing");
    this.loop.time.clearAccumulator();
    this.recorder.reset();
    this.runRealTime = 0;
  }
  restart(lock) {
    if (lock)
      this.input.requestPointerLock();
    this.ui.hideScreen();
    this.resetWorld();
    this.beginIntro([this.def.name], 0.45);
  }
  pause() {
    if (this.state !== "playing" && this.state !== "intro")
      return;
    this.ui.hideCard();
    this.setState("paused");
    this.ui.showPause();
  }
  resume() {
    this.input.requestPointerLock();
    this.ui.hideScreen();
    this.state = this.recorder.frames.length > 0 ? "playing" : "intro";
    this.stateTime = 0;
    if (this.state === "intro")
      this.beginIntro(["GO."], 0.3);
    this.loop.time.clearAccumulator();
  }
  toMenu() {
    this.ui.hideCard();
    this.replay = null;
    if (document.pointerLockElement)
      document.exitPointerLock();
    this.loadLevel(this.firstUncleared());
    this.setState("title");
    this.ui.showTitle();
  }
  enterDead() {
    this.setState("dead");
    this.flash = [1, 0.25, 0.3, 0.85];
    this.audio.play("death", { ignoreTime: true });
    this.ui.titleCard(["AGAIN."], 0.6);
  }
  enterCleared() {
    this.setState("cleared");
    this.lastResults = { real: this.runRealTime, sim: this.world.simTime, kills: this.world.stats.kills, shots: this.world.stats.shots };
    this.flash = [1, 1, 1, 0.5];
    this.audio.play("clear", { ignoreTime: true });
    this.ui.titleCard(["CLEAR.", "CLEAR.", "CLEAR."], 0.38, () => this.showResults());
  }
  showResults() {
    if (document.pointerLockElement)
      document.exitPointerLock();
    const r = this.lastResults ?? { real: 0, sim: 0, kills: 0, shots: 0 };
    const rec = this.save.levels[this.def.id] ?? { cleared: false };
    const newBest = rec.best === void 0 || r.real < rec.best;
    rec.cleared = true;
    if (newBest) {
      rec.best = r.real;
      rec.bestSim = r.sim;
    }
    this.save.levels[this.def.id] = rec;
    writeSave(this.save);
    this.setState("results");
    this.ui.showResults({
      level: this.def,
      realTime: r.real,
      simTime: r.sim,
      kills: r.kills,
      shots: r.shots,
      best: rec.best,
      newBest,
      hasNext: this.levelIndex < LEVELS.length - 1
    });
  }
  startReplay() {
    if (!this.shared || this.recorder.frames.length === 0)
      return;
    this.fx.clear();
    this.telegraphing.clear();
    this.replay = new ReplayPlayer(this.def, this.recorder.frames, this.shared);
    this.setState("replay");
    this.ui.showReplayBar();
  }
  endReplay() {
    if (this.state !== "replay")
      return;
    this.replay = null;
    this.fx.clear();
    this.showResults();
  }
  applySettings(s) {
    this.save.settings = s;
    this.ui.setSave(this.save);
    writeSave(this.save);
    this.camera.aspect = this.gfx.aspect;
    this.camera.setHorizontalFov(s.fov);
    this.renderer.quality = s.postQuality;
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
    this.autoScale = 1;
    this.gfx.setResolutionScale(s.resolutionScale);
  }
  frame(t) {
    const dt = t.realDt;
    const input = this.input;
    input.update(dt);
    this.stateTime += dt;
    this.ui.update(dt);
    if (input.wasPressed("debugTimeFreeze"))
      t.lock = t.lock === "frozen" ? "none" : "frozen";
    if (input.wasPressed("debugTimeRealtime"))
      t.lock = t.lock === "realtime" ? "none" : "realtime";
    if (input.wasPressed("debugOverlay"))
      this.debugOverlayForced = !this.debugOverlayForced;
    const look = { sensitivity: BASE_SENSITIVITY * this.save.settings.sensitivity, invertY: this.save.settings.invertY };
    const locked = input.pointerLocked;
    this.ui.showLockHint((this.state === "playing" || this.state === "intro") && !locked);
    switch (this.state) {
      case "title":
        t.timeScale = 0;
        break;
      case "intro":
        if (locked)
          this.player.look(input, dt, look);
        t.timeScale = 0;
        break;
      case "playing": {
        if (!locked) {
          t.timeScale = 0;
          break;
        }
        if (input.wasPressed("restart")) {
          this.restart(false);
          t.timeScale = 0;
          break;
        }
        this.player.update(input, dt, this.world, look, true);
        const f = this.player.toFrame(input.wasPressed("fire"), input.wasPressed("throw"), input.wasPressed("interact"));
        const acted = this.world.applyPlayerFrame(f);
        this.recorder.push(f);
        if (acted)
          this.driver.actionKick();
        const busy = this.world.player.burstLeft > 0;
        t.timeScale = this.driver.update(dt, WALK_SPEED, this.player.planarSpeed, this.player.lookSpeed, !this.player.grounded, busy);
        this.runRealTime += dt;
        break;
      }
      case "dead":
        t.timeScale = approach(t.timeScale, 0.04, 0.2, dt);
        if (this.stateTime > 0.35 && (input.wasPressed("restart") || input.wasPressed("fire")))
          this.restart(false);
        else if (this.stateTime > 1.4)
          this.restart(false);
        break;
      case "cleared":
        if (locked)
          this.player.look(input, dt, look);
        t.timeScale = approach(t.timeScale, 0.25, 0.3, dt);
        break;
      case "paused":
      case "results":
        t.timeScale = 0;
        break;
      case "replay":
        t.timeScale = 0;
        if (this.stateTime > 0.3 && input.anyPressed()) {
          this.endReplay();
          break;
        }
        if (this.replay) {
          this.replay.update(dt);
          this.ui.setReplayProgress(this.replay.progress);
          if (this.replay.done && this.stateTime > 0.5)
            this.endReplay();
        }
        break;
    }
  }
  fixedStep() {
    if (this.state === "playing" || this.state === "dead" || this.state === "cleared") {
      this.world.step(FIXED_STEP);
    }
  }
  render(t) {
    if (this.state === "playing")
      this.recorder.setLastSteps(t.stepsThisFrame);
    if (this.state === "playing" && this.world.failed)
      this.enterDead();
    else if (this.state === "playing" && this.world.cleared)
      this.enterCleared();
    const world = this.replay?.world ?? this.world;
    const inReplay = this.state === "replay" && !!this.replay;
    const ts = inReplay ? 1 : t.effectiveScale();
    const visualDt = inReplay ? t.realDt : t.simDt;
    this.handleEvents(world);
    this.fx.update(visualDt, world.static);
    this.updateAutoResolution(t.realDt);
    const eye = v3();
    let yaw;
    let pitch;
    if (inReplay && this.replay?.current) {
      const f = this.replay.current;
      eye[0] = f.pos[0];
      eye[1] = f.pos[1] + EYE_HEIGHT;
      eye[2] = f.pos[2];
      yaw = f.yaw;
      pitch = f.pitch;
    } else if (inReplay) {
      eye[0] = this.def.player.pos[0];
      eye[1] = this.def.player.pos[1] + EYE_HEIGHT;
      eye[2] = this.def.player.pos[2];
      yaw = this.def.player.yaw;
      pitch = 0;
    } else if (this.state === "title" || this.state === "results" && !this.lastResults) {
      const sc = this.scene;
      const cx = (sc.min[0] + sc.max[0]) / 2;
      const cz = (sc.min[2] + sc.max[2]) / 2;
      const r = Math.max(4, Math.min(sc.max[0] - sc.min[0], sc.max[2] - sc.min[2]) * 0.32);
      const a = t.realTime * 0.06;
      eye[0] = cx + Math.cos(a) * r;
      eye[1] = 2.4;
      eye[2] = cz + Math.sin(a) * r;
      yaw = Math.atan2(-(cx - eye[0]), -(cz - eye[2]));
      pitch = -0.12;
    } else {
      eye[0] = this.player.pos[0];
      eye[1] = this.player.pos[1] + EYE_HEIGHT;
      eye[2] = this.player.pos[2];
      yaw = this.player.yaw;
      pitch = this.player.pitch;
      if (this.state === "dead") {
        const k = Math.min(1, this.stateTime / 0.6);
        eye[1] -= k * 0.5;
        pitch = lerpN(pitch, -0.4, k * 0.5);
      }
    }
    const cam = this.camera;
    cam.position[0] = eye[0];
    cam.position[1] = eye[1];
    cam.position[2] = eye[2];
    cam.yaw = yaw;
    cam.pitch = pitch;
    cam.update();
    const vm = this.vmCamera;
    vm.position[0] = eye[0];
    vm.position[1] = eye[1];
    vm.position[2] = eye[2];
    vm.yaw = yaw;
    vm.pitch = pitch;
    vm.update();
    this.audio.setListener({ x: eye[0], y: eye[1], z: eye[2], yaw });
    this.audio.setTimeScale(this.state === "title" || this.state === "results" || this.state === "paused" ? 0.35 : ts);
    const alpha = inReplay ? 1 : t.alpha;
    this.drawWorld(world, alpha, ts, t.realTime);
    this.fx.draw(this.renderer, this.meshes);
    const showViewmodel = this.state === "playing" || this.state === "intro" || this.state === "cleared" || this.state === "paused" || inReplay;
    if (showViewmodel) {
      const pState = world.player;
      if (!inReplay)
        this.viewmodel.update(t.realDt, this.player.mouseDx, this.player.mouseDy, this.player.planarSpeed, this.player.grounded);
      const stride = inReplay ? this.replay?.current ? Math.hypot(this.replay.current.pos[0], this.replay.current.pos[2]) : 0 : this.player.stride;
      this.viewmodel.draw(this.renderer, this.meshes, eye, yaw, pitch, pState, stride, this.save.settings.reduceMotion);
    }
    this.updatePost(world, ts, t.realDt);
    this.renderer.render(cam, vm, this.post, t.realTime);
    this.updateHud(world, ts);
    const showFps = this.save.settings.showFps || this.debugOverlayForced;
    this.overlay.visible = showFps;
    if (showFps) {
      this.overlay.set("res", `${this.gfx.width}x${this.gfx.height} (${(this.gfx.getResolutionScale() * 100).toFixed(0)}%)`);
      this.overlay.set("draws", `${this.renderer.lastDrawCalls} calls, ${this.renderer.lastInstances} inst, ${this.renderer.lastSegments} fx`);
      this.overlay.set("world", `enemies ${world.enemies.length}  bullets ${world.projectiles.length}  props ${world.props.length}  shards ${this.fx.shardCount}`);
      this.overlay.set("state", this.state);
    }
    this.overlay.update(t);
  }
  drawWorld(world, alpha, ts, realTime) {
    const r = this.renderer;
    if (this.scene)
      r.drawMesh(this.scene.mesh, IDENTITY);
    const m2 = this.model;
    const tmp2 = v3();
    for (const pr of world.props) {
      lerp(tmp2, pr.prevPos, pr.pos, alpha);
      mat4.translation(tmp2, m2);
      mat4.rotateY(m2, lerpN(pr.prevRot[1], pr.rot[1], alpha), m2);
      mat4.rotateX(m2, lerpN(pr.prevRot[0], pr.rot[0], alpha), m2);
      mat4.rotateZ(m2, lerpN(pr.prevRot[2], pr.rot[2], alpha), m2);
      const highlight = world.aimProp === pr && this.state === "playing" ? 0.45 + 0.25 * Math.sin(realTime * 8) : 0;
      r.drawMesh(this.meshes.items[pr.item.kind], m2, WHITE3, 0.06, "opaque", 0, 1, highlight);
    }
    for (const e of world.enemies)
      this.drawEnemy(e, alpha);
    const trailLen = 0.6 + 5 * (1 - ts);
    const head = v3();
    const tail = v3();
    for (const b of world.projectiles) {
      lerp(head, b.prevPos, b.pos, alpha);
      const vx = b.vel[0], vy = b.vel[1], vz = b.vel[2];
      const vl = Math.hypot(vx, vy, vz) || 1;
      const traveled = Math.hypot(head[0] - b.spawnPos[0], head[1] - b.spawnPos[1], head[2] - b.spawnPos[2]);
      const l = Math.min(trailLen, traveled);
      tail[0] = head[0] - vx / vl * l;
      tail[1] = head[1] - vy / vl * l;
      tail[2] = head[2] - vz / vl * l;
      const enemyShot = b.ownerId !== 0;
      r.drawSegment(tail, head, 0.016, enemyShot ? TRAIL_ENEMY : TRAIL_PLAYER, 0, 1.2);
      r.drawSegment(head, head, 0.035, CORE, 1, 2);
    }
    const lasers = world.activeLasers();
    for (const l of lasers) {
      const hit = world.static.raycast(l.origin, l.dir, 60);
      const d = hit ? hit.t : 60;
      const end = [l.origin[0] + l.dir[0] * d, l.origin[1] + l.dir[1] * d, l.origin[2] + l.dir[2] * d];
      const k = l.progress;
      r.drawSegment(l.origin, end, 4e-3 + k * 8e-3, [0.9 * (1 + k * 6), 0.25 * (1 + k * 3), 1.6 * (1 + k * 6)], 1, 1.2);
    }
  }
  drawEnemy(e, alpha) {
    const p = this.pose;
    const pos = lerp(v3(), e.prevPos, e.pos, alpha);
    computePose({
      pos,
      yaw: lerpAngle(e.prevYaw, e.yaw, alpha),
      walkPhase: lerpN(e.prevWalkPhase, e.walkPhase, alpha),
      moveBlend: lerpN(e.prevMoveBlend, e.moveBlend, alpha),
      aimBlend: lerpN(e.prevAimBlend, e.aimBlend, alpha),
      aimPitch: e.aimPitch,
      attackT: e.meleeT > 0 ? lerpN(e.prevMeleeT, e.meleeT, alpha) : 0,
      stun: e.state === "stunned" ? 1 : 0,
      spawnT: lerpN(e.prevSpawnT, e.spawnT, alpha),
      twoHanded: enemyIsTwoHanded(e),
      kind: e.kind
    }, p);
    const tint = ENEMY_TINT[e.kind];
    const spawnT = lerpN(e.prevSpawnT, e.spawnT, alpha);
    const emissive = ENEMY_EMISSIVE[e.kind] + (1 - spawnT) * 3;
    const flash = Math.max(e.hitFlash, (1 - spawnT) * 0.5);
    for (const id of PART_IDS) {
      this.renderer.drawMesh(this.meshes.parts[id], p.parts[id], tint, emissive, "glass", flash, 0.25 + 0.75 * spawnT);
    }
    if (e.weapon)
      this.renderer.drawMesh(this.meshes.items[e.weapon.kind], p.weapon, WHITE3, 0.04, "opaque");
  }
  incomingThreat(world) {
    if (this.state !== "playing")
      return 0;
    const eye = world.playerEye(v3());
    let threat = 0;
    for (const b of world.projectiles) {
      if (!b.alive || b.ownerId === 0)
        continue;
      const d = Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]);
      threat = Math.max(threat, clamp(2 - d / 8, 0, 1));
    }
    for (const e of world.enemies) {
      if (e.alive && e.telegraph > 0)
        threat = 1;
    }
    return threat;
  }
  updatePost(world, ts, realDt) {
    const s = this.save.settings;
    const p = this.post;
    const reduce = s.reduceMotion;
    let freeze = 1 - ts;
    if (this.state === "title" || this.state === "results" || this.state === "paused")
      freeze = 0.6;
    if (this.state === "replay")
      freeze = 0;
    p.freeze = freeze;
    p.desaturation = this.state === "replay" ? 0.25 : freeze * 0.7;
    p.aberration = reduce ? 0 : freeze * 0.6 + this.flash[3] * 0.8;
    p.grain = reduce ? 0 : this.state === "replay" ? 0.07 : 0.025 + freeze * 0.03;
    p.vignette = this.state === "replay" ? 0.6 : 0.3 + freeze * 0.25;
    p.bloomStrength = s.postQuality === "high" ? 0.7 : 0.5;
    p.bloomThreshold = 1;
    p.exposure = 1;
    p.outline = 1;
    this.flash[3] = approach(this.flash[3], 0, this.state === "dead" ? 0.6 : 0.25, realDt);
    if (this.state === "dead") {
      p.desaturation = Math.max(p.desaturation, 0.85);
    }
    p.flash = this.flash;
    const incoming = this.incomingThreat(world);
    this.threat = approach(this.threat, incoming, incoming > this.threat ? 0.05 : 2.5, realDt);
    p.threat = reduce ? 0 : this.threat;
  }
  updateHud(world, ts) {
    const visible = this.state === "playing" || this.state === "intro" || this.state === "cleared";
    const held = world.player.held;
    let hint = null;
    if (this.state === "playing" && world.aimProp)
      hint = `E  ${ITEM_NAMES[world.aimProp.item.kind]}`;
    else if (this.state === "playing" && held && isGun(held.kind) && held.ammo === 0)
      hint = "EMPTY — CLICK TO THROW";
    const exit = this.def.exit;
    const hud = {
      visible,
      timeScale: ts,
      itemName: held ? ITEM_NAMES[held.kind] : null,
      ammo: held && isGun(held.kind) ? held.ammo : 0,
      maxAmmo: held && isGun(held.kind) ? WEAPONS[held.kind].ammo : 0,
      hint,
      levelName: `${this.def.id}  ${this.def.name}${exit ? "  ·  REACH THE EXIT" : ""}`,
      remaining: exit ? 0 : world.remainingEnemies,
      crosshairScale: this.save.settings.crosshairScale
    };
    this.ui.updateHud(hud);
  }
  handleEvents(world) {
    const a = this.audio;
    const fx = this.fx;
    for (const ev of world.events)
      this.handleEvent(ev, a, fx);
    world.events.length = 0;
    const now = new Set();
    for (const e of world.enemies) {
      if (e.telegraph > 0) {
        now.add(e.id);
        if (!this.telegraphing.has(e.id))
          a.play("charge", { pos: e.pos });
      }
    }
    this.telegraphing = now;
  }
  handleEvent(ev, a, fx) {
    switch (ev.type) {
      case "shot":
        a.play(ev.byPlayer ? SHOT_SFX[ev.weapon] : "enemyShot", { pos: ev.byPlayer ? void 0 : ev.pos, volume: ev.byPlayer ? 0.8 : 1 });
        fx.muzzleFlash(ev.pos, ev.dir, ev.weapon === "scatter");
        break;
      case "impact":
        a.play("impact", { pos: ev.pos, volume: 0.6 });
        fx.sparks(ev.pos, ev.normal, 8);
        fx.dust(ev.pos, ev.normal, 3);
        break;
      case "enemyDeath": {
        if (ev.silent)
          break;
        const e = ev.enemy;
        computePose({
          pos: e.pos,
          yaw: e.yaw,
          walkPhase: e.walkPhase,
          moveBlend: e.moveBlend,
          aimBlend: e.aimBlend,
          aimPitch: e.aimPitch,
          attackT: e.meleeT,
          stun: e.state === "stunned" ? 1 : 0,
          spawnT: e.spawnT,
          twoHanded: enemyIsTwoHanded(e),
          kind: e.kind
        }, this.pose);
        fx.shatter(this.pose, ev.dir, ev.point, ENEMY_TINT[e.kind], this.meshes.shards.length);
        a.play("shatter", { pos: ev.point });
        break;
      }
      case "enemyHit":
        a.play("punch", { pos: ev.pos });
        fx.glints(ev.pos, 10, [0.9, 0.6, 1], 2);
        break;
      case "playerDeath":
        this.deathDir = ev.dir;
        break;
      case "bulletClash":
        a.play("clash", { pos: ev.pos });
        fx.sparks(ev.pos, [0, 1, 0], 16, [6, 6, 7]);
        break;
      case "slice":
        a.play("slice", { pos: ev.pos });
        fx.sparks(ev.pos, [0, 1, 0], 10, [7, 6, 5]);
        break;
      case "punch":
        a.play(ev.hit ? "punch" : "punchMiss", { volume: ev.hit ? 1 : 0.5 });
        break;
      case "slash":
        a.play("whoosh");
        if (ev.hit)
          a.play("slice", { volume: 0.6 });
        break;
      case "throw":
        a.play("whoosh", { volume: 0.7 });
        break;
      case "pickup":
        a.play("pickup");
        break;
      case "dryFire":
        a.play("dryFire");
        break;
      case "itemBreak":
        a.play("glassBreak", { pos: ev.pos });
        fx.smallShatter(ev.pos, [0.9, 0.95, 1], this.meshes.shards.length);
        break;
      case "propImpact":
        a.play("propImpact", { pos: ev.pos, volume: clamp(ev.speed / 8, 0.1, 0.8) });
        break;
      case "spawn":
        a.play("spawn", { pos: ev.pos });
        fx.spawnShimmer(ev.pos, [0.8, 0.4, 1]);
        break;
      case "melee":
        a.play("melee", { pos: ev.pos });
        break;
      case "telegraph":
        break;
    }
  }
  updateAutoResolution(realDt) {
    const s = this.save.settings;
    if (!s.autoResolution || this.state !== "playing")
      return;
    this.perfAccum += realDt;
    this.perfFrames++;
    if (this.perfAccum < 2)
      return;
    const avg = this.perfAccum / this.perfFrames;
    this.perfAccum = 0;
    this.perfFrames = 0;
    const prev = this.autoScale;
    if (avg > 1 / 52)
      this.autoScale = Math.max(0.5, this.autoScale - 0.1);
    else if (avg < 1 / 75)
      this.autoScale = Math.min(1, this.autoScale + 0.05);
    if (prev !== this.autoScale) {
      console.info(`[game] auto resolution: avg frame ${(avg * 1e3).toFixed(1)} ms → scale ${(s.resolutionScale * this.autoScale).toFixed(2)}`);
      this.gfx.setResolutionScale(s.resolutionScale * this.autoScale);
    }
  }
  get lastDeathDir() {
    return dirFromYawPitch(v3(), Math.atan2(-this.deathDir[0], -this.deathDir[2]), 0);
  }
};
var IDENTITY = mat4.identity();
var WHITE3 = [1, 1, 1];
var CORE = [9, 8.5, 7.5];
var TRAIL_PLAYER = [3.2, 2.2, 1.2];
var TRAIL_ENEMY = [4, 1.4, 0.6];

async function boot() {
  const canvas = document.getElementById("gfx");
  const overlayEl = document.getElementById("overlay");
  if (!canvas || !overlayEl)
    throw new Error("Missing #gfx canvas or #overlay element.");
  let game = null;
  let gfx;
  try {
    gfx = await Gfx.create(canvas, (info) => {
      game?.stop();
      if (info.reason !== "destroyed")
        showUnsupported(`The GPU device was lost: ${info.message || info.reason}. Reload the page to continue.`);
    });
  } catch (err) {
    console.error("[boot] WebGPU init failed:", err);
    showUnsupported(err instanceof UnsupportedError ? err.message : `WebGPU initialisation failed: ${String(err)}`);
    return;
  }
  game = new Game(gfx, canvas, overlayEl);
  game.start();
}
boot().catch((err) => {
  console.error("[boot] fatal:", err);
  showUnsupported(`Startup failed: ${String(err)}`);
});
