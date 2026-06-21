/* =========================================================
   Input — keyboard manager.
   - Tracks held keys (for DAS/ARR polling).
   - Dispatches discrete onDown / onUp callbacks.
   - Prevents default on game keys so the page never scrolls.
   Games register handlers on start and detach on destroy.
   ========================================================= */
(function (Arcade) {
  "use strict";

  // Keys we never want to bubble to the browser while playing.
  const SWALLOW = new Set([
    "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
    "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
    "KeyZ", "KeyX", "KeyC", "KeyP"
  ]);

  class Input {
    constructor(target) {
      this._target = target || window;
      this._keys = new Set();
      this._down = new Set();   // handlers: (code, event) => {}
      this._up = new Set();
      this._enabled = false;

      this._onKeyDown = (e) => {
        if (SWALLOW.has(e.code)) e.preventDefault();
        if (!this._enabled) return;
        const repeat = this._keys.has(e.code);
        this._keys.add(e.code);
        // We pass repeat info; most discrete actions ignore OS key-repeat.
        for (const fn of Array.from(this._down)) fn(e.code, e, repeat);
      };

      this._onKeyUp = (e) => {
        this._keys.delete(e.code);
        if (!this._enabled) return;
        for (const fn of Array.from(this._up)) fn(e.code, e);
      };

      // If the window loses focus, release held keys: dispatch synthetic
      // key-ups so consumers clear their own intent state, then clear.
      this._onBlur = () => {
        if (this._enabled) {
          for (const code of Array.from(this._keys)) {
            for (const fn of Array.from(this._up)) fn(code, { code });
          }
        }
        this._keys.clear();
      };
    }

    attach() {
      this._target.addEventListener("keydown", this._onKeyDown);
      this._target.addEventListener("keyup", this._onKeyUp);
      window.addEventListener("blur", this._onBlur);
    }

    detach() {
      this._target.removeEventListener("keydown", this._onKeyDown);
      this._target.removeEventListener("keyup", this._onKeyUp);
      window.removeEventListener("blur", this._onBlur);
      this._keys.clear();
    }

    /** Enable/disable dispatch (held-key tracking continues so keys
        released during a pause don't get stuck). */
    setEnabled(v) { this._enabled = !!v; if (!v) { /* keep keys for accuracy */ } }

    isDown(code) { return this._keys.has(code); }

    onDown(fn) { this._down.add(fn); return () => this._down.delete(fn); }
    onUp(fn) { this._up.add(fn); return () => this._up.delete(fn); }

    clearHandlers() { this._down.clear(); this._up.clear(); }
  }

  Arcade.Input = Input;
})(window.Arcade = window.Arcade || {});
