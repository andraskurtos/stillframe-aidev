import { Time } from "./time";

export class Loop {
  callbacks;
  time = new Time();
  running = false;
  handle = 0;
  constructor(callbacks) {
    this.callbacks = callbacks;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden)
        this.time.resetBaseline();
    });
  }
  start() {
    if (this.running)
      return;
    this.running = true;
    this.time.resetBaseline();
    this.handle = requestAnimationFrame(this.tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
  tick = (now) => {
    if (!this.running)
      return;
    const t = this.time;
    t.beginFrame(now);
    this.callbacks.frame(t);
    t.advanceSim();
    while (t.consumeStep())
      this.callbacks.fixedStep(t);
    t.endSteps();
    this.callbacks.render(t);
    this.handle = requestAnimationFrame(this.tick);
  };
};

