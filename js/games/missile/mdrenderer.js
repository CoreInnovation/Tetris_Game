/* =========================================================
   Missile Defense renderer — cities, batteries, missile trails,
   and big bloomy explosions.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function hexToRgb(hex) { let h = hex.replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n = parseInt(h, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function rgba(hex, a) { if (typeof hex !== "string" || hex[0] !== "#") return hex; const c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }
  function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

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

    drawBattery(ctx, theme, x, alive) {
      const p = theme.palette, y = this.groundY;
      ctx.save();
      if (alive) {
        this._glow(ctx, theme, p.battery, theme.effects.glow ? 12 : 0);
        ctx.fillStyle = p.battery;
        ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x - 8, y - 16); ctx.lineTo(x + 8, y - 16); ctx.lineTo(x + 16, y); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = p.rubble; ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x, y - 6); ctx.lineTo(x + 14, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    drawEnemy(ctx, theme, m) {
      const p = theme.palette;
      const slowed = m.slow > 0;
      const col = slowed ? "#bfeaff" : (m.zig ? "#c06bff" : p.enemy), head = slowed ? "#eaffff" : (m.zig ? "#e6c6ff" : p.enemyHead);
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
      ctx.fillStyle = head; this._glow(ctx, theme, col, theme.effects.glow ? 12 : 0);
      ctx.beginPath(); ctx.arc(m.x, m.y, slowed ? 3.2 : 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawInterceptor(ctx, theme, it) {
      if (it.mode === "arc") { this._arcShell(ctx, theme, it); return; }
      if (it.mode === "home") { this._hornet(ctx, theme, it); return; }
      if (it.weapon === "missile" || theme.missileStyle === "rocket") { this._rocket(ctx, theme, it); return; }
      const p = theme.palette, col = it.color || p.interceptor;
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(it.bx, it.by); ctx.lineTo(it.x, it.y); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(it.x, it.y, 2.5, 0, Math.PI * 2); ctx.fill();
      // target marker
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba(p.target, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(it.tx - 4, it.ty - 4); ctx.lineTo(it.tx + 4, it.ty + 4); ctx.moveTo(it.tx + 4, it.ty - 4); ctx.lineTo(it.tx - 4, it.ty + 4); ctx.stroke();
      ctx.restore();
    }

    _rocket(ctx, theme, it) {
      const p = theme.palette;
      // faint smoke trail back to the launcher (straight-flight rockets only)
      if (!it.guided) {
        ctx.save();
        ctx.strokeStyle = rgba(p.interceptor, 0.22); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(it.bx, it.by); ctx.lineTo(it.x, it.y); ctx.stroke();
        ctx.restore();
      }
      // target marker
      ctx.save(); ctx.strokeStyle = rgba(p.target, 0.45); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(it.tx - 4, it.ty - 4); ctx.lineTo(it.tx + 4, it.ty + 4); ctx.moveTo(it.tx + 4, it.ty - 4); ctx.lineTo(it.tx - 4, it.ty + 4); ctx.stroke();
      ctx.restore();
      // missile body, nose, fins, exhaust — oriented along velocity
      const ang = Math.atan2(it.vy, it.vx), L = 8, W = 3;
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(ang);
      // exhaust plume (flickering) — only once the motor has ignited
      if (it.ignited !== false) {
        const fl = 0.8 + Math.random() * 0.7;
        this._glow(ctx, theme, p.exhaust, theme.effects.glow ? 16 : 0);
        const g = ctx.createLinearGradient(-L, 0, -L - 16 * fl, 0);
        g.addColorStop(0, p.exhaust2); g.addColorStop(0.45, p.exhaust); g.addColorStop(1, rgba(p.exhaust, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-L, -W * 0.75); ctx.lineTo(-L - 16 * fl, 0); ctx.lineTo(-L, W * 0.75); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      }
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

    _arcShell(ctx, theme, it) {
      const col = it.color || theme.palette.interceptor;
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 6 : 0);
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2; ctx.beginPath();
      const N = 16;
      for (let i = 0; i <= N; i++) { const u = it.t * (i / N), iu = 1 - u; const x = iu * iu * it.bx + 2 * iu * u * it.p1x + u * u * it.tx, y = iu * iu * it.by + 2 * iu * u * it.p1y + u * u * it.ty; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.x, it.y, 3, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba(theme.palette.target, 0.5); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(it.tx - 4, it.ty - 4); ctx.lineTo(it.tx + 4, it.ty + 4); ctx.moveTo(it.tx + 4, it.ty - 4); ctx.lineTo(it.tx - 4, it.ty + 4); ctx.stroke();
      ctx.restore();
    }

    _hornet(ctx, theme, it) {
      const col = it.color || "#9aff6a", ang = Math.atan2(it.vy, it.vx);
      ctx.save();
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x - Math.cos(ang) * 8, it.y - Math.sin(ang) * 8); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(it.x, it.y, 2.6, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    drawZap(ctx, theme, z) {
      const a = Math.max(0, z.life / 0.22);
      ctx.save();
      if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = z.color; }
      ctx.strokeStyle = rgba(z.color, a); ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.beginPath();
      for (let i = 0; i < z.points.length - 1; i++) {
        const p0 = z.points[i], p1 = z.points[i + 1], segs = 4; ctx.moveTo(p0.x, p0.y);
        for (let k = 1; k <= segs; k++) { const t = k / segs, jx = (k < segs) ? (Math.random() * 12 - 6) : 0, jy = (k < segs) ? (Math.random() * 12 - 6) : 0; ctx.lineTo(p0.x + (p1.x - p0.x) * t + jx, p0.y + (p1.y - p0.y) * t + jy); }
      }
      ctx.stroke(); ctx.restore();
    }

    drawBlackhole(ctx, theme, bh) {
      const t = Math.min(1, bh.t / bh.dur), R = bh.range * (0.34 + 0.16 * t);
      ctx.save(); ctx.translate(bh.x, bh.y);
      if (theme.effects.glow) { ctx.shadowBlur = 20; ctx.shadowColor = bh.color; }
      ctx.strokeStyle = bh.color; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(0, 0, R * (0.5 + i * 0.26), 0, Math.PI * 1.5); ctx.stroke(); ctx.rotate(0.6 + t * 2); }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.fillStyle = "#05030a"; ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = rgba(bh.color, 0.85); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    drawUfo(ctx, theme, u, now) {
      const col = theme.effects.glow ? "#46f0c0" : "#9affd0", r = u.radius;
      ctx.save(); ctx.translate(u.x, u.y);
      this._glow(ctx, theme, col, theme.effects.glow ? 14 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillStyle = rgba(col, 0.12);
      ctx.save(); ctx.scale(1, 0.45); ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(0, -r * 0.12, r * 0.5, Math.PI, 0); ctx.stroke();
      ctx.shadowBlur = 0; const on = Math.floor(now / 150) % 2 === 0; ctx.fillStyle = on ? "#ffffff" : rgba(col, 0.5);
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * r * 0.5, r * 0.18, 1.8, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    }

    drawExplosion(ctx, theme, ex) {
      const col = ex.color || theme.palette.blast;
      ctx.save();
      const a = Math.max(0, ex.r / ex.maxR);
      if (theme.effects.glow) { ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 24; ctx.shadowColor = col; }
      const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, Math.max(1, ex.r));
      g.addColorStop(0, rgba("#ffffff", 0.9 * a));
      g.addColorStop(0.5, rgba(col, 0.7 * a));
      g.addColorStop(1, rgba(col, 0));
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

    // simple vector glyph per weapon (used in pods and the arsenal bar)
    drawWeaponIcon(ctx, id, cx, cy, s, color) {
      const r = s * 0.5;
      ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.2, s * 0.12); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (id === "interceptor") { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.7, cy + r * 0.7); ctx.lineTo(cx - r * 0.7, cy + r * 0.7); ctx.closePath(); ctx.fill(); }
      else if (id === "missile") { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.4, cy); ctx.lineTo(cx + r * 0.4, cy + r * 0.5); ctx.lineTo(cx - r * 0.4, cy + r * 0.5); ctx.lineTo(cx - r * 0.4, cy); ctx.closePath(); ctx.fill(); }
      else if (id === "artillery") { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.55, cy - r * 0.25); ctx.lineTo(cx + r * 0.55, cy + r * 0.6); ctx.lineTo(cx - r * 0.55, cy + r * 0.6); ctx.lineTo(cx - r * 0.55, cy - r * 0.25); ctx.closePath(); ctx.fill(); }
      else if (id === "railgun") { ctx.beginPath(); ctx.moveTo(cx + r * 0.35, cy - r); ctx.lineTo(cx - r * 0.4, cy + r * 0.1); ctx.lineTo(cx + r * 0.05, cy + r * 0.1); ctx.lineTo(cx - r * 0.35, cy + r); ctx.lineTo(cx + r * 0.5, cy - r * 0.15); ctx.lineTo(cx, cy - r * 0.15); ctx.closePath(); ctx.fill(); }
      else if (id === "flak") { ctx.beginPath(); ctx.arc(cx - r * 0.6, cy + r * 0.35, s * 0.13, 0, 6.2832); ctx.arc(cx, cy - r * 0.45, s * 0.13, 0, 6.2832); ctx.arc(cx + r * 0.6, cy + r * 0.35, s * 0.13, 0, 6.2832); ctx.fill(); }
      else if (id === "cluster") { ctx.beginPath(); ctx.arc(cx, cy, s * 0.13, 0, 6.2832); ctx.fill(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, s * 0.1, 0, 6.2832); ctx.fill(); } }
      else if (id === "cryo") { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); } }
      else if (id === "hornets") { for (let i = -1; i <= 1; i++) { const ox = cx + i * r * 0.55; ctx.beginPath(); ctx.moveTo(ox - r * 0.22, cy + r * 0.3); ctx.lineTo(ox, cy - r * 0.2); ctx.lineTo(ox + r * 0.22, cy + r * 0.3); ctx.stroke(); } }
      else if (id === "tesla") { ctx.beginPath(); ctx.moveTo(cx + r * 0.3, cy - r); ctx.lineTo(cx - r * 0.25, cy - r * 0.05); ctx.lineTo(cx + r * 0.15, cy - r * 0.05); ctx.lineTo(cx - r * 0.35, cy + r); ctx.stroke(); }
      else if (id === "singularity") { ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, 6.2832); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    }

    drawWeaponBar(ctx, theme, chips) {
      const p = theme.palette;
      for (const c of chips) {
        const r = c.rect, col = c.color || p.interceptor;
        ctx.save();
        ctx.globalAlpha = c.locked ? 0.42 : 1;
        ctx.fillStyle = "rgba(10,14,22,0.72)"; rr(ctx, r.x, r.y, r.w, r.h, 6); ctx.fill();
        ctx.lineWidth = c.active ? 2.2 : 1;
        ctx.strokeStyle = c.active ? (c.overheated ? p.enemy : p.accent) : rgba(p.textDim, 0.5);
        rr(ctx, r.x, r.y, r.w, r.h, 6); ctx.stroke();
        ctx.globalAlpha = 1;
        if (c.locked) {
          ctx.fillStyle = p.textDim; ctx.font = "700 13px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("?", r.x + r.w / 2, r.y + r.h / 2 - 2);
        } else {
          this.drawWeaponIcon(ctx, c.id, r.x + 13, r.y + r.h / 2 - 3, 11, col);
          ctx.fillStyle = c.active ? p.text : p.textDim; ctx.font = "700 10px " + theme.fonts.ui; ctx.textAlign = "left"; ctx.textBaseline = "middle";
          if (r.w > 56) ctx.fillText(c.short, r.x + 24, r.y + r.h / 2 - 4);
          ctx.fillStyle = rgba(p.textDim, 0.85); ctx.font = "600 8px " + theme.fonts.ui; ctx.textAlign = "right";
          ctx.fillText(String(c.keyNum), r.x + r.w - 6, r.y + 8);
          const bw = r.w - 10, bx = r.x + 5, byb = r.y + r.h - 6;
          ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(bx, byb, bw, 3);
          ctx.fillStyle = c.overheated ? p.enemy : (c.heat > 0.7 ? "#ffb43a" : col);
          ctx.fillRect(bx, byb, bw * Math.min(1, c.heat), 3);
          if (c.active) {
            ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(bx, byb - 4, bw, 2);
            ctx.fillStyle = c.reloadFrac >= 1 ? p.accent : rgba(p.accent, 0.7);
            ctx.fillRect(bx, byb - 4, bw * Math.max(0, Math.min(1, c.reloadFrac)), 2);
          }
          if (c.overheated) { ctx.fillStyle = p.enemy; ctx.font = "700 8px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.fillText("COOL", r.x + r.w / 2, r.y + r.h / 2 + 6); }
        }
        ctx.restore();
      }
    }

    drawPowerup(ctx, theme, pu, now, weapon) {
      const p = theme.palette, r = pu.radius, pulse = 0.7 + 0.3 * Math.sin(now / 120);
      const col = (weapon && weapon.color) || p.powerup;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      this._glow(ctx, theme, col, theme.effects.glow ? 16 : 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillStyle = rgba(col, 0.18 * pulse);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      this.drawWeaponIcon(ctx, weapon ? weapon.id : "missile", 0, 0, r * 0.95, p.text);
      ctx.restore();
    }

    drawPeople(ctx, theme, cx, panic, now) {
      const p = theme.palette, gy = this.groundY;
      ctx.save();
      ctx.strokeStyle = p.person; ctx.fillStyle = p.person; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      const spots = [-17, 17];
      for (let k = 0; k < spots.length; k++) {
        const ph = now / (panic ? 90 : 340) + k * 2.1;
        const run = panic ? Math.sin(ph) * 5 : 0;
        const bob = panic ? Math.abs(Math.sin(ph * 2)) * 3 : Math.abs(Math.sin(now / 600 + k)) * 0.8;
        const x = cx + spots[k] + run, y = gy - 2 - bob;
        ctx.beginPath(); ctx.arc(x, y - 9, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.stroke();
        const stride = panic ? Math.sin(ph * 3) * 2.6 : 0.9;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - stride, y + 2); ctx.moveTo(x, y - 2); ctx.lineTo(x + stride, y + 2); ctx.stroke();
        if (panic) { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 3, y - 10); ctx.moveTo(x, y - 6); ctx.lineTo(x + 3, y - 10); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 2.5, y - 4); ctx.moveTo(x, y - 6); ctx.lineTo(x + 2.5, y - 4); ctx.stroke(); }
      }
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
