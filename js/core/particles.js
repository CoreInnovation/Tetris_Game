/* =========================================================
   ParticleSystem — general-purpose 2D particle engine.
   Reusable across game modules. Lightweight: a flat array of
   particle objects, integrated each frame.

   Particle fields:
     x, y         position (canvas px)
     vx, vy       velocity (px/sec)
     life, max    remaining / total life (sec)
     size         radius/half-size (px)
     color        css color string
     gravity      px/sec^2 added to vy
     drag         per-second velocity damping (0..1)
     spin         rad/sec, rotation visual
     rot          current rotation
     shape        'square' | 'circle'
     fade         fade alpha with life (bool)
     shrink       shrink size with life (bool)
     glow         additive-ish glow (bool)
   ========================================================= */
(function (Arcade) {
  "use strict";

  function rand(a, b) { return a + Math.random() * (b - a); }

  class ParticleSystem {
    constructor(max) {
      this._max = max || 1200;
      this._list = [];
    }

    get count() { return this._list.length; }

    clear() { this._list.length = 0; }

    /** Shift every live particle by (dx,dy) px. Lets a camera-scrolling game
        keep screen-space particles pinned to world points (call each frame
        with the camera's screen delta). */
    shiftAll(dx, dy) { if (!dx && !dy) return; const l = this._list; for (let i = 0; i < l.length; i++) { l[i].x += dx; l[i].y += dy; } }

    /** Emit `count` particles around (x,y) using a config of ranges. */
    emit(cfg) {
      const n = cfg.count || 10;
      for (let i = 0; i < n; i++) {
        if (this._list.length >= this._max) break;
        const speed = rand(cfg.speedMin != null ? cfg.speedMin : 40,
                           cfg.speedMax != null ? cfg.speedMax : 220);
        let angle;
        if (cfg.angleMin != null) angle = rand(cfg.angleMin, cfg.angleMax);
        else angle = rand(0, Math.PI * 2);
        const life = rand(cfg.lifeMin != null ? cfg.lifeMin : 0.4,
                          cfg.lifeMax != null ? cfg.lifeMax : 0.9);
        const colors = cfg.colors || [cfg.color || "#ffffff"];
        this._list.push({
          x: (cfg.x || 0) + rand(-(cfg.spread || 0), cfg.spread || 0),
          y: (cfg.y || 0) + rand(-(cfg.spreadY || 0), cfg.spreadY || 0),
          vx: Math.cos(angle) * speed + (cfg.vx || 0),
          vy: Math.sin(angle) * speed + (cfg.vy || 0),
          life: life,
          max: life,
          size: rand(cfg.sizeMin != null ? cfg.sizeMin : 2,
                     cfg.sizeMax != null ? cfg.sizeMax : 5),
          color: colors[(Math.random() * colors.length) | 0],
          gravity: cfg.gravity != null ? cfg.gravity : 0,
          drag: cfg.drag != null ? cfg.drag : 0.0,
          spin: rand(-(cfg.spin || 0), cfg.spin || 0),
          rot: rand(0, Math.PI * 2),
          shape: cfg.shape || "square",
          fade: cfg.fade !== false,
          shrink: cfg.shrink !== false,
          glow: !!cfg.glow
        });
      }
    }

    update(dtMs) {
      const dt = dtMs / 1000;
      const list = this._list;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        if (p.drag) {
          const d = Math.max(0, 1 - p.drag * dt);
          p.vx *= d; p.vy *= d;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
    }

    render(ctx) {
      const list = this._list;
      if (!list.length) return;
      const TAU = Math.PI * 2;
      ctx.save();
      // PERF: per-particle ctx.shadowBlur is a framerate killer (it re-rasterizes a
      // blurred copy of every fill). We drop it entirely and get the glow from
      // additive blending instead — a faint halo circle + bright core, both cheap
      // fills. We also render in TWO PASSES (normal, then glow) so the composite
      // mode flips twice per frame rather than once per particle.
      ctx.shadowBlur = 0;

      // ---- pass 1: normal particles (source-over) ----
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < list.length; i++) { const p = list[i]; if (p.glow) continue; this._paint(ctx, p, false, TAU); }

      // ---- pass 2: glow particles (additive bloom, no shadowBlur) ----
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < list.length; i++) { const p = list[i]; if (!p.glow) continue; this._paint(ctx, p, true, TAU); }

      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    _paint(ctx, p, glow, TAU) {
      const t = p.life / p.max;              // 1 -> 0
      const alpha = p.fade ? Math.max(0, Math.min(1, t)) : 1;
      if (alpha <= 0) return;
      const size = p.shrink ? p.size * (0.25 + 0.75 * t) : p.size;
      if (size <= 0.2) return;
      ctx.fillStyle = p.color;
      if (p.shape === "circle") {
        if (glow) {   // soft additive halo (replaces shadowBlur)
          ctx.globalAlpha = alpha * 0.28;
          ctx.beginPath(); ctx.arc(p.x, p.y, size * 2.1, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill();
      } else {
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-size, -size, size * 2, size * 2);
        ctx.restore();
      }
    }
  }

  Arcade.ParticleSystem = ParticleSystem;
})(window.Arcade = window.Arcade || {});
