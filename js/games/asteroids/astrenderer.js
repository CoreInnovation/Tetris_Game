/* =========================================================
   Asteroids renderer — vector drawing with optional neon glow,
   a parallax starfield (modern), and a HUD.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function hexToRgb(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n = parseInt(h, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function rgba(hex, a) { if (typeof hex !== "string" || hex[0] !== "#") return hex; const c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }

  class Renderer {
    constructor() { this.w = 0; this.h = 0; this.stars = []; }

    resize(w, h) {
      this.w = w; this.h = h;
      const n = Math.round((w * h) / 9000);
      this.stars = [];
      for (let i = 0; i < n; i++) {
        this.stars.push({ x: Math.random() * w, y: Math.random() * h, z: 0.25 + Math.random() * 0.75, p: Math.random() * Math.PI * 2 });
      }
    }

    _glow(ctx, theme, color, amt) {
      if (theme.effects.glow) { ctx.shadowBlur = amt; ctx.shadowColor = color; } else { ctx.shadowBlur = 0; }
    }

    drawBackground(ctx, theme, now) {
      const w = this.w, h = this.h, p = theme.palette;
      if (theme.effects.bgAnim) {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else { ctx.fillStyle = p.bg1; ctx.fillRect(0, 0, w, h); }
      if (theme.effects.starfield && this.stars.length) {
        const t = now / 1000;
        ctx.save();
        for (let i = 0; i < this.stars.length; i++) {
          const s = this.stars[i];
          const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 * s.z + s.p));
          ctx.globalAlpha = tw * s.z;
          ctx.fillStyle = p.star;
          const sz = s.z * 1.8;
          ctx.fillRect(s.x, s.y, sz, sz);
        }
        ctx.restore();
      }
    }

    // draw a closed polygon from points [{x,y},...] in local space
    _poly(ctx, pts, x, y, rot, color, theme, glowAmt, fillA) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const px = pts[i].x, py = pts[i].y; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath();
      if (fillA) { ctx.fillStyle = rgba(color, fillA); ctx.fill(); }
      this._glow(ctx, theme, color, glowAmt || 12);
      ctx.strokeStyle = color; ctx.lineWidth = theme.lineWidth; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }

    drawShip(ctx, ship, theme, now, blink) {
      if (blink) return;
      const p = theme.palette, r = ship.radius;
      const pts = [ { x: r, y: 0 }, { x: -r * 0.7, y: -r * 0.7 }, { x: -r * 0.4, y: 0 }, { x: -r * 0.7, y: r * 0.7 } ];
      this._poly(ctx, pts, ship.x, ship.y, ship.angle, p.ship, theme, 14, theme.effects.glow ? 0.12 : 0);
      // thrust flame (flicker)
      if (ship.thrusting && (Math.floor(now / 40) % 2 === 0)) {
        const f = [ { x: -r * 0.45, y: -r * 0.32 }, { x: -r * 1.25, y: 0 }, { x: -r * 0.45, y: r * 0.32 } ];
        this._poly(ctx, f, ship.x, ship.y, ship.angle, p.thrust, theme, 16, 0.5);
      }
    }

    drawAsteroid(ctx, a, theme) {
      const pts = a.shape.map(s => ({ x: Math.cos(s.a) * s.r * a.radius, y: Math.sin(s.a) * s.r * a.radius }));
      this._poly(ctx, pts, a.x, a.y, a.angle, theme.palette.asteroid, theme, 12, theme.effects.glow ? 0.08 : 0);
    }

    drawBullet(ctx, b, theme) {
      const p = theme.palette;
      ctx.save();
      this._glow(ctx, theme, p.bullet, 12);
      ctx.fillStyle = p.bullet;
      ctx.beginPath(); ctx.arc(b.x, b.y, theme.effects.glow ? 3 : 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawUfo(ctx, u, theme) {
      const p = theme.palette, r = u.radius;
      ctx.save(); ctx.translate(u.x, u.y);
      this._glow(ctx, theme, p.ufo, 14);
      ctx.strokeStyle = p.ufo; ctx.lineWidth = theme.lineWidth; ctx.lineJoin = "round";
      if (theme.effects.glow) { ctx.fillStyle = rgba(p.ufo, 0.1); }
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(-r * 0.45, -r * 0.45); ctx.lineTo(r * 0.45, -r * 0.45); ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.45, r * 0.4); ctx.lineTo(-r * 0.45, r * 0.4); ctx.closePath();
      if (theme.effects.glow) ctx.fill();
      ctx.stroke();
      ctx.beginPath(); // dome
      ctx.moveTo(-r * 0.45, -r * 0.45); ctx.quadraticCurveTo(0, -r * 1.05, r * 0.45, -r * 0.45); ctx.stroke();
      ctx.restore();
    }

    drawHUD(ctx, theme, data) {
      const p = theme.palette;
      ctx.save();
      ctx.fillStyle = p.text; ctx.textBaseline = "top";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 8 : 0);
      ctx.font = "800 24px " + theme.fonts.ui; ctx.textAlign = "left";
      ctx.fillText(String(data.score).padStart(6, "0"), 18, 14);
      ctx.shadowBlur = 0;
      ctx.font = "600 13px " + theme.fonts.ui; ctx.fillStyle = p.textDim;
      ctx.textAlign = "right"; ctx.fillText("WAVE " + data.wave, this.w - 18, 18);
      // lives as little ships
      ctx.save();
      this._glow(ctx, theme, p.ship, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = p.ship; ctx.lineWidth = 2;
      for (let i = 0; i < data.lives; i++) {
        const x = 22 + i * 22, y = 52;
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 6, y + 7); ctx.lineTo(x + 6, y + 7); ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
      ctx.restore();
    }

    drawScanlines(ctx, theme) {
      if (!theme.effects.scanlines) return;
      if (!this._scan) { const o = document.createElement("canvas"); o.width = 1; o.height = 3; const c = o.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 1, 1); this._scan = ctx.createPattern(o, "repeat"); }
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = this._scan; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    }

    centerText(ctx, theme, text, sub, now) {
      const p = theme.palette;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 18 : 0);
      ctx.fillStyle = p.text; ctx.font = "800 40px " + theme.fonts.ui;
      ctx.fillText(text, this.w / 2, this.h / 2 - 10);
      if (sub) { ctx.shadowBlur = 0; ctx.fillStyle = p.textDim; ctx.font = "600 16px " + theme.fonts.ui; ctx.fillText(sub, this.w / 2, this.h / 2 + 28); }
      ctx.restore();
    }
  }

  Arcade.Asteroids = Arcade.Asteroids || {};
  Arcade.Asteroids.Renderer = Renderer;
})(window.Arcade = window.Arcade || {});
