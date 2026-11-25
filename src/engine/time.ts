export var FIXED_STEP = 1 / 120;
export var MAX_REAL_DT = 0.1;
export var MAX_STEPS_PER_FRAME = 8;
export class Time {
  realDt = 0;
  simDt = 0;
  timeScale = 1;
  lock = "none";
  realTime = 0;
  simTime = 0;
  alpha = 0;
  stepsThisFrame = 0;
  frame = 0;
  accumulator = 0;
  lastNow = -1;
  beginFrame(now) {
    if (this.lastNow < 0)
      this.lastNow = now;
    this.realDt = Math.min(MAX_REAL_DT, Math.max(0, (now - this.lastNow) / 1e3));
    this.lastNow = now;
    this.realTime += this.realDt;
    this.frame++;
    this.stepsThisFrame = 0;
  }
  advanceSim() {
    const scale2 = this.effectiveScale();
    this.simDt = this.realDt * scale2;
    this.accumulator += this.simDt;
  }
  consumeStep() {
    if (this.accumulator < FIXED_STEP)
      return false;
    if (this.stepsThisFrame >= MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
      return false;
    }
    this.accumulator -= FIXED_STEP;
    this.simTime += FIXED_STEP;
    this.stepsThisFrame++;
    return true;
  }
  endSteps() {
    this.alpha = this.accumulator / FIXED_STEP;
  }
  clearAccumulator() {
    this.accumulator = 0;
    this.alpha = 0;
  }
  resetBaseline() {
    this.lastNow = -1;
    this.accumulator = 0;
  }
  effectiveScale() {
    switch (this.lock) {
      case "frozen":
        return 0;
      case "realtime":
        return 1;
      default:
        return this.timeScale;
    }
  }
};

