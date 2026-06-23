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
      const p = theme.palette, TAU = Math.PI * 2, slowed = m.slow > 0, def = m.def || {}, kind = m.kind || "basic";
      const col = slowed ? "#bfeaff" : (def.color || p.enemy);
      const head = slowed ? "#eaffff" : (def.color || p.enemyHead);
      const sz = def.size || 2.6;
      ctx.save();
      if (kind === "serpent") {   // big glowing sine ribbon sampled along its fall path
        this._glow(ctx, theme, col, theme.effects.glow ? 16 : 0);
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        const N = 18, y0 = m.sy, y1 = m.cy;
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? "#eaffff" : col; ctx.lineWidth = pass ? 1.6 : 4;
          ctx.beginPath();
          for (let i = 0; i <= N; i++) { const yy = y0 + (y1 - y0) * (i / N), xx = Math.max(6, Math.min(this.w - 6, m.cx + Math.sin(yy * m.freq * 0.008 + m.phase) * m.amp)); if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
          ctx.stroke();
        }
        ctx.fillStyle = "#eaffff"; ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill();
        ctx.restore(); return;
      }
      // streak trail
      this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = (kind === "mimic" && !m.awake) ? "rgba(170,176,188,0.4)" : col; ctx.lineWidth = (kind === "behemoth") ? 3 : (kind === "dart") ? 1.5 : 2;
      ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
      // head per kind
      this._glow(ctx, theme, col, theme.effects.glow ? 12 : 0);
      ctx.fillStyle = head; ctx.strokeStyle = col;
      if (kind === "dart") { const a = Math.atan2(m.vy, m.vx); ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (kind === "drifter") { ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill(); ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(m.x + Math.cos(a) * sz, m.y + Math.sin(a) * sz); ctx.lineTo(m.x + Math.cos(a) * (sz + 4), m.y + Math.sin(a) * (sz + 4)); ctx.stroke(); } }
      else if (kind === "viper") { ctx.save(); ctx.translate(m.x, m.y); ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz, 0); ctx.lineTo(0, sz); ctx.lineTo(-sz, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (kind === "corkscrew") { ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "#e6c6ff"; ctx.beginPath(); ctx.arc(m.x, m.y, sz + 2.5, 0, TAU); ctx.stroke(); }
      else if (kind === "screamer") { const a = Math.atan2(m.vy, m.vx); ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 2, -sz * 0.6); ctx.lineTo(-sz * 2, sz * 0.6); ctx.closePath(); ctx.fill(); ctx.restore(); }
      else if (kind === "behemoth") { ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y, sz + 3, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(m.x, m.y, sz + 7, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (kind === "hydra") { ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill(); ctx.fillStyle = "#ffb0d8"; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * (TAU / 5); ctx.beginPath(); ctx.arc(m.x + Math.cos(a) * sz, m.y + Math.sin(a) * sz, 1.5, 0, TAU); ctx.fill(); } }
      else if (kind === "mimic") { if (!m.awake) { ctx.globalAlpha = 0.75; ctx.lineWidth = 1; ctx.strokeStyle = "#aab0bc"; ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; } else { ctx.fillStyle = "#ff5a5a"; ctx.beginPath(); ctx.arc(m.x, m.y, sz, 0, TAU); ctx.fill(); } }
      else { ctx.beginPath(); ctx.arc(m.x, m.y, slowed ? 3.2 : sz, 0, TAU); ctx.fill(); }
      ctx.restore();
    }

    drawInterceptor(ctx, theme, it) {
      if (it.mode === "arc") { this._arcShell(ctx, theme, it); return; }
      if (it.mode === "eject" || it.mode === "burn") { this._rocket(ctx, theme, it); return; }
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

    drawFire(ctx, theme, f, now) {
      const a = Math.max(0, 1 - f.t / f.dur);                 // fades as it burns out
      const flick = 0.82 + 0.18 * Math.sin(now / 60 + f.x);    // flame flicker
      const r = f.r * (0.9 + 0.1 * Math.sin(now / 90 + f.y)) * (0.5 + 0.5 * Math.min(1, f.t * 4));   // quick grow-in
      ctx.save();
      if (theme.effects.glow) { ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 26; ctx.shadowColor = "#ff7a2a"; }
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, Math.max(1, r));
      g.addColorStop(0, rgba("#fff1b0", 0.85 * a * flick));
      g.addColorStop(0.45, rgba("#ff8a2a", 0.6 * a));
      g.addColorStop(0.8, rgba("#ff3a10", 0.34 * a));
      g.addColorStop(1, rgba("#ff3a10", 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawDrone(ctx, theme, d, now) {
      ctx.save(); ctx.translate(d.x, d.y); if (d.vx < 0) ctx.scale(-1, 1);
      if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = "#7afcff"; }
      ctx.fillStyle = "#9fd8ff"; ctx.strokeStyle = "#7afcff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(14, -4); ctx.lineTo(22, 0); ctx.lineTo(14, 4); ctx.closePath(); ctx.fill(); ctx.stroke();   // fuselage
      ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(-11, -15); ctx.lineTo(-5, -3); ctx.moveTo(-1, 3); ctx.lineTo(-11, 15); ctx.lineTo(-5, 3); ctx.stroke();   // wings
      ctx.shadowBlur = 0; ctx.fillStyle = (Math.floor(now / 120) % 2) ? "#ff5a5a" : "#ffe14d"; ctx.beginPath(); ctx.arc(17, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // crisp vector glyph per killstreak (so each is instantly readable in the dock)
    drawStreakIcon(ctx, id, cx, cy, s, color) {
      const r = s * 0.5, TAU = Math.PI * 2;
      ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, s * 0.1); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (id === "nuke") {   // radiation trefoil
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * TAU / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a - 0.52, a + 0.52); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = "#0a0a0a"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, TAU); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
      } else if (id === "drone") {   // top-down strike aircraft
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.16, cy + r * 0.7); ctx.lineTo(cx - r * 0.16, cy + r * 0.7); ctx.closePath(); ctx.fill();   // fuselage
        ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.1); ctx.lineTo(cx + r, cy + r * 0.1); ctx.lineTo(cx + r * 0.16, cy - r * 0.15); ctx.lineTo(cx - r * 0.16, cy - r * 0.15); ctx.closePath(); ctx.fill();   // wing
        ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy + r * 0.7); ctx.lineTo(cx + r * 0.4, cy + r * 0.7); ctx.lineTo(cx, cy + r * 0.5); ctx.closePath(); ctx.fill();   // tail
      } else if (id === "meteor") {   // flaming comet
        ctx.beginPath(); ctx.moveTo(cx + r * 0.9, cy - r * 0.9); ctx.lineTo(cx - r * 0.2, cy + r * 0.2); ctx.lineTo(cx + r * 0.2, cy - r * 0.2); ctx.closePath(); ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(cx - r * 0.35, cy + r * 0.35, r * 0.42, 0, TAU); ctx.fill();
      } else if (id === "volcano") {   // erupting mountain
        ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.8); ctx.lineTo(cx - r * 0.35, cy - r * 0.1); ctx.lineTo(cx + r * 0.35, cy - r * 0.1); ctx.lineTo(cx + r, cy + r * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(cx, cy - r * 0.55, r * 0.22, 0, TAU); ctx.fill();
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(cx + k * r * 0.4, cy - r * (0.8 + Math.abs(k) * 0.1), r * 0.1, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    // crisp vector glyph per MILITIA upgrade
    drawTownIcon(ctx, id, cx, cy, s, color) {
      const r = s * 0.5, TAU = Math.PI * 2;
      ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.3, s * 0.1); ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (id === "buckshot") {   // shell + spreading pellets
        ctx.fillRect(cx - r * 0.28, cy + r * 0.35, r * 0.56, r * 0.5);
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(cx + k * r * 0.6, cy - r * 0.55, r * 0.18, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(cx + k * 0.2, cy + r * 0.3); ctx.lineTo(cx + k * r * 0.6, cy - r * 0.35); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
      } else if (id === "rockets") {   // bottle rocket on a stick + spark
        ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.3, cy - r * 0.3); ctx.lineTo(cx - r * 0.3, cy - r * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillRect(cx - r * 0.12, cy - r * 0.3, r * 0.24, r * 0.8);
        ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.5); ctx.lineTo(cx, cy + r); ctx.stroke();
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(cx, cy - r, r * 0.18, 0, TAU); ctx.fill();
      } else if (id === "molotov") {   // bottle with a flaming rag
        ctx.fillStyle = rgba(color, 0.5); rr(ctx, cx - r * 0.4, cy - r * 0.2, r * 0.8, r * 1.1, r * 0.3); ctx.fill();
        ctx.strokeStyle = color; rr(ctx, cx - r * 0.4, cy - r * 0.2, r * 0.8, r * 1.1, r * 0.3); ctx.stroke();
        ctx.fillRect(cx - r * 0.14, cy - r * 0.55, r * 0.28, r * 0.4);
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(cx, cy - r * 0.75, r * 0.22, 0, TAU); ctx.fill();
      } else if (id === "bees") {   // a little swarm
        for (const o of [[-r * 0.5, -r * 0.2], [r * 0.45, -r * 0.4], [0, r * 0.4]]) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx + o[0], cy + o[1], r * 0.26, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba("#2a2200", 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + o[0] - r * 0.26, cy + o[1]); ctx.lineTo(cx + o[0] + r * 0.26, cy + o[1]); ctx.stroke(); ctx.lineWidth = Math.max(1.3, s * 0.1); ctx.strokeStyle = color; }
      } else if (id === "tesla") {   // lightning bolt between two posts
        ctx.fillRect(cx - r * 0.85, cy - r * 0.7, r * 0.2, r * 1.5); ctx.fillRect(cx + r * 0.65, cy - r * 0.7, r * 0.2, r * 1.5);
        ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - r * 0.3); ctx.lineTo(cx + r * 0.05, cy - r * 0.05); ctx.lineTo(cx - r * 0.2, cy + r * 0.1); ctx.lineTo(cx + r * 0.55, cy + r * 0.4); ctx.stroke();
      } else if (id === "range") {   // scope / reticle
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r * 0.16, 0, TAU); ctx.fill();
      } else if (id === "ammo") {   // ammo crate
        rr(ctx, cx - r * 0.8, cy - r * 0.55, r * 1.6, r * 1.1, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - r * 0.8, cy - r * 0.2); ctx.lineTo(cx + r * 0.8, cy - r * 0.2); ctx.stroke();
        ctx.fillRect(cx - r * 0.3, cy + r * 0.05, r * 0.18, r * 0.4); ctx.fillRect(cx + r * 0.12, cy + r * 0.05, r * 0.18, r * 0.4);
      }
      ctx.restore();
    }

    // tiny "townsperson" badge so pickups/upgrades clearly read as belonging to the crowd
    _personBadge(ctx, x, y, s, color) {
      ctx.save();
      ctx.fillStyle = "rgba(6,9,14,0.92)"; ctx.beginPath(); ctx.arc(x, y, s * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, s * 0.95, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y - s * 0.35, s * 0.3, 0, Math.PI * 2); ctx.fill();   // head
      ctx.beginPath(); ctx.moveTo(x - s * 0.42, y + s * 0.5); ctx.quadraticCurveTo(x, y - s * 0.2, x + s * 0.42, y + s * 0.5); ctx.closePath(); ctx.fill();   // body
      ctx.restore();
    }

    // townsfolk projectiles (their upgraded little guns)
    drawTownShot(ctx, theme, t, now) {
      const col = t.color || "#ffe066";
      ctx.save();
      if (t.type === "pellet") {
        const sp = Math.hypot(t.vx, t.vy) || 1, L = 7;
        this._glow(ctx, theme, col, theme.effects.glow ? 6 : 0);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - t.vx / sp * L, t.y - t.vy / sp * L); ctx.stroke();
      } else if (t.type === "bee") {
        this._glow(ctx, theme, col, theme.effects.glow ? 8 : 0);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(t.x, t.y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(30,24,0,0.9)"; ctx.lineWidth = 1; const wf = Math.sin(now / 30 + t.wig) * 3;
        ctx.beginPath(); ctx.moveTo(t.x - 3, t.y - wf); ctx.lineTo(t.x + 3, t.y - wf); ctx.stroke();
      } else if (t.type === "rocket") {
        const a = Math.atan2(t.ty - t.y, t.tx - t.x);
        this._glow(ctx, theme, col, theme.effects.glow ? 12 : 0);
        ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - Math.cos(a) * 9, t.y - Math.sin(a) * 9); ctx.stroke();
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(t.x, t.y, 2.6, 0, Math.PI * 2); ctx.fill();
      } else if (t.type === "molotov") {
        ctx.translate(t.x, t.y); ctx.rotate(t.spin || 0);
        this._glow(ctx, theme, "#ff7a2a", theme.effects.glow ? 10 : 0);
        ctx.fillStyle = rgba(col, 0.85); rr(ctx, -2.5, -4, 5, 9, 2); ctx.fill();
        ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(0, -6, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // shared rounded tile shell used across the dock
    _dockTile(ctx, theme, r, col, opts) {
      opts = opts || {};
      ctx.save();
      ctx.globalAlpha = opts.dim ? 0.5 : 1;
      ctx.fillStyle = opts.fill || "rgba(8,12,20,0.78)"; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.fill();
      if (opts.tint) { ctx.fillStyle = opts.tint; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.fill(); }
      ctx.lineWidth = opts.lw || 1.4; ctx.strokeStyle = col;
      if (theme.effects.glow && opts.glow) { ctx.shadowBlur = opts.glow; ctx.shadowColor = col; }
      rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke();
      ctx.restore();
    }

    // the whole bottom CONTROL DOCK: panel + ARSENAL · INCOMING · KILLSTREAKS
    drawDock(ctx, theme, d) {
      const p = theme.palette, w = d.w, top = d.dockTop, h = d.dockH, now = d.now || 0;
      ctx.save();
      // panel background
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, rgba("#0c1118", 0.96)); g.addColorStop(1, rgba("#05070c", 0.98));
      ctx.fillStyle = g; ctx.fillRect(0, top, w, h);
      ctx.strokeStyle = rgba(p.accent, 0.7); ctx.lineWidth = 2; if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.accent; }
      ctx.beginPath(); ctx.moveTo(0, top + 1); ctx.lineTo(w, top + 1); ctx.stroke(); ctx.shadowBlur = 0;
      // captions (each sits just above its row)
      ctx.textBaseline = "alphabetic"; ctx.fillStyle = rgba(p.textDim, 0.85); ctx.font = "700 9px " + theme.fonts.ui; ctx.textAlign = "left";
      const cap = (txt, slot) => { if (slot) ctx.fillText(txt, slot.x + 1, slot.y - 4); };
      if (d.weapons.length) cap("ARSENAL", d.weapons[0].rect);
      cap("INCOMING", d.pickupSlots[0]);
      cap("MILITIA", d.militiaSlots && d.militiaSlots[0]);
      cap("KILLSTREAKS", d.streakSlots[0]);

      // ---- ARSENAL ----
      for (const c of d.weapons) {
        const r = c.rect, col = c.color || p.interceptor;
        const borderCol = c.cooling ? p.enemy : (c.active ? p.accent : rgba(p.textDim, 0.5));
        this._dockTile(ctx, theme, r, borderCol, { dim: c.locked, lw: (c.active || c.cooling) ? 2.2 : 1.2,
          glow: c.active ? 10 : 0, tint: c.cooling ? "rgba(255,72,72,0.16)" : (c.active ? rgba(p.accent, 0.08) : null) });
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (c.locked) { ctx.fillStyle = p.textDim; ctx.font = "700 16px " + theme.fonts.ui; ctx.fillText("?", r.x + r.w / 2, r.y + r.h / 2); continue; }
        this.drawWeaponIcon(ctx, c.id, r.x + r.w / 2, r.y + 19, 17, col);
        ctx.fillStyle = c.active ? p.text : p.textDim; ctx.font = "700 9px " + theme.fonts.ui;
        ctx.fillText(c.short, r.x + r.w / 2, r.y + r.h - 16);
        if (c.keyNum <= 9) { ctx.fillStyle = rgba(p.textDim, 0.8); ctx.font = "600 8px " + theme.fonts.ui; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText(String(c.keyNum), r.x + r.w - 5, r.y + 4); }   // only 1-9 have a digit hotkey
        const bw = r.w - 12, bx = r.x + 6, byb = r.y + r.h - 8;
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb, bw, 3);
        if (c.cooling) { ctx.fillStyle = p.enemy; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, c.cdFrac)), 3); }
        else { ctx.fillStyle = c.heatFrac > 0.7 ? "#ffb43a" : "#5ad1ff"; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, c.heatFrac)), 3); }
        if (c.active && !c.cooling) { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb - 4, bw, 2); ctx.fillStyle = c.reloadFrac >= 1 ? p.accent : rgba(p.accent, 0.7); ctx.fillRect(bx, byb - 4, bw * Math.max(0, Math.min(1, c.reloadFrac)), 2); }
        if (c.cooling) { ctx.fillStyle = p.enemy; ctx.font = "800 8px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("COOL", r.x + r.w / 2, r.y + r.h / 2 + 13); }
      }

      // ---- INCOMING pickups (empty-slot outlines, then any waiting pickups) ----
      for (const r of d.pickupSlots) { ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore(); }
      for (const pk of d.pickups) {
        const r = pk.rect, col = pk.color, pulse = 0.65 + 0.35 * Math.sin(now / 140 + r.x);
        this._dockTile(ctx, theme, r, col, { lw: 2, glow: 8 + 8 * pulse, tint: rgba(col, 0.12 + 0.1 * pulse) });
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (pk.isMult) { ctx.fillStyle = "#fff7e0"; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; } ctx.font = "900 18px " + theme.fonts.ui; ctx.fillText("×" + pk.mult, r.x + r.w / 2, r.y + 18); ctx.shadowBlur = 0; }
        else if (pk.isTown) this.drawTownIcon(ctx, pk.townId, r.x + r.w / 2, r.y + 17, 17, col);
        else this.drawWeaponIcon(ctx, pk.weaponId, r.x + r.w / 2, r.y + 17, 17, col);
        if (pk.isTown) this._personBadge(ctx, r.x + r.w - 9, r.y + r.h - 18, 9, col);   // marks this pickup as FOR THE TOWNSFOLK
        ctx.fillStyle = col; ctx.font = "700 8px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pk.isTown ? "TOWN" : "GRAB", r.x + r.w / 2, r.y + r.h - 14);
        const bw = r.w - 12, bx = r.x + 6, byb = r.y + r.h - 7;   // life-left bar
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb, bw, 3);
        ctx.fillStyle = col; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, pk.frac)), 3);
      }

      // ---- MILITIA (townsfolk upgrades — display only; person-marked) ----
      if (d.militiaSlots) {
        for (const r of d.militiaSlots) { ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore(); }
        for (const mu of (d.militia || [])) {
          const r = mu.rect, col = mu.color;
          this._dockTile(ctx, theme, r, col, { lw: 1.6, glow: 7, tint: rgba(col, 0.14) });
          this.drawTownIcon(ctx, mu.id, r.x + r.w / 2, r.y + 16, 16, col);
          this._personBadge(ctx, r.x + r.w - 9, r.y + 9, 8, col);
          ctx.fillStyle = col; ctx.font = "700 8px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(mu.short, r.x + r.w / 2, r.y + r.h - 13);
          if (mu.lvl > 1) {   // enhancer level pips
            const pips = Math.min(4, mu.lvl), pw = 5, tot = pips * pw + (pips - 1) * 2, bx = r.x + (r.w - tot) / 2, by = r.y + r.h - 5;
            for (let k = 0; k < pips; k++) { ctx.fillStyle = col; ctx.fillRect(bx + k * (pw + 2), by, pw, 2); }
          }
        }
      }

      // ---- KILLSTREAKS (empty slots + meter on the next one, then earned streaks) ----
      for (let i = 0; i < d.streakSlots.length; i++) {
        const r = d.streakSlots[i]; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore();
        if (i === d.nextSlot && d.streaks.length < d.streakSlots.length) {   // charge meter fills the next empty slot
          const m = Math.max(0, Math.min(1, d.meter)); ctx.fillStyle = rgba(p.accent, 0.16); rr(ctx, r.x, r.y + r.h * (1 - m), r.w, r.h * m, 7); ctx.fill();
          ctx.fillStyle = rgba(p.accent, 0.7); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "800 9px " + theme.fonts.ui; ctx.fillText(Math.round(m * 100) + "%", r.x + r.w / 2, r.y + r.h / 2);
        }
      }
      let anyPicked = false;
      for (const sk of d.streaks) {
        const r = sk.rect, picked = sk.picked; if (picked) anyPicked = true;
        this._dockTile(ctx, theme, r, picked ? "#ffffff" : sk.color, { lw: picked ? 3 : 2, glow: picked ? 18 : 10, tint: rgba(sk.color, picked ? 0.34 : 0.16) });
        this.drawStreakIcon(ctx, sk.id, r.x + r.w / 2, r.y + 20, 20, picked ? "#ffffff" : sk.color);
        ctx.fillStyle = picked ? "#fff" : sk.color; ctx.font = "700 8px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(sk.name.split(" ")[0], r.x + r.w / 2, r.y + r.h - 14);
        if (picked) { ctx.fillStyle = "#fff"; ctx.font = "800 9px " + theme.fonts.ui; ctx.fillText("▲", r.x + r.w / 2, r.y - 7); }
      }
      if (anyPicked) { ctx.fillStyle = p.text; ctx.font = "800 9px " + theme.fonts.ui; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic"; ctx.fillText("RELEASE TO FIRE", w - 10, top + 13); }
      ctx.restore();
    }

    drawVolcano(ctx, theme, v, now) {
      const gy = this.groundY;
      ctx.save();
      ctx.fillStyle = "#3a2018"; ctx.beginPath(); ctx.moveTo(v.x - 48, gy); ctx.lineTo(v.x - 16, gy - 46); ctx.lineTo(v.x + 16, gy - 46); ctx.lineTo(v.x + 48, gy); ctx.closePath(); ctx.fill();   // mound
      ctx.strokeStyle = "#241008"; ctx.lineWidth = 2; ctx.stroke();
      if (theme.effects.glow) { ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 26; ctx.shadowColor = "#ff5a2a"; }
      const r = 26 + Math.sin(now / 70) * 4, g = ctx.createRadialGradient(v.x, gy - 46, 0, v.x, gy - 46, r);   // glowing crater
      g.addColorStop(0, rgba("#fff1b0", 0.95)); g.addColorStop(0.5, rgba("#ff7a2a", 0.8)); g.addColorStop(1, rgba("#ff3a10", 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(v.x, gy - 46, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    drawEmber(ctx, theme, gb) {
      ctx.save();
      if (theme.effects.glow) { ctx.globalCompositeOperation = "lighter"; ctx.shadowBlur = 14; ctx.shadowColor = "#ff8a2a"; }
      const r = 6, g = ctx.createRadialGradient(gb.x, gb.y, 0, gb.x, gb.y, r);
      g.addColorStop(0, rgba("#fff1b0", 0.95));
      g.addColorStop(0.45, rgba("#ff8a2a", 0.75));
      g.addColorStop(1, rgba("#ff3a10", 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gb.x, gb.y, r, 0, Math.PI * 2); ctx.fill();
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
      if (data.mult > 1) {   // active multi-fire badge + countdown bar, centered in the clear top strip
        const gold = "#ffd24a", cx = this.w / 2;
        this._glow(ctx, theme, gold, theme.effects.glow ? 8 : 0);
        ctx.fillStyle = gold; ctx.font = "900 15px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("×" + data.mult + " MULTI-FIRE", cx, 12); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(cx - 65, 31, 130, 4);
        ctx.fillStyle = gold; ctx.fillRect(cx - 65, 31, 130 * Math.max(0, Math.min(1, data.multFrac)), 4);
      }
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
      else if (id === "seeker") { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.4, cy + r * 0.18); ctx.lineTo(cx - r * 0.4, cy + r * 0.18); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + r * 0.58, r * 0.28, 0, 6.2832); ctx.stroke(); }
      else if (id === "napalm") { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.bezierCurveTo(cx + r * 0.85, cy - r * 0.2, cx + r * 0.5, cy + r * 0.9, cx, cy + r); ctx.bezierCurveTo(cx - r * 0.5, cy + r * 0.9, cx - r * 0.85, cy - r * 0.2, cx, cy - r); ctx.closePath(); ctx.fill(); ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(cx, cy + r * 0.35, r * 0.3, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    }

    drawPeople(ctx, theme, cx, panic, now) {
      const p = theme.palette, gy = this.groundY;
      ctx.save();
      ctx.strokeStyle = p.person; ctx.fillStyle = p.person; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      const spots = panic ? [-25, -12, 2, 15, 27] : [-17, 17];   // a bigger crowd spills out when panicking
      for (let k = 0; k < spots.length; k++) {
        const ph = now / (panic ? 90 : 340) + k * 2.1;
        const run = panic ? Math.sin(ph) * 5 : 0;
        const bob = panic ? Math.abs(Math.sin(ph * 2)) * 3 : Math.abs(Math.sin(now / 600 + k)) * 0.8;
        const x = cx + spots[k] + run, y = gy - 2 - bob;
        ctx.beginPath(); ctx.arc(x, y - 9, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 2); ctx.stroke();
        const stride = panic ? Math.sin(ph * 3) * 2.6 : 0.9;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x - stride, y + 2); ctx.moveTo(x, y - 2); ctx.lineTo(x + stride, y + 2); ctx.stroke();
        if (panic) {   // one arm holds a tiny gun pointed skyward, the other flails
          const g = (k % 2 === 0) ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + g * 3, y - 9); ctx.stroke();
          ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(x + g * 3, y - 9); ctx.lineTo(x + g * 4.6, y - 13.5); ctx.stroke(); ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - g * 3, y - 10.5); ctx.stroke();
        } else { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x - 2.5, y - 4); ctx.moveTo(x, y - 6); ctx.lineTo(x + 2.5, y - 4); ctx.stroke(); }
      }
      ctx.restore();
    }

    // harmless little gun tracers from panicking civilians
    drawTracers(ctx, theme, tracers) {
      if (!tracers || !tracers.length) return;
      ctx.save();
      this._glow(ctx, theme, "#ffd24a", theme.effects.glow ? 6 : 0);
      ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      for (const t of tracers) {
        const sp = Math.hypot(t.vx, t.vy) || 1, len = 8;
        ctx.globalAlpha = Math.max(0.2, Math.min(1, t.life * 2.6));
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - t.vx / sp * len, t.y - t.vy / sp * len); ctx.stroke();
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
