/* =========================================================
   Space Pinball renderer. Draw methods work in the table's LOGICAL
   coordinates — the game applies the fit transform before calling.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function hexToRgb(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n = parseInt(h.slice(0, 6), 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function rgba(hex, a) { if (typeof hex !== "string" || hex[0] !== "#") return hex; const c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }

  class Renderer {
    constructor() { this.w = 0; this.h = 0; this.stars = []; }
    resize(w, h) {
      this.w = w; this.h = h;
      const n = Math.round((w * h) / 12000); this.stars = [];
      for (let i = 0; i < n; i++) this.stars.push({ x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.7, p: Math.random() * 6.28 });
    }
    _glow(ctx, theme, color, amt) { if (theme.effects.glow) { ctx.shadowBlur = amt; ctx.shadowColor = color; } else ctx.shadowBlur = 0; }

    drawBackground(ctx, theme, now) {
      const w = this.w, h = this.h, p = theme.palette;
      if (theme.effects.bgAnim) { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      else { ctx.fillStyle = p.bg1; ctx.fillRect(0, 0, w, h); }
      const t = now / 1000;
      ctx.save();
      for (let i = 0; i < this.stars.length; i++) { const s = this.stars[i]; ctx.globalAlpha = (0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 * s.z + s.p))) * s.z; ctx.fillStyle = p.star; const sz = s.z * 1.6; ctx.fillRect(s.x, s.y, sz, sz); }
      ctx.restore();
    }

    drawPlayfield(ctx, theme, PW, PH) {
      const p = theme.palette;
      ctx.save();
      ctx.fillStyle = p.table;
      ctx.fillRect(0, 0, PW, PH);
      ctx.restore();
    }

    drawWall(ctx, theme, s) {
      const p = theme.palette;
      ctx.save();
      this._glow(ctx, theme, p.wall, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = p.wall; ctx.lineWidth = (s.thick || 2) * 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.restore();
    }

    drawSling(ctx, theme, s, now) {
      const p = theme.palette, hot = s.hit > 0;
      ctx.save();
      this._glow(ctx, theme, p.sling, theme.effects.glow ? 12 : 0);
      ctx.strokeStyle = hot ? p.bumperHit : p.sling; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.restore();
    }

    drawTarget(ctx, theme, t) {
      if (t.down) return;
      const p = theme.palette, col = t.hit > 0 ? p.bumperHit : p.accent;
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(t.x, t.y1); ctx.lineTo(t.x, t.y2); ctx.stroke();
      ctx.restore();
    }

    drawBumper(ctx, theme, b) {
      const p = theme.palette, hot = b.hit > 0, col = hot ? p.bumperHit : p.bumper;
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 16 : 0);
      const g = ctx.createRadialGradient(b.x, b.y - b.r * 0.3, b.r * 0.2, b.x, b.y, b.r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, col); g.addColorStop(1, rgba(col, 0.25));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (hot ? 1.12 : 1), 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba("#ffffff", 0.6); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.55, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    drawFlipper(ctx, theme, f) {
      const p = theme.palette;
      const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
      ctx.save();
      this._glow(ctx, theme, p.flipper, theme.effects.glow ? 12 : 0);
      ctx.strokeStyle = p.flipper; ctx.lineWidth = f.thick * 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = p.flipper; ctx.beginPath(); ctx.arc(f.px, f.py, f.thick * 1.1, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawPlunger(ctx, theme, x, yTop, charge) {
      const p = theme.palette;
      ctx.save();
      const top = yTop + charge * 26;
      ctx.strokeStyle = p.plunger; ctx.lineWidth = 10; ctx.lineCap = "round";
      this._glow(ctx, theme, p.plunger, theme.effects.glow ? 8 : 0);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + 22); ctx.stroke();
      ctx.restore();
    }

    drawBall(ctx, theme, ball, trail) {
      const p = theme.palette;
      ctx.save();
      if (theme.effects.trail && trail) {
        for (let i = 0; i < trail.length; i++) { const t = trail[i], a = (i / trail.length) * 0.4; ctx.globalAlpha = a; ctx.fillStyle = p.ball; ctx.beginPath(); ctx.arc(t.x, t.y, ball.r * (0.4 + 0.5 * (i / trail.length)), 0, 6.2832); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      this._glow(ctx, theme, p.ball, theme.effects.glow ? 14 : 0);
      const g = ctx.createRadialGradient(ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.1, ball.x, ball.y, ball.r);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, p.ball); g.addColorStop(1, p.ballShade);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawHUD(ctx, theme, data) {
      const p = theme.palette;
      ctx.save();
      ctx.fillStyle = p.text; ctx.textBaseline = "top";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 8 : 0);
      ctx.font = "800 26px " + theme.fonts.ui; ctx.textAlign = "left";
      ctx.fillText(String(data.score).toLocaleString(), 18, 14);
      ctx.shadowBlur = 0; ctx.font = "600 13px " + theme.fonts.ui; ctx.fillStyle = p.textDim; ctx.textAlign = "right";
      ctx.fillText("BALL  " + "●".repeat(Math.max(0, data.balls)), this.w - 18, 18);
      if (data.multiball) { ctx.fillStyle = p.accent; ctx.font = "800 13px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.fillText("MULTIBALL!", this.w / 2, 16); }
      ctx.restore();
    }

    drawMessage(ctx, theme, msg, now) {
      const p = theme.palette;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 14 : 0);
      ctx.fillStyle = p.text; ctx.font = "800 20px " + theme.fonts.ui;
      ctx.fillText(msg, this.w / 2, this.h * 0.78);
      ctx.restore();
    }

    drawScanlines(ctx, theme) {
      if (!theme.effects.scanlines) return;
      if (!this._scan) { const o = document.createElement("canvas"); o.width = 1; o.height = 3; const c = o.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 1, 1); this._scan = ctx.createPattern(o, "repeat"); }
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = this._scan; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    }
  }

  Arcade.Pinball = Arcade.Pinball || {};
  Arcade.Pinball.Renderer = Renderer;
})(window.Arcade = window.Arcade || {});
