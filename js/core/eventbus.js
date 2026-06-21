/* =========================================================
   EventBus — tiny pub/sub used to decouple shell <-> games.
   ========================================================= */
(function (Arcade) {
  "use strict";

  class EventBus {
    constructor() {
      this._map = new Map();
    }

    /** Subscribe. Returns an unsubscribe function. */
    on(event, handler) {
      if (!this._map.has(event)) this._map.set(event, new Set());
      this._map.get(event).add(handler);
      return () => this.off(event, handler);
    }

    off(event, handler) {
      const set = this._map.get(event);
      if (set) set.delete(handler);
    }

    emit(event, payload) {
      const set = this._map.get(event);
      if (!set) return;
      // copy so handlers can unsubscribe during emit
      for (const fn of Array.from(set)) {
        try { fn(payload); }
        catch (err) { console.error("[EventBus] handler error for '" + event + "':", err); }
      }
    }

    clear() { this._map.clear(); }
  }

  Arcade.EventBus = EventBus;
})(window.Arcade = window.Arcade || {});
