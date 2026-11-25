import "./styles/main.css";
import { mat4, vec3 } from "wgpu-matrix";
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

var m = (hex, emissive = 0) => ({ color: srgbHex(hex), emissive });
var THEMES = {
  transit: {
    lighting: {
      keyDir: [0.35, 0.85, 0.4],
      keyColor: [1.7, 0.98, 0.52],
      fillDir: [-0.55, 0.35, -0.6],
      fillColor: [0.16, 0.3, 0.36],
      ambientSky: [0.15, 0.16, 0.19],
      ambientGround: [0.07, 0.06, 0.055],
      fogColor: [0.03, 0.035, 0.04],
      fogDensity: 0.025
    },
    materials: {
      floor: m(7104354),
      wall: m(9209730),
      dark: m(5130823),
      light: m(11840932),
      trim: m(7827819),
      metal: m(6120038),
      accent: m(16751164, 6),
      glow: m(6283480, 5),
      window: m(1911344, 1.2)
    }
  },
  office: {
    lighting: {
      keyDir: [-0.4, 0.8, 0.45],
      keyColor: [1.5, 1.05, 0.7],
      fillDir: [0.6, 0.3, -0.5],
      fillColor: [0.2, 0.3, 0.36],
      ambientSky: [0.18, 0.19, 0.21],
      ambientGround: [0.08, 0.075, 0.07],
      fogColor: [0.045, 0.05, 0.056],
      fogDensity: 0.02
    },
    materials: {
      floor: m(6052440),
      wall: m(10130830),
      dark: m(4605002),
      light: m(12762290),
      trim: m(8419954),
      metal: m(6449004),
      accent: m(16756835, 5),
      glow: m(7330047, 4),
      window: m(2306104, 1.5)
    }
  },
  rooftop: {
    lighting: {
      keyDir: [0.5, 0.65, -0.55],
      keyColor: [0.55, 0.75, 1],
      fillDir: [-0.5, 0.25, 0.6],
      fillColor: [0.7, 0.36, 0.14],
      ambientSky: [0.09, 0.11, 0.17],
      ambientGround: [0.06, 0.045, 0.04],
      fogColor: [0.025, 0.03, 0.055],
      fogDensity: 0.018
    },
    materials: {
      floor: m(5657679),
      wall: m(7696747),
      dark: m(3947325),
      light: m(10459535),
      trim: m(6775646),
      metal: m(5330524),
      accent: m(16747066, 7),
      glow: m(5822696, 5),
      window: m(2767434, 2)
    }
  }
};

function buildLevelMesh(device, def) {
  const scene = buildLevelScene(device, def);
  const boxes = def.boxes.filter((b) => b.collide).map((b) => ({ min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] }));
  const st = new StaticWorld(boxes);
  const nav = new NavGrid(st);
  return { scene, shared: { static: st, nav } };
}
function buildLevelScene(device, def) {
  const theme = THEMES[def.theme];
  const b = new MeshBuilder();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of def.boxes) {
    const mat = theme.materials[box.mat];
    b.addBoxMinMax(box.min, box.max, mat.color, mat.emissive);
    if (box.collide) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], box.min[k]);
        max[k] = Math.max(max[k], box.max[k]);
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    min[0] = min[1] = min[2] = -10;
    max[0] = max[1] = max[2] = 10;
  }
  min[1] = Math.max(min[1], -1);
  max[1] = Math.min(max[1], 8);
  return { mesh: b.build(device, `level-${def.id}`), min, max };
}

var visualRng = new Rng(12648430);

var PART_IDS = [
  "pelvis",
  "torso",
  "head",
  "upperArmL",
  "lowerArmL",
  "upperArmR",
  "lowerArmR",
  "upperLegL",
  "lowerLegL",
  "upperLegR",
  "lowerLegR"
];
var PART_EXTENTS = {
  pelvis: [0.17, 0.08, 0.1],
  torso: [0.22, 0.28, 0.12],
  head: [0.12, 0.14, 0.12],
  upperArmL: [0.06, 0.15, 0.06],
  lowerArmL: [0.05, 0.15, 0.05],
  upperArmR: [0.06, 0.15, 0.06],
  lowerArmR: [0.05, 0.15, 0.05],
  upperLegL: [0.08, 0.21, 0.08],
  lowerLegL: [0.07, 0.21, 0.07],
  upperLegR: [0.08, 0.21, 0.08],
  lowerLegR: [0.07, 0.21, 0.07]
};
var PART_CENTER = {
  pelvis: [0, 0, 0],
  torso: [0, 0.28, 0],
  head: [0, 0.14, 0],
  upperArmL: [0, -0.15, 0],
  lowerArmL: [0, -0.15, 0],
  upperArmR: [0, -0.15, 0],
  lowerArmR: [0, -0.15, 0],
  upperLegL: [0, -0.21, 0],
  lowerLegL: [0, -0.21, 0],
  upperLegR: [0, -0.21, 0],
  lowerLegR: [0, -0.21, 0]
};
var WHITE2 = srgbHex(16052714);
var OFFWHITE = srgbHex(14276044);
var DARK = srgbHex(2763310);
var GLASS = srgbHex(16777215);
var GLOVE = srgbHex(1842208);
var GLOVE_DARK = srgbHex(1184276);
function buildMeshLibrary(device) {
  const part = (fn, label) => {
    const b = new MeshBuilder();
    fn(b);
    return b.build(device, label);
  };
  const parts = {
    pelvis: part((b) => b.addTaperedBox(0, 0, -0.08, 0.08, 0.26, 0.18, 0.34, 0.2, GLASS, 0.6), "pelvis"),
    torso: part((b) => {
      b.addTaperedBox(0, 0, 0, 0.3, 0.32, 0.2, 0.44, 0.24, GLASS, 0.9);
      b.addTaperedBox(0, 0, 0.3, 0.56, 0.44, 0.24, 0.3, 0.18, GLASS, 0.9);
    }, "torso"),
    head: part((b) => {
      b.addTaperedBox(0, 0, 0, 0.06, 0.08, 0.08, 0.1, 0.1, GLASS, 0.5);
      b.addTaperedBox(0, 0.01, 0.06, 0.2, 0.15, 0.17, 0.22, 0.22, GLASS, 1.2);
      b.addTaperedBox(0, 0.01, 0.2, 0.3, 0.22, 0.22, 0.14, 0.15, GLASS, 1.2);
    }, "head"),
    upperArmL: part((b) => b.addTaperedBox(0, 0, 0, -0.3, 0.12, 0.12, 0.09, 0.09, GLASS, 0.7), "upperArm"),
    lowerArmL: part((b) => {
      b.addTaperedBox(0, 0, 0, -0.26, 0.09, 0.09, 0.07, 0.07, GLASS, 0.7);
      b.addBox([0, -0.29, 0], [0.09, 0.08, 0.09], GLASS, 0.9);
    }, "lowerArm"),
    upperArmR: part((b) => b.addTaperedBox(0, 0, 0, -0.3, 0.12, 0.12, 0.09, 0.09, GLASS, 0.7), "upperArmR"),
    lowerArmR: part((b) => {
      b.addTaperedBox(0, 0, 0, -0.26, 0.09, 0.09, 0.07, 0.07, GLASS, 0.7);
      b.addBox([0, -0.29, 0], [0.09, 0.08, 0.09], GLASS, 0.9);
    }, "lowerArmR"),
    upperLegL: part((b) => b.addTaperedBox(0, 0, 0, -0.42, 0.17, 0.17, 0.12, 0.12, GLASS, 0.6), "upperLeg"),
    lowerLegL: part((b) => {
      b.addTaperedBox(0, 0, 0, -0.4, 0.12, 0.12, 0.09, 0.09, GLASS, 0.6);
      b.addBox([0, -0.43, -0.04], [0.1, 0.06, 0.2], GLASS, 0.6);
    }, "lowerLeg"),
    upperLegR: part((b) => b.addTaperedBox(0, 0, 0, -0.42, 0.17, 0.17, 0.12, 0.12, GLASS, 0.6), "upperLegR"),
    lowerLegR: part((b) => {
      b.addTaperedBox(0, 0, 0, -0.4, 0.12, 0.12, 0.09, 0.09, GLASS, 0.6);
      b.addBox([0, -0.43, -0.04], [0.1, 0.06, 0.2], GLASS, 0.6);
    }, "lowerLegR")
  };
  const items = {
    pistol: part((b) => {
      b.addBox([0, 0.03, -0.04], [0.04, 0.045, 0.21], WHITE2);
      b.addBox([0, -0.04, 0.03], [0.036, 0.11, 0.05], OFFWHITE);
      b.addBox([0, -0.012, -0.015], [0.012, 0.03, 0.035], DARK);
    }, "pistol"),
    scatter: part((b) => {
      b.addBox([0, 0.02, -0.2], [0.05, 0.05, 0.6], WHITE2);
      b.addBox([0, -0.01, -0.22], [0.055, 0.04, 0.16], OFFWHITE);
      b.addBox([0, -0.02, 0.17], [0.05, 0.09, 0.26], WHITE2);
      b.addBox([0, -0.06, 0.06], [0.035, 0.08, 0.04], OFFWHITE);
    }, "scatter"),
    carbine: part((b) => {
      b.addBox([0, 0.02, -0.08], [0.05, 0.08, 0.36], WHITE2);
      b.addBox([0, 0.03, -0.33], [0.025, 0.025, 0.18], OFFWHITE);
      b.addBox([0, -0.07, -0.06], [0.035, 0.12, 0.05], OFFWHITE);
      b.addBox([0, -0.05, 0.05], [0.035, 0.09, 0.04], WHITE2);
      b.addBox([0, 0, 0.2], [0.045, 0.09, 0.2], WHITE2);
      b.addBox([0, 0.075, -0.05], [0.02, 0.025, 0.12], DARK);
    }, "carbine"),
    blade: part((b) => {
      b.addBox([0, 0, 0.1], [0.035, 0.035, 0.2], DARK);
      b.addBox([0, 0, -5e-3], [0.11, 0.02, 0.03], OFFWHITE);
      b.addBox([0, 0, -0.38], [0.012, 0.045, 0.72], WHITE2, 0.2);
    }, "blade"),
    bottle: part((b) => {
      b.addBox([0, -0.02, 0], [0.075, 0.18, 0.075], WHITE2);
      b.addTaperedBox(0, 0, 0.07, 0.12, 0.075, 0.075, 0.03, 0.03, WHITE2);
      b.addBox([0, 0.15, 0], [0.03, 0.06, 0.03], OFFWHITE);
    }, "bottle"),
    brick: part((b) => b.addBox([0, 0, 0], [0.21, 0.065, 0.1], OFFWHITE), "brick"),
    mug: part((b) => {
      b.addBox([0, 0, 0], [0.09, 0.1, 0.09], WHITE2);
      b.addBox([0.06, 0, 0], [0.03, 0.06, 0.02], WHITE2);
    }, "mug")
  };
  const rng = new Rng(4242);
  const shards = [];
  for (let i = 0; i < 6; i++) {
    const s = rng.range(0.6, 1);
    const p = () => [rng.sym(0.06) * s, rng.sym(0.06) * s, rng.sym(0.06) * s];
    const a = [0, 0.07 * s, 0];
    const bb = [-0.06 * s, -0.04 * s, 0.05 * s];
    const c = [0.06 * s, -0.04 * s, 0.05 * s];
    const d = [0, -0.04 * s, -0.07 * s];
    const j = p();
    const jitter = (v) => [v[0] + j[0] * 0.4, v[1] + j[1] * 0.4, v[2] + j[2] * 0.4];
    const ja = jitter(a);
    const b = new MeshBuilder();
    b.addTri(ja, bb, c, GLASS, 1);
    b.addTri(ja, c, d, GLASS, 1);
    b.addTri(ja, d, bb, GLASS, 1);
    b.addTri(bb, d, c, GLASS, 1);
    shards.push(b.build(device, `shard-${i}`));
  }
  const fist = part((b) => {
    b.addBox([0, 0, 0], [0.09, 0.09, 0.1], GLOVE);
    b.addBox([0, 0.025, -0.055], [0.085, 0.035, 0.02], GLOVE_DARK);
  }, "fist");
  const forearm = part((b) => b.addTaperedBox(0, 0, 0, 0.36, 0.08, 0.08, 0.1, 0.1, GLOVE), "forearm");
  const spawnRing = part((b) => {
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI * 2;
      b.addBox([Math.cos(a0) * 0.45, 0.01, Math.sin(a0) * 0.45], [0.12, 0.02, 0.12], GLASS, 2);
    }
  }, "spawn-ring");
  return { parts, items, shards, fist, forearm, spawnRing };
}

var MAX_PARTICLES = 3e3;
var MAX_SHARDS = 900;
var SHARD_LIFE = 7;
var FxSystem = class {
  particles = [];
  shards = [];
  model = mat4.create();
  tmpA = v3();
  tmpB = v3();
  clear() {
    this.particles.length = 0;
    this.shards.length = 0;
  }
  get particleCount() {
    return this.particles.length;
  }
  get shardCount() {
    return this.shards.length;
  }
  emit(p) {
    if (this.particles.length >= MAX_PARTICLES)
      this.particles.shift();
    this.particles.push({ ...p, alive: true });
  }
  sparks(pos, normal, count, color = [6, 3.2, 1.2]) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(2, 7);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [normal[0] * s + visualRng.sym(3), normal[1] * s + visualRng.sym(3) + 1, normal[2] * s + visualRng.sym(3)],
        life: 0,
        maxLife: visualRng.range(0.15, 0.4),
        size: visualRng.range(6e-3, 0.014),
        color,
        drag: 2,
        gravity: 9,
        streak: 0.035
      });
    }
  }
  dust(pos, normal, count) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(0.3, 1.2);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [normal[0] * s + visualRng.sym(0.5), normal[1] * s + visualRng.sym(0.5), normal[2] * s + visualRng.sym(0.5)],
        life: 0,
        maxLife: visualRng.range(0.5, 1.2),
        size: visualRng.range(0.04, 0.09),
        color: [0.25, 0.23, 0.21],
        drag: 3,
        gravity: -0.2,
        streak: 0
      });
    }
  }
  glints(pos, count, tint, speed = 3) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(0.5, speed);
      const dir = randomUnit(this.tmpA);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [dir[0] * s, dir[1] * s + 0.8, dir[2] * s],
        life: 0,
        maxLife: visualRng.range(0.3, 0.9),
        size: visualRng.range(8e-3, 0.02),
        color: [tint[0] * 5, tint[1] * 5, tint[2] * 5],
        drag: 1.5,
        gravity: 5,
        streak: 0.02
      });
    }
  }
  muzzleFlash(pos, dir, big) {
    const n = big ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const s = visualRng.range(1, big ? 6 : 4);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [dir[0] * s + visualRng.sym(1), dir[1] * s + visualRng.sym(1), dir[2] * s + visualRng.sym(1)],
        life: 0,
        maxLife: visualRng.range(0.04, 0.09),
        size: visualRng.range(0.02, big ? 0.06 : 0.04),
        color: [9, 5.5, 2.2],
        drag: 8,
        gravity: 0,
        streak: 0.02
      });
    }
    this.emit({ pos: [pos[0], pos[1], pos[2]], vel: [0, 0, 0], life: 0, maxLife: 0.05, size: big ? 0.12 : 0.08, color: [10, 7, 3], drag: 0, gravity: 0, streak: 0 });
  }
  spawnShimmer(pos, tint) {
    for (let i = 0; i < 24; i++) {
      const a = visualRng.next() * Math.PI * 2;
      const r = visualRng.range(0.2, 0.6);
      this.emit({
        pos: [pos[0] + Math.cos(a) * r, pos[1] + visualRng.range(0, 1.8), pos[2] + Math.sin(a) * r],
        vel: [0, visualRng.range(0.3, 1.2), 0],
        life: 0,
        maxLife: visualRng.range(0.4, 0.9),
        size: visualRng.range(0.01, 0.025),
        color: [tint[0] * 4, tint[1] * 4, tint[2] * 4],
        drag: 0.5,
        gravity: -0.5,
        streak: 0.05
      });
    }
  }
  shatter(pose, dir, point, tint, meshCount) {
    const local = this.tmpB;
    for (const id of PART_IDS) {
      const m2 = pose.parts[id];
      const ext = PART_EXTENTS[id];
      const c = PART_CENTER[id];
      const n = id === "torso" ? 9 : id === "head" || id === "pelvis" ? 5 : 3;
      for (let i = 0; i < n; i++) {
        local[0] = c[0] + visualRng.sym(ext[0]);
        local[1] = c[1] + visualRng.sym(ext[1]);
        local[2] = c[2] + visualRng.sym(ext[2]);
        const wx = m2[0] * local[0] + m2[4] * local[1] + m2[8] * local[2] + m2[12];
        const wy = m2[1] * local[0] + m2[5] * local[1] + m2[9] * local[2] + m2[13];
        const wz = m2[2] * local[0] + m2[6] * local[1] + m2[10] * local[2] + m2[14];
        const near = Math.max(0, 1 - Math.hypot(wx - point[0], wy - point[1], wz - point[2]) / 1.2);
        const s = visualRng.range(1.5, 3.5) + near * 4;
        const out = randomUnit(this.tmpA);
        if (this.shards.length >= MAX_SHARDS)
          this.shards.shift();
        this.shards.push({
          pos: [wx, wy, wz],
          vel: [dir[0] * s + out[0] * 1.8, dir[1] * s + out[1] * 1.8 + 1.5, dir[2] * s + out[2] * 1.8],
          rot: [visualRng.next() * 6.28, visualRng.next() * 6.28, visualRng.next() * 6.28],
          angVel: [visualRng.sym(14), visualRng.sym(14), visualRng.sym(14)],
          scale: visualRng.range(0.7, 1.5) * (id === "torso" ? 1.3 : 1),
          life: 0,
          mesh: Math.floor(visualRng.next() * meshCount),
          tint,
          sleeping: false
        });
      }
    }
    this.glints(point, 30, tint, 5);
  }
  smallShatter(pos, tint, meshCount) {
    for (let i = 0; i < 8; i++) {
      const out = randomUnit(this.tmpA);
      if (this.shards.length >= MAX_SHARDS)
        this.shards.shift();
      this.shards.push({
        pos: [pos[0], pos[1], pos[2]],
        vel: [out[0] * 2.5, Math.abs(out[1]) * 2 + 1, out[2] * 2.5],
        rot: [visualRng.next() * 6.28, visualRng.next() * 6.28, visualRng.next() * 6.28],
        angVel: [visualRng.sym(14), visualRng.sym(14), visualRng.sym(14)],
        scale: visualRng.range(0.3, 0.6),
        life: 0,
        mesh: Math.floor(visualRng.next() * meshCount),
        tint,
        sleeping: false
      });
    }
    this.glints(pos, 12, [1, 1, 1], 3);
  }
  update(dt, world) {
    if (dt <= 0)
      return;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vel[0] *= d;
      p.vel[1] = p.vel[1] * d - p.gravity * dt;
      p.vel[2] *= d;
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
    }
    compact(this.particles);
    const sub = dt > 1 / 60 ? Math.ceil(dt / (1 / 60)) : 1;
    const h = dt / sub;
    for (const s of this.shards) {
      s.life += dt;
      if (s.sleeping)
        continue;
      for (let k = 0; k < sub; k++) {
        s.vel[1] -= 12 * h;
        s.pos[0] += s.vel[0] * h;
        s.pos[1] += s.vel[1] * h;
        s.pos[2] += s.vel[2] * h;
        if (world) {
          const res = world.resolveSphere(s.pos, s.vel, 0.035 * s.scale, 0.35, 0.25);
          if (res.impact > 0.2) {
            s.angVel[0] *= 0.6;
            s.angVel[1] *= 0.6;
            s.angVel[2] *= 0.6;
          }
          if (res.grounded && Math.hypot(s.vel[0], s.vel[1], s.vel[2]) < 0.15)
            s.sleeping = true;
        }
      }
      s.rot[0] += s.angVel[0] * dt;
      s.rot[1] += s.angVel[1] * dt;
      s.rot[2] += s.angVel[2] * dt;
      if (s.pos[1] < -20)
        s.life = SHARD_LIFE;
    }
    let w = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      if (s.life < SHARD_LIFE)
        this.shards[w++] = s;
    }
    this.shards.length = w;
  }
  draw(renderer, meshes) {
    for (const p of this.particles) {
      const fade = 1 - p.life / p.maxLife;
      const c = [p.color[0] * fade, p.color[1] * fade, p.color[2] * fade];
      if (p.streak > 0) {
        const tail = [p.pos[0] - p.vel[0] * p.streak, p.pos[1] - p.vel[1] * p.streak, p.pos[2] - p.vel[2] * p.streak];
        renderer.drawSegment(tail, p.pos, p.size, c, 0.2, 1.5);
      } else {
        renderer.drawSegment(p.pos, p.pos, p.size, c, 1, 2.5);
      }
    }
    const m2 = this.model;
    for (const s of this.shards) {
      const fadeStart = SHARD_LIFE - 1.5;
      const fade = s.life > fadeStart ? Math.max(0, 1 - (s.life - fadeStart) / 1.5) : 1;
      mat4.translation(s.pos, m2);
      mat4.rotateY(m2, s.rot[1], m2);
      mat4.rotateX(m2, s.rot[0], m2);
      mat4.rotateZ(m2, s.rot[2], m2);
      mat4.uniformScale(m2, s.scale * (0.4 + 0.6 * fade), m2);
      const mesh = meshes.shards[s.mesh] ?? meshes.shards[0];
      renderer.drawMesh(mesh, m2, s.tint, 0.6, "glass", 0, fade);
    }
  }
};
function randomUnit(out) {
  for (; ; ) {
    const x = visualRng.sym(1), y = visualRng.sym(1), z = visualRng.sym(1);
    const l = x * x + y * y + z * z;
    if (l > 1e-4 && l <= 1) {
      const il = 1 / Math.sqrt(l);
      out[0] = x * il;
      out[1] = y * il;
      out[2] = z * il;
      return out;
    }
  }
}
function compact(list) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.alive)
      list[w++] = p;
  }
  list.length = w;
}

var GLOVE2 = [1, 1, 1];
var Viewmodel = class {
  swayX = 0;
  swayY = 0;
  bobAmount = 0;
  cam = mat4.create();
  m = mat4.create();
  hand = mat4.create();
  update(realDt, mouseDx, mouseDy, planarSpeed, grounded) {
    this.swayX = approach(this.swayX, clamp(-mouseDx * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.swayY = approach(this.swayY, clamp(mouseDy * 9e-4, -0.05, 0.05), 0.08, realDt);
    this.bobAmount = approach(this.bobAmount, grounded ? clamp(planarSpeed / 4, 0, 1) : 0, 0.1, realDt);
  }
  draw(renderer, meshes, eye, yaw, pitch, p, stride, reduceMotion) {
    const cam = this.cam;
    mat4.translation([eye[0], eye[1], eye[2]], cam);
    mat4.rotateY(cam, yaw, cam);
    mat4.rotateX(cam, pitch, cam);
    const bobScale = reduceMotion ? 0.3 : 1;
    const bobX = Math.sin(stride * 2.2) * 0.012 * this.bobAmount * bobScale;
    const bobY = -Math.abs(Math.cos(stride * 2.2)) * 0.012 * this.bobAmount * bobScale;
    const sx = this.swayX * bobScale + bobX;
    const sy = this.swayY * bobScale + bobY;
    const pickup = p.pickupAge < 0.2 ? 1 - p.pickupAge / 0.2 : 0;
    const throwT = p.throwAge < 0.3 ? p.throwAge / 0.3 : -1;
    const held = p.held;
    if (!held) {
      for (const side of [1, -1]) {
        const punching = p.punchSide === side && p.punchAge < 0.24;
        const t = punching ? p.punchAge / 0.24 : 0;
        const ext = punching ? Math.sin(t * Math.PI) : 0;
        const x = 0.2 * side + sx - ext * 0.12 * side;
        let y = -0.2 + sy + ext * 0.07;
        let z = -0.4 - ext * 0.32;
        if (throwT >= 0 && side === 1) {
          const k = Math.sin(throwT * Math.PI);
          z -= k * 0.25;
          y += k * 0.08;
        }
        y -= pickup * 0.15;
        this.drawArm(renderer, meshes, x, y, z, side, ext);
      }
      return;
    }
    const kind = held.kind;
    const recoilScale = kind === "scatter" ? 1.6 : kind === "carbine" ? 0.7 : 1;
    const recoil = Math.exp(-p.recoilAge * 14) * recoilScale;
    const hx = 0.19 + sx;
    let hy = -0.2 + sy - pickup * 0.2;
    let hz = -0.38 + recoil * 0.07;
    if (throwT >= 0) {
      const k = Math.sin(throwT * Math.PI);
      hz -= k * 0.25;
      hy += k * 0.1;
    }
    const hand = this.hand;
    mat4.translate(cam, [hx, hy, hz], hand);
    mat4.rotateX(hand, recoil * 0.22, hand);
    if (kind === "blade") {
      const slash = p.slashAge < 0.25 ? p.slashAge / 0.25 : -1;
      if (slash >= 0) {
        const k = Math.sin(slash * Math.PI);
        mat4.translate(hand, [-k * 0.25, k * 0.05, -k * 0.15], hand);
        mat4.rotateY(hand, 0.9 - slash * 1.8, hand);
        mat4.rotateZ(hand, -k * 0.9, hand);
      } else {
        mat4.rotateY(hand, 0.25, hand);
        mat4.rotateX(hand, 0.55, hand);
      }
    }
    this.drawItem(renderer, meshes, kind, hand);
    this.drawFistAt(renderer, meshes, hand);
    this.drawArmFromHand(renderer, meshes, hand);
    if (kind === "scatter" || kind === "carbine") {
      mat4.translate(hand, [-0.03, -0.04, -0.3], this.m);
      this.drawFistAt(renderer, meshes, this.m);
    }
  }
  drawItem(renderer, meshes, kind, hand) {
    const m2 = this.m;
    switch (kind) {
      case "pistol":
        mat4.translate(hand, [0, 0.045, -0.03], m2);
        break;
      case "scatter":
        mat4.translate(hand, [0, 0.05, -0.12], m2);
        break;
      case "carbine":
        mat4.translate(hand, [0, 0.06, -0.08], m2);
        break;
      case "blade":
        mat4.translate(hand, [0, 0.02, -0.1], m2);
        break;
      default:
        mat4.translate(hand, [0, 0.07, -0.04], m2);
    }
    renderer.drawMesh(meshes.items[kind], m2, [1, 1, 1], 0.08, "viewmodel");
  }
  drawArm(renderer, meshes, x, y, z, side, ext) {
    const m2 = this.hand;
    mat4.translate(this.cam, [x, y, z], m2);
    mat4.rotateY(m2, side * 0.12 - ext * 0.1 * side, m2);
    mat4.rotateX(m2, 0.15 + ext * 0.1, m2);
    this.drawFistAt(renderer, meshes, m2);
    this.drawArmFromHand(renderer, meshes, m2);
  }
  drawFistAt(renderer, meshes, m2) {
    renderer.drawMesh(meshes.fist, m2, GLOVE2, 0, "viewmodel");
  }
  drawArmFromHand(renderer, meshes, hand) {
    const fa = mat4.translate(hand, [0, -0.01, 0.04]);
    mat4.rotateX(fa, Math.PI / 2 - 0.15, fa);
    renderer.drawMesh(meshes.forearm, fa, GLOVE2, 0, "viewmodel");
  }
};

function createPose() {
  const parts = {};
  for (const id of PART_IDS)
    parts[id] = mat4.create();
  return { parts, weapon: mat4.create() };
}
var tmp = mat4.create();
function computePose(p, out) {
  const P = out.parts;
  const move = p.moveBlend;
  const ph = p.walkPhase;
  const s = Math.sin(ph);
  const runScale = p.kind === "rusher" ? 1.5 : 1;
  const spawnScale = 0.3 + 0.7 * easeOut(p.spawnT);
  const root = mat4.translation([p.pos[0], p.pos[1], p.pos[2]]);
  mat4.rotateY(root, p.yaw, root);
  mat4.uniformScale(root, spawnScale, root);
  const bob = Math.abs(Math.cos(ph)) * 0.05 * move * runScale;
  const hipY = 0.92 + bob - p.stun * 0.05;
  mat4.translate(root, [0, hipY, 0], P.pelvis);
  mat4.rotateY(P.pelvis, s * 0.12 * move, P.pelvis);
  const lean = -0.1 * move * runScale - (p.attackT > 0 ? Math.sin(p.attackT * Math.PI) * 0.35 : 0) + p.stun * (0.25 + Math.sin(ph * 3) * 0.1);
  mat4.translate(P.pelvis, [0, 0.08, 0], P.torso);
  mat4.rotateX(P.torso, lean, P.torso);
  mat4.rotateY(P.torso, -s * 0.1 * move, P.torso);
  mat4.translate(P.torso, [0, 0.56, 0], P.head);
  mat4.rotateX(P.head, p.aimPitch * 0.5 - lean * 0.5, P.head);
  const swing = s * 0.5 * move * runScale;
  const aimAngle = Math.PI / 2 + p.aimPitch;
  const strike = p.attackT > 0 ? Math.sin(Math.min(1, p.attackT * 1.3) * Math.PI) : 0;
  let rUpper = lerp2(-swing, aimAngle, p.aimBlend);
  let rElbow = lerp2(0.35 + Math.max(0, swing) * 0.4, 0.05, p.aimBlend);
  if (p.attackT > 0) {
    rUpper = lerp2(rUpper, Math.PI / 2 + 0.2, strike);
    rElbow = lerp2(rElbow, 0, strike);
  }
  mat4.translate(P.torso, [0.25, 0.5, 0], P.upperArmR);
  mat4.rotateX(P.upperArmR, rUpper - p.stun * 0.6, P.upperArmR);
  mat4.rotateZ(P.upperArmR, 0.12 - p.aimBlend * 0.1, P.upperArmR);
  mat4.translate(P.upperArmR, [0, -0.3, 0], P.lowerArmR);
  mat4.rotateX(P.lowerArmR, rElbow, P.lowerArmR);
  const support = p.twoHanded ? p.aimBlend : 0;
  const lUpper = lerp2(swing, aimAngle - 0.25, support);
  const lElbow = lerp2(0.35 + Math.max(0, -swing) * 0.4, 0.5, support);
  mat4.translate(P.torso, [-0.25, 0.5, 0], P.upperArmL);
  mat4.rotateX(P.upperArmL, lUpper - p.stun * 0.6, P.upperArmL);
  mat4.rotateZ(P.upperArmL, -0.12 + support * 0, P.upperArmL);
  mat4.rotateY(P.upperArmL, -support * 0.5, P.upperArmL);
  mat4.translate(P.upperArmL, [0, -0.3, 0], P.lowerArmL);
  mat4.rotateX(P.lowerArmL, lElbow, P.lowerArmL);
  const legSwing = s * 0.55 * move * runScale;
  const kneeR = 0.08 + Math.max(0, -Math.sin(ph - 0.6)) * 0.9 * move;
  const kneeL = 0.08 + Math.max(0, Math.sin(ph - 0.6)) * 0.9 * move;
  mat4.translate(P.pelvis, [0.1, -0.05, 0], P.upperLegR);
  mat4.rotateX(P.upperLegR, legSwing + p.stun * 0.15, P.upperLegR);
  mat4.translate(P.upperLegR, [0, -0.42, 0], P.lowerLegR);
  mat4.rotateX(P.lowerLegR, -kneeR, P.lowerLegR);
  mat4.translate(P.pelvis, [-0.1, -0.05, 0], P.upperLegL);
  mat4.rotateX(P.upperLegL, -legSwing + p.stun * 0.15, P.upperLegL);
  mat4.translate(P.upperLegL, [0, -0.42, 0], P.lowerLegL);
  mat4.rotateX(P.lowerLegL, -kneeL, P.lowerLegL);
  mat4.translate(P.lowerArmR, [0, -0.3, 0], tmp);
  mat4.rotateX(tmp, -Math.PI / 2, out.weapon);
  return out;
}
function lerp2(a, b, t) {
  return a + (b - a) * t;
}
function easeOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) * (1 - c);
}

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
