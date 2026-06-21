/* =========================================================
   Missile Defense renderer — cities, batteries, missile trails,
   and big bloomy explosions.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function hexToRgb(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n = parseInt(h, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function rgba(hex, a) { if (typeof hex !== "string" || hex[0] !== "#") return hex; const c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }

  class Renderer {
    constructor() { this.w = 0; this.h = 0; this.groundY = 0; }
    _glow(ctx, theme, color, amt) { if (theme.effects.glow) { ctx.shadowBlur = amt; ctx.shadowColor = color; } else ctx.shadowBlur = 0; }

    drawBackground(ctx, theme, now, groundY) {
      const w = this.w, h = this.h, p = theme.palette;
      if (theme.effects.bgAnim) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      else { ctx.fillStyle = p.bg1; ctx.fillRect(0, 0, w, h); }
      // ground
      ctx.save();
      this._glow(ctx, theme, p.ground, theme.effects.glow ? 10 : 0);
      ctx.fillStyle = theme.effects.glow ? rgba(p.ground, 0.25) : rgba(p.ground, 0.4);
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.strokeStyle = p.ground; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
      ctx.restore();
    }

    drawCity(ctx, theme, x, alive) {
      const p = theme.palette, y = this.groundY;
      ctx.save();
      if (alive) {
        this._glow(ctx, theme, p.city, theme.effects.glow ? 12 : 0);
        ctx.fillStyle = p.city;
        const blocks = [[-14, 14, 6, 12], [-7, 18, 7, 16], [2, 20, 6, 20], [9, 16, 6, 14], [-20, 10, 6, 8]];
        for (const b of blocks) ctx.fillRect(x + b[0], y - b[3], b[2], b[3]);
      } else {
        ctx.fillStyle = p.rubble;
        for (let i = -16; i <= 12; i += 8) ctx.fillRect(x + i, y - 4, 6, 4);
      }
      ctx.restore();
    }

    drawBattery(ctx, theme, x, ammo, alive) {
      const p = theme.palette, y = this.groundY;
      ctx.save();
      if (alive) {
        this._glow(ctx, theme, p.battery, theme.effects.glow ? 12 : 0);
        ctx.fillStyle = p.battery;
        ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x - 8, y - 16); ctx.lineTo(x + 8, y - 16); ctx.lineTo(x + 16, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        // ammo dots
        ctx.fillStyle = p.ammo;
        for (let i = 0; i < ammo; i++) { const dx = -9 + (i % 5) * 4.5, dy = y - 6 - Math.floor(i / 5) * 4; ctx.fillRect(x + dx, dy, 3, 3); }
      } else {
        ctx.fillStyle = p.rubble; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x, y - 6); ctx.lineTo(x + 14, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    drawEnemy(ctx, theme, m) {
      const p = theme.palette;
      ctx.save();
      this._glow(ctx, theme, p.enemy, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = p.enemy; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.fillStyle = p.enemyHead; this._glow(ctx, theme, p.enemy, theme.effects.glow ? 12 : 0);
      ctx.beginPath(); ctx.arc(m.x, m.y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawInterceptor(ctx, theme, it) {
      if (theme.missileStyle === "rocket") { this._rocket(ctx, theme, it); return; }
      const p = theme.palette;
      ctx.save();
      this._glow(ctx, theme, p.interceptor, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = rgba(p.interceptor, 0.7); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(it.bx, it.by); ctx.lineTo(it.x, it.y); ctx.stroke();
      ctx.fillStyle = p.interceptor;
      ctx.beginPath(); ctx.arc(it.x, it.y, 2.5, 0, Math.PI * 2); ctx.fill();
      // target marker
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba(p.target, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(it.tx - 4, it.ty - 4); ctx.lineTo(it.tx + 4, it.ty + 4); ctx.moveTo(it.tx + 4, it.ty - 4); ctx.lineTo(it.tx - 4, it.ty + 4); ctx.stroke();
      ctx.restore();
    }

    _rocket(ctx, theme, it) {
      const p = theme.palette;
      // faint smoke trail back to the launcher
      ctx.save();
      ctx.strokeStyle = rgba(p.interceptor, 0.22); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(it.bx, it.by); ctx.lineTo(it.x, it.y); ctx.stroke();
      ctx.restore();
      // target marker
      ctx.save(); ctx.strokeStyle = rgba(p.target, 0.45); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(it.tx - 4, it.ty - 4); ctx.lineTo(it.tx + 4, it.ty + 4); ctx.moveTo(it.tx + 4, it.ty - 4); ctx.lineTo(it.tx - 4, it.ty + 4); ctx.stroke();
      ctx.restore();
      // missile body, nose, fins, exhaust — oriented along velocity
      const ang = Math.atan2(it.vy, it.vx), L = 8, W = 3;
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(ang);
      // exhaust plume (flickering)
      const fl = 0.8 + Math.random() * 0.7;
      this._glow(ctx, theme, p.exhaust, theme.effects.glow ? 16 : 0);
      const g = ctx.createLinearGradient(-L, 0, -L - 16 * fl, 0);
      g.addColorStop(0, p.exhaust2); g.addColorStop(0.45, p.exhaust); g.addColorStop(1, rgba(p.exhaust, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-L, -W * 0.75); ctx.lineTo(-L - 16 * fl, 0); ctx.lineTo(-L, W * 0.75); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      // fins
      ctx.fillStyle = p.textDim;
      ctx.beginPath(); ctx.moveTo(-L, -W); ctx.lineTo(-L - 4, -W - 3); ctx.lineTo(-L + 3, -W); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-L, W); ctx.lineTo(-L - 4, W + 3); ctx.lineTo(-L + 3, W); ctx.closePath(); ctx.fill();
      // body
      ctx.fillStyle = p.body;
      ctx.beginPath(); ctx.moveTo(L - 2, -W); ctx.lineTo(-L, -W); ctx.lineTo(-L, W); ctx.lineTo(L - 2, W); ctx.closePath(); ctx.fill();
      // nose cone (red tip)
      ctx.fillStyle = p.enemy;
      ctx.beginPath(); ctx.moveTo(L + 5, 0); ctx.lineTo(L - 2, -W); ctx.lineTo(L - 2, W); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawExplosion(ctx, theme, ex) {
      const p = theme.palette;
      ctx.save();
      const a = Math.max(0, ex.r / ex.maxR);
      if (theme.effects.glow) { ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 24; ctx.shadowColor = p.blast; }
      const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, Math.max(1, ex.r));
      g.addColorStop(0, rgba("#ffffff", 0.9 * a));
      g.addColorStop(0.5, rgba(p.blast, 0.7 * a));
      g.addColorStop(1, rgba(p.blast, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex.x, ex.y, Math.max(1, ex.r), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawCrosshair(ctx, theme, x, y) {
      const p = theme.palette;
      ctx.save();
      this._glow(ctx, theme, p.crosshair, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = p.crosshair; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 14); ctx.stroke();
      ctx.restore();
    }

    drawHUD(ctx, theme, data) {
      const p = theme.palette;
      ctx.save();
      ctx.fillStyle = p.text; ctx.textBaseline = "top";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 8 : 0);
      ctx.font = "800 24px " + theme.fonts.ui; ctx.textAlign = "left";
      ctx.fillText(String(data.score).padStart(6, "0"), 18, 14);
      ctx.shadowBlur = 0; ctx.font = "600 13px " + theme.fonts.ui; ctx.fillStyle = p.textDim;
      ctx.textAlign = "right";
      ctx.fillText("WAVE " + data.wave + "   CITIES " + data.cities, this.w - 18, 18);
      ctx.restore();
    }

    drawScanlines(ctx, theme) {
      if (!theme.effects.scanlines) return;
      if (!this._scan) { const o = document.createElement("canvas"); o.width = 1; o.height = 3; const c = o.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 1, 1); this._scan = ctx.createPattern(o, "repeat"); }
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = this._scan; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    }
  }

  Arcade.Missile = Arcade.Missile || {};
  Arcade.Missile.Renderer = Renderer;
})(window.Arcade = window.Arcade || {});
