/* =========================================================
   GameLoop — requestAnimationFrame loop with a delta time in
   milliseconds. Large deltas (tab switch / breakpoint) are
   clamped so the simulation never makes a huge jump.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const MAX_DT = 100; // ms — clamp to avoid spiral-of-death after a stall

  class GameLoop {
    constructor(update, render) {
      this._update = update;     // (dtMs, nowMs) => void
      this._render = render;     // (nowMs) => void
      this._running = false;
      this._last = 0;
      this._raf = 0;
      this._tick = this._tick.bind(this);
    }

    start() {
      if (this._running) return;
      this._running = true;
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }

    stop() {
      this._running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
    }

    get running() { return this._running; }

    _tick(now) {
      if (!this._running) return;
      let dt = now - this._last;
      this._last = now;
      if (dt > MAX_DT) dt = MAX_DT;
      if (dt < 0) dt = 0;
      this._update(dt, now);
      this._render(now);
      this._raf = requestAnimationFrame(this._tick);
    }
  }

  Arcade.GameLoop = GameLoop;
})(window.Arcade = window.Arcade || {});
