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

    // faint inlane/outlane floor lights + labels — the "channels behind the flippers"
    drawLanes(ctx, theme, lanes) {
      const p = theme.palette;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const l of lanes) {
        const col = l.lit ? p.rollOn : (p.rollOffc || p.lane);
        ctx.fillStyle = rgba(col, l.lit ? 0.22 : 0.12);
        ctx.fillRect(l.x, l.y, l.w, l.h);
        ctx.strokeStyle = rgba(col, l.lit ? 0.8 : 0.3); ctx.lineWidth = 1.5; ctx.strokeRect(l.x, l.y, l.w, l.h);
        ctx.fillStyle = rgba(col, l.lit ? 0.95 : 0.4); ctx.font = "700 9px " + theme.fonts.ui;
        ctx.fillText(l.kind === "in" ? "IN" : "OUT", l.x + l.w / 2, l.y + 11);
      }
      ctx.restore();
    }

    drawSling(ctx, theme, s, now) {
      const p = theme.palette, hot = s.hit > 0;
      ctx.save();
      this._glow(ctx, theme, p.sling, theme.effects.glow ? 12 : 0);
      ctx.strokeStyle = hot ? p.bumperHit : p.sling; ctx.lineWidth = hot ? 9 : 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      ctx.restore();
    }

    drawTarget(ctx, theme, t) {
      if (t.down) return;
      const p = theme.palette, col = t.hit > 0 ? p.bumperHit : p.accent;
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath();
      if (t.vert) { ctx.moveTo(t.x - 11, t.y1); ctx.lineTo(t.x + 11, t.y1); }
      else { ctx.moveTo(t.x, t.y1); ctx.lineTo(t.x, t.y2); }
      ctx.stroke();
      ctx.restore();
    }

    drawStandup(ctx, theme, s) {
      const p = theme.palette, col = s.hit > 0 ? p.bumperHit : (s.lit ? p.standupLit : p.standup);
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 10 : 0);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = rgba("#000", 0.35); ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.4, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawSpinner(ctx, theme, s, now) {
      const p = theme.palette;
      ctx.save();
      // posts top & bottom
      this._glow(ctx, theme, p.post, theme.effects.glow ? 6 : 0);
      ctx.fillStyle = p.post; ctx.beginPath(); ctx.arc(s.x, s.y1, 3, 0, 6.2832); ctx.arc(s.x, s.y2, 3, 0, 6.2832); ctx.fill();
      // spinning blade (width oscillates with spin angle to fake rotation)
      const ww = Math.abs(Math.cos(s.ang)) * 12 + 1.5, hot = s.hit > 0;
      this._glow(ctx, theme, p.spinner, theme.effects.glow ? 12 : 0);
      ctx.fillStyle = hot ? p.bumperHit : p.spinner;
      ctx.fillRect(s.x - ww / 2, s.y1 + 2, ww, (s.y2 - s.y1) - 4);
      ctx.restore();
    }

    drawTunnel(ctx, theme, tn, now) {
      const p = theme.palette;
      // entrance portal (swirl)
      ctx.save(); ctx.translate(tn.ex, tn.ey);
      this._glow(ctx, theme, p.tunnel, theme.effects.glow ? 18 : 0);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, tn.r);
      g.addColorStop(0, "#000"); g.addColorStop(0.55, rgba(p.tunnel, 0.85)); g.addColorStop(1, rgba(p.tunnel, 0.15 + tn.glow * 0.5));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, tn.r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = p.tunnel; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, tn.r * (0.45 + i * 0.22), now / 400 + i, now / 400 + i + 4.4); ctx.stroke(); ctx.rotate(0.5); }
      ctx.restore();
      // exit portal
      ctx.save(); ctx.translate(tn.outx, tn.outy);
      this._glow(ctx, theme, p.tunnelExit, theme.effects.glow ? 14 : 0);
      ctx.strokeStyle = rgba(p.tunnelExit, 0.6 + tn.glow * 0.4); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = rgba(p.tunnelExit, 0.18 + tn.glow * 0.5); ctx.beginPath(); ctx.arc(0, 0, 12, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawLock(ctx, theme, lk, now) {
      const p = theme.palette, on = lk.lit || lk.glow > 0;
      ctx.save(); ctx.translate(lk.x, lk.y);
      this._glow(ctx, theme, p.lock, theme.effects.glow ? (on ? 18 : 8) : 0);
      ctx.fillStyle = "#05080c"; ctx.beginPath(); ctx.arc(0, 0, lk.r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = on ? p.lock : rgba(p.lock, 0.5); ctx.lineWidth = on ? 3 : 2;
      ctx.beginPath(); ctx.arc(0, 0, lk.r, 0, 6.2832); ctx.stroke();
      // lock pips
      ctx.fillStyle = p.lock; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowBlur = 0;
      ctx.font = "800 11px " + theme.fonts.ui; ctx.fillText(on ? "LOCK" : (lk.count || ""), 0, 0);
      ctx.restore();
    }

    drawMagnet(ctx, theme, mg, now) {
      if (mg.active <= 0) return;
      const p = theme.palette;
      ctx.save(); ctx.translate(mg.x, mg.y);
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.5 + 0.5 * Math.sin(now / 120);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, mg.r);
      g.addColorStop(0, rgba(p.magnet, 0.16 + pulse * 0.14)); g.addColorStop(1, rgba(p.magnet, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, mg.r, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = rgba(p.magnet, 0.4); ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const rr = mg.r * (0.4 + 0.2 * i) * (0.85 + 0.15 * Math.sin(now / 200 + i)); ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.stroke(); }
      ctx.restore();
    }

    drawKickback(ctx, theme, kb, now) {
      const p = theme.palette, on = kb.charged;
      ctx.save(); ctx.translate(kb.x, kb.y);
      this._glow(ctx, theme, on ? p.kick : p.textDim, theme.effects.glow ? (on ? 12 : 4) : 0);
      ctx.fillStyle = on ? p.kick : rgba(p.textDim, 0.5);
      // up-arrow
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 2); ctx.lineTo(2, 2); ctx.lineTo(2, 8); ctx.lineTo(-2, 8); ctx.lineTo(-2, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
      if (on && kb.glow > 0) { ctx.globalAlpha = kb.glow; ctx.strokeStyle = p.kick; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.2832); ctx.stroke(); }
      ctx.restore();
    }

    drawRamp(ctx, theme, path, entry, now) {
      const p = theme.palette;
      ctx.save();
      // habitrail: two faint guide rails along the path
      ctx.strokeStyle = rgba(p.ramp, 0.28); ctx.lineWidth = 10; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
      ctx.strokeStyle = rgba(p.ramp, 0.5); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
      // entrance scoop
      this._glow(ctx, theme, p.ramp, theme.effects.glow ? (10 + entry.glow * 16) : 0);
      ctx.strokeStyle = rgba(p.ramp, 0.7 + entry.glow * 0.3); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(entry.x, entry.y, entry.r, Math.PI * 0.6, Math.PI * 2.0); ctx.stroke();
      ctx.restore();
    }

    drawRollover(ctx, theme, w, now) {
      const p = theme.palette, on = w.lit;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      this._glow(ctx, theme, on ? p.rollOn : p.textDim, theme.effects.glow ? (on ? 12 : 0) : 0);
      ctx.strokeStyle = on ? p.rollOn : rgba(p.textDim, 0.6); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(w.x, w.y, 11, 7, 0, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = on ? p.rollOn : rgba(p.textDim, 0.7); ctx.font = "800 11px " + theme.fonts.ui; ctx.shadowBlur = 0;
      ctx.fillText(w.ch, w.x, w.y + 0.5);
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

    drawReactor(ctx, theme, rc, now) {
      const p = theme.palette, hot = rc.lit > 0, accent = p.accent;
      ctx.save();
      const n = 16, rr = rc.r + 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.2832 + now / 1500;
        const lx = rc.x + Math.cos(a) * rr, ly = rc.y + Math.sin(a) * rr;
        const on = ((i + Math.floor(now / 110)) % 3 === 0);
        ctx.fillStyle = on ? "#ffd24a" : rgba(accent, 0.45);
        ctx.beginPath(); ctx.arc(lx, ly, on ? 3 : 1.8, 0, 6.2832); ctx.fill();
      }
      this._glow(ctx, theme, accent, theme.effects.glow ? 22 : 0);
      const g = ctx.createRadialGradient(rc.x, rc.y, 2, rc.x, rc.y, rc.r * (hot ? 1.15 : 1));
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, accent); g.addColorStop(1, rgba(accent, 0.15));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rc.x, rc.y, rc.r * (hot ? 1.12 : 1), 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba("#ffffff", 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rc.x, rc.y, rc.r * 0.5, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    drawFlipper(ctx, theme, f) {
      const p = theme.palette;
      const tx = f.px + Math.cos(f.angle) * f.len, ty = f.py + Math.sin(f.angle) * f.len;
      ctx.save();
      this._glow(ctx, theme, p.flipper, theme.effects.glow ? 12 : 0);
      // tapered bat: thick at pivot, thinner at tip
      ctx.strokeStyle = p.flipper; ctx.lineCap = "round";
      ctx.lineWidth = f.thick * 2.2; ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(f.px + (tx - f.px) * 0.6, f.py + (ty - f.py) * 0.6); ctx.stroke();
      ctx.lineWidth = f.thick * 1.4; ctx.beginPath(); ctx.moveTo(f.px + (tx - f.px) * 0.55, f.py + (ty - f.py) * 0.55); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = p.flipper; ctx.beginPath(); ctx.arc(f.px, f.py, f.thick * 1.2, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = rgba("#000", 0.3); ctx.beginPath(); ctx.arc(f.px, f.py, f.thick * 0.5, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawPlunger(ctx, theme, x, yTop, charge) {
      const p = theme.palette;
      ctx.save();
      const top = yTop + charge * 26;
      ctx.strokeStyle = p.plunger; ctx.lineWidth = 10; ctx.lineCap = "round";
      this._glow(ctx, theme, p.plunger, theme.effects.glow ? 8 : 0);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + 22); ctx.stroke();
      if (charge > 0) { ctx.shadowBlur = 0; ctx.strokeStyle = rgba(charge > 0.8 ? p.danger : p.plunger, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 9, 612); ctx.lineTo(x - 9, 612 - charge * 70); ctx.stroke(); }
      ctx.restore();
    }

    drawBall(ctx, theme, ball, trail) {
      const p = theme.palette;
      ctx.save();
      if (ball.mode === "hold") { ctx.globalAlpha = 0.9; }
      if (theme.effects.trail && trail && ball.mode !== "hold") {
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
      ctx.shadowBlur = 0; ctx.textAlign = "left"; ctx.font = "700 12px " + theme.fonts.ui; ctx.fillStyle = p.textDim;
      let line = "RANK " + (data.rank || "CADET");
      if (data.mult > 1) line += "   ×" + data.mult;
      if (data.bonusX > 1) line += "   BONUS×" + data.bonusX;
      if (data.lock > 0) line += "   LOCK " + data.lock + "/3";
      ctx.fillText(line, 18, 44);
      if (data.mission) {
        const m = data.mission, cx = this.w / 2;
        ctx.textAlign = "center"; ctx.fillStyle = p.accent; ctx.font = "800 13px " + theme.fonts.ui;
        ctx.fillText(m.name + "  " + m.prog + "/" + m.goal, cx, 14);
        const frac = Math.max(0, Math.min(1, m.t / (m.tMax || 30)));
        ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(cx - 70, 33, 140, 4);
        ctx.fillStyle = frac < 0.25 ? (p.danger || "#ff5a6e") : p.accent; ctx.fillRect(cx - 70, 33, 140 * frac, 4);
      } else if (data.multiball) { ctx.fillStyle = p.accent; ctx.font = "800 13px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.fillText("MULTIBALL!", this.w / 2, 16); }
      ctx.restore();
    }

    drawMessage(ctx, theme, msg, now) {
      const p = theme.palette;
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 14 : 0);
      ctx.fillStyle = p.text; ctx.font = "800 20px " + theme.fonts.ui;
      ctx.fillText(msg, this.w / 2, this.h * 0.8);
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
