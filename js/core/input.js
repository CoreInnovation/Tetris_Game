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

  // WASD mirrors the arrow keys in EVERY game: a WASD press/release also drives
  // the matching arrow's held-state and onDown/onUp dispatch. REV lets isDown()
  // and the up-recompute see an arrow as held if its alias key is down.
  const ALIAS = { KeyW: "ArrowUp", KeyA: "ArrowLeft", KeyS: "ArrowDown", KeyD: "ArrowRight" };
  const REV = { ArrowUp: ["KeyW"], ArrowLeft: ["KeyA"], ArrowDown: ["KeyS"], ArrowRight: ["KeyD"] };

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
        const al = ALIAS[e.code], arrowWasDown = al ? this._arrowDown(al) : false;
        this._keys.add(e.code);
        // We pass repeat info; most discrete actions ignore OS key-repeat.
        for (const fn of Array.from(this._down)) fn(e.code, e, repeat);
        // mirror a WASD press onto its arrow (only when that arrow becomes newly held)
        if (al && !arrowWasDown) for (const fn of Array.from(this._down)) fn(al, { code: al }, false);
      };

      this._onKeyUp = (e) => {
        const al = ALIAS[e.code];
        this._keys.delete(e.code);
        if (!this._enabled) return;
        for (const fn of Array.from(this._up)) fn(e.code, e);
        // release the mirrored arrow only if nothing else still holds it
        if (al && !this._arrowDown(al)) for (const fn of Array.from(this._up)) fn(al, { code: al });
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

    isDown(code) { if (this._keys.has(code)) return true; const a = REV[code]; if (a) for (const k of a) if (this._keys.has(k)) return true; return false; }
    // is an arrow logically held — directly or via its WASD alias
    _arrowDown(arrow) { if (this._keys.has(arrow)) return true; const a = REV[arrow]; if (a) for (const k of a) if (this._keys.has(k)) return true; return false; }

    onDown(fn) { this._down.add(fn); return () => this._down.delete(fn); }
    onUp(fn) { this._up.add(fn); return () => this._up.delete(fn); }

    clearHandlers() { this._down.clear(); this._up.clear(); }
  }

  Arcade.Input = Input;
})(window.Arcade = window.Arcade || {});
