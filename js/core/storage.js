/* =========================================================
   Storage — namespaced localStorage wrapper with JSON +
   graceful fallback (so the game still runs if storage is
   blocked, e.g. some file:// / private-mode situations).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const PREFIX = "arcade:";

  class Storage {
    constructor() {
      this._mem = {};            // in-memory fallback
      this._ok = this._probe();
    }

    _probe() {
      try {
        const k = PREFIX + "__probe__";
        window.localStorage.setItem(k, "1");
        window.localStorage.removeItem(k);
        return true;
      } catch (_) {
        return false;
      }
    }

    get(key, fallback) {
      const full = PREFIX + key;
      try {
        const raw = this._ok ? window.localStorage.getItem(full) : this._mem[full];
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (_) {
        return fallback;
      }
    }

    set(key, value) {
      const full = PREFIX + key;
      const raw = JSON.stringify(value);
      try {
        if (this._ok) window.localStorage.setItem(full, raw);
        else this._mem[full] = raw;
      } catch (_) {
        this._mem[full] = raw; // last-ditch fallback
      }
    }

    /** Convenience for per-game high scores. */
    getHighScore(gameId) { return this.get("highscore:" + gameId, 0); }

    /** Stores only if higher. Returns true if it was a new record. */
    setHighScore(gameId, score) {
      const best = this.getHighScore(gameId);
      if (score > best) {
        this.set("highscore:" + gameId, score);
        return true;
      }
      return false;
    }
  }

  Arcade.Storage = Storage;
})(window.Arcade = window.Arcade || {});
