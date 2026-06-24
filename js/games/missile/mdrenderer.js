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

    // SKY only — drawn unshaken (full screen) so a screen-shake can't reveal an edge.
    drawBackground(ctx, theme, now, groundY) {
      const w = this.w, h = this.h, p = theme.palette;
      if (theme.effects.bgAnim) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, p.bg1); g.addColorStop(1, p.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
      else { ctx.fillStyle = p.bg1; ctx.fillRect(0, 0, w, h); }
    }

    // GROUND — drawn INSIDE the shake transform with the cities/batteries, so the
    // bases never lift off the ground line when the screen shakes. Overscanned
    // sideways/downward so the shake offset never exposes a gap.
    drawGround(ctx, theme, groundY) {
      const w = this.w, h = this.h, p = theme.palette, o = 16;
      ctx.save();
      this._glow(ctx, theme, p.ground, theme.effects.glow ? 10 : 0);
      ctx.fillStyle = theme.effects.glow ? rgba(p.ground, 0.25) : rgba(p.ground, 0.4);
      ctx.fillRect(-o, groundY, w + o * 2, h - groundY + o);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = p.ground; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-o, groundY); ctx.lineTo(w + o, groundY); ctx.stroke();
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

    // a small squad of helmeted soldiers manning a firing base, rifles aimed at the sky
    drawSoldiers(ctx, theme, x, now) {
      const y = this.groundY, col = "#a7c08a", metal = "#5f6e48";
      ctx.save(); ctx.lineCap = "round";
      const spots = [-23, 23, 0];   // flanking the launcher + one on top
      for (let k = 0; k < spots.length; k++) {
        const side = k === 1 ? 1 : -1, sx = x + spots[k], top = (k === 2);
        const yy = (top ? y - 16 : y) - 2 - Math.abs(Math.sin(now / 480 + k)) * 0.6;   // top soldier stands on the launcher
        // torso + legs
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(sx, yy - 8); ctx.lineTo(sx, yy - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, yy - 2); ctx.lineTo(sx - 2.3, yy + 2); ctx.moveTo(sx, yy - 2); ctx.lineTo(sx + 2.3, yy + 2); ctx.stroke();
        // head + helmet
        ctx.beginPath(); ctx.arc(sx, yy - 10, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = metal; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.arc(sx, yy - 11, 3, Math.PI, 0); ctx.stroke();
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sx - 3.6, yy - 11); ctx.lineTo(sx + 3.6, yy - 11); ctx.stroke();
        // rifle up-and-out toward the sky
        ctx.strokeStyle = metal; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sx, yy - 7); ctx.lineTo(sx + side * 5.5, yy - 14); ctx.stroke();
        // muzzle-flash flicker (staggered per soldier)
        if (Math.floor(now / 120 + k * 2) % 5 === 0) {
          this._glow(ctx, theme, "#fff1b0", theme.effects.glow ? 6 : 0);
          ctx.fillStyle = "#fff1b0"; ctx.beginPath(); ctx.arc(sx + side * 6.5, yy - 15, 1.8, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
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
      const s = d.scale || 1, fs = (px) => Math.round(px * s);   // resolution-aware sizing so the dock isn't lost on big screens
      ctx.save();
      // panel background
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, rgba("#0c1118", 0.96)); g.addColorStop(1, rgba("#05070c", 0.98));
      ctx.fillStyle = g; ctx.fillRect(0, top, w, h);
      ctx.strokeStyle = rgba(p.accent, 0.7); ctx.lineWidth = 2; if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.accent; }
      ctx.beginPath(); ctx.moveTo(0, top + 1); ctx.lineTo(w, top + 1); ctx.stroke(); ctx.shadowBlur = 0;
      // captions (each sits just above its row)
      ctx.textBaseline = "alphabetic"; ctx.fillStyle = rgba(p.textDim, 0.85); ctx.font = "700 " + fs(9) + "px " + theme.fonts.ui; ctx.textAlign = "left";
      const cap = (txt, slot) => { if (slot) ctx.fillText(txt, slot.x + 1, slot.y - fs(4)); };
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
        if (c.locked) { ctx.fillStyle = p.textDim; ctx.font = "700 " + fs(16) + "px " + theme.fonts.ui; ctx.fillText("?", r.x + r.w / 2, r.y + r.h / 2); continue; }
        this.drawWeaponIcon(ctx, c.id, r.x + r.w / 2, r.y + r.h * 0.46, fs(17), col);
        ctx.fillStyle = c.active ? p.text : p.textDim; ctx.font = "700 " + fs(9) + "px " + theme.fonts.ui;
        ctx.fillText(c.short, r.x + r.w / 2, r.y + r.h - fs(15));
        if (c.keyNum <= 9) { ctx.fillStyle = rgba(p.textDim, 0.8); ctx.font = "600 " + fs(8) + "px " + theme.fonts.ui; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText(String(c.keyNum), r.x + r.w - fs(5), r.y + fs(4)); }   // only 1-9 have a digit hotkey
        const bw = r.w - fs(12), bx = r.x + fs(6), byb = r.y + r.h - fs(8), bh3 = Math.max(2, fs(3));
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb, bw, bh3);
        if (c.cooling) { ctx.fillStyle = p.enemy; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, c.cdFrac)), bh3); }
        else { ctx.fillStyle = c.heatFrac > 0.7 ? "#ffb43a" : "#5ad1ff"; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, c.heatFrac)), bh3); }
        if (c.active && !c.cooling) { const rh = Math.max(2, fs(2)); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb - rh - 2, bw, rh); ctx.fillStyle = c.reloadFrac >= 1 ? p.accent : rgba(p.accent, 0.7); ctx.fillRect(bx, byb - rh - 2, bw * Math.max(0, Math.min(1, c.reloadFrac)), rh); }
        if (c.cooling) { ctx.fillStyle = p.enemy; ctx.font = "800 " + fs(8) + "px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("COOL", r.x + r.w / 2, r.y + r.h / 2 + fs(13)); }
      }

      // ---- INCOMING pickups (empty-slot outlines, then any waiting pickups; clickable -> pulse hard) ----
      for (const r of d.pickupSlots) { ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore(); }
      for (const pk of d.pickups) {
        const r = pk.rect, col = pk.color, pulse = 0.5 + 0.5 * Math.sin(now / 130 + r.x);   // a clickable pickup breathes so you notice you can grab it
        this._dockTile(ctx, theme, r, col, { lw: 2 + pulse, glow: 8 + 14 * pulse, tint: rgba(col, 0.14 + 0.16 * pulse) });
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (pk.isMult) { ctx.fillStyle = "#fff7e0"; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; } ctx.font = "900 " + fs(18) + "px " + theme.fonts.ui; ctx.fillText("×" + pk.mult, r.x + r.w / 2, r.y + r.h * 0.44); ctx.shadowBlur = 0; }
        else if (pk.isTown) this.drawTownIcon(ctx, pk.townId, r.x + r.w / 2, r.y + r.h * 0.42, fs(17), col);
        else this.drawWeaponIcon(ctx, pk.weaponId, r.x + r.w / 2, r.y + r.h * 0.42, fs(17), col);
        if (pk.isTown) this._personBadge(ctx, r.x + r.w - fs(9), r.y + r.h - fs(17), fs(9), col);   // marks this pickup as FOR THE TOWNSFOLK
        ctx.fillStyle = col; ctx.font = "700 " + fs(8) + "px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(pk.isTown ? "TOWN" : "GRAB", r.x + r.w / 2, r.y + r.h - fs(13));
        const bw = r.w - fs(12), bx = r.x + fs(6), byb = r.y + r.h - fs(7), bh3 = Math.max(2, fs(3));   // life-left bar
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, byb, bw, bh3);
        ctx.fillStyle = col; ctx.fillRect(bx, byb, bw * Math.max(0, Math.min(1, pk.frac)), bh3);
      }

      // ---- MILITIA (townsfolk upgrades — display only; person-marked) ----
      if (d.militiaSlots) {
        for (const r of d.militiaSlots) { ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore(); }
        for (const mu of (d.militia || [])) {
          const r = mu.rect, col = mu.color;
          this._dockTile(ctx, theme, r, col, { lw: 1.6, glow: 7, tint: rgba(col, 0.14) });
          this.drawTownIcon(ctx, mu.id, r.x + r.w / 2, r.y + r.h * 0.42, fs(16), col);
          this._personBadge(ctx, r.x + r.w - fs(9), r.y + fs(9), fs(8), col);
          ctx.fillStyle = col; ctx.font = "700 " + fs(8) + "px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(mu.short, r.x + r.w / 2, r.y + r.h - fs(12));
          if (mu.lvl > 1) {   // enhancer level pips
            const pips = Math.min(4, mu.lvl), pw = fs(5), tot = pips * pw + (pips - 1) * 2, bx = r.x + (r.w - tot) / 2, by = r.y + r.h - fs(5);
            for (let k = 0; k < pips; k++) { ctx.fillStyle = col; ctx.fillRect(bx + k * (pw + 2), by, pw, Math.max(2, fs(2))); }
          }
        }
      }

      // ---- KILLSTREAKS (empty slots + meter on the next one, then earned streaks) ----
      for (let i = 0; i < d.streakSlots.length; i++) {
        const r = d.streakSlots[i]; ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(p.textDim, 0.3); ctx.lineWidth = 1; rr(ctx, r.x, r.y, r.w, r.h, 7); ctx.stroke(); ctx.restore();
        if (i === d.nextSlot && d.streaks.length < d.streakSlots.length) {   // charge meter fills the next empty slot
          const m = Math.max(0, Math.min(1, d.meter)); ctx.fillStyle = rgba(p.accent, 0.16); rr(ctx, r.x, r.y + r.h * (1 - m), r.w, r.h * m, 7); ctx.fill();
          ctx.fillStyle = rgba(p.accent, 0.7); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "800 " + fs(9) + "px " + theme.fonts.ui; ctx.fillText(Math.round(m * 100) + "%", r.x + r.w / 2, r.y + r.h / 2);
        }
      }
      let anyPicked = false;
      // ready killstreaks PULSE strongly + carry a bouncing arrow — they SHOULD be pressed (R / tap)
      const kpulse = 0.5 + 0.5 * Math.sin(now / 260);
      for (let si = 0; si < d.streaks.length; si++) {
        const sk = d.streaks[si], r = sk.rect, picked = sk.picked; if (picked) anyPicked = true;
        const glow = picked ? 20 : (10 + 14 * kpulse), lw = picked ? 3 : (2 + 1.4 * kpulse);
        this._dockTile(ctx, theme, r, picked ? "#ffffff" : sk.color, { lw: lw, glow: glow, tint: rgba(sk.color, picked ? 0.34 : (0.16 + 0.16 * kpulse)) });
        this.drawStreakIcon(ctx, sk.id, r.x + r.w / 2, r.y + r.h * 0.48, fs(20), picked ? "#ffffff" : sk.color);
        ctx.fillStyle = picked ? "#fff" : sk.color; ctx.font = "700 " + fs(8) + "px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(sk.name.split(" ")[0], r.x + r.w / 2, r.y + r.h - fs(13));
        if (picked) { ctx.fillStyle = "#fff"; ctx.font = "800 " + fs(9) + "px " + theme.fonts.ui; ctx.fillText("▲", r.x + r.w / 2, r.y - fs(7)); }
        else if (si === 0) {   // gentle persistent "press me" arrow over the streak R fires
          const bounce = Math.abs(Math.sin(now / 230)) * fs(5);
          ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * kpulse; ctx.fillStyle = sk.color;
          if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = sk.color; }
          const ay = r.y - fs(5) - bounce, aw = fs(6);
          ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - aw, ay - fs(7)); ctx.lineTo(r.x + r.w / 2 + aw, ay - fs(7)); ctx.lineTo(r.x + r.w / 2, ay); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      if (anyPicked) { ctx.fillStyle = p.text; ctx.font = "800 " + fs(9) + "px " + theme.fonts.ui; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic"; ctx.fillText("RELEASE TO FIRE", w - fs(10), top + fs(13)); }

      // ---- attention cues: a bouncing little arrow points right AT the new item (subtle but obvious) ----
      const hint = d.hint || {};
      const cue = (ms, r, label) => {
        if (!(ms > 0) || !r) return;
        const cx = r.x + r.w / 2;
        const pulse = 0.5 + 0.5 * Math.sin(now / 150), fade = Math.min(1, ms / 700);   // fade out over the last 0.7s
        const bounce = Math.abs(Math.sin(now / 175)) * fs(7);   // lively little hop above the tile
        const ay = r.y - fs(6) - bounce;   // arrow tip sits just above the tile, bouncing
        ctx.save();
        // soft pulse outline on the tile itself
        ctx.globalAlpha = fade; ctx.strokeStyle = rgba(p.accent, 0.4 + 0.45 * pulse); ctx.lineWidth = 2;
        if (theme.effects.glow) { ctx.shadowBlur = 5 + 11 * pulse; ctx.shadowColor = p.accent; }
        rr(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9); ctx.stroke();
        // tiny label
        ctx.globalAlpha = fade * (0.7 + 0.3 * pulse); ctx.fillStyle = p.accent;
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.font = "800 " + fs(8) + "px " + theme.fonts.ui;
        ctx.fillText(label, cx, ay - fs(11));
        // the bouncing downward arrow
        const aw = fs(6); ctx.beginPath(); ctx.moveTo(cx - aw, ay - fs(8)); ctx.lineTo(cx + aw, ay - fs(8)); ctx.lineTo(cx, ay); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      cue(hint.arsenal, hint.arsenalRect, "NEW WEAPON");
      cue(hint.pow, hint.powRect, "GRAB IT");
      cue(hint.streak, hint.streakRect, "READY");
      ctx.restore();
    }

    // Center-top "NEW WEAPON" banner — compact, PULSING (begs to be clicked), with a
    // countdown bar. Clicking it equips the weapon and pops a flash (see _bannerBoom).
    drawNewWeaponBanner(ctx, theme, d) {
      const p = theme.palette, w = this.w, col = d.color || p.accent, s = d.scale || 1, now = d.now || 0;
      const fs = (px) => Math.round(px * s);
      const bw = Math.min(Math.round(286 * s), w - 36), bh = Math.round(48 * s);   // a touch smaller than before
      const bx = (w - bw) / 2, by = Math.max(46, this.h * 0.11);
      const rect = { x: bx, y: by, w: bw, h: bh };   // returned for click hit-testing (equip-on-click)
      const t = Math.max(0, Math.min(1, d.frac));          // 1 -> 0
      const a = Math.max(0, Math.min(1, Math.min((1 - t) / 0.07, t / 0.16)));   // fade in first ~7%, out last ~16%
      if (a <= 0) return rect;
      const pulse = 0.5 + 0.5 * Math.sin(now / 170), pop = Math.max(0, Math.min(1, d.pop || 0));
      const cx = bx + bw / 2, cy = by + bh / 2;
      ctx.save();
      ctx.globalAlpha = a;
      // a click "pop": briefly scale the whole banner up
      if (pop > 0) { const sc = 1 + pop * 0.16; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); }
      // panel
      ctx.fillStyle = rgba("#0b1018", 0.9); rr(ctx, bx, by, bw, bh, 12); ctx.fill();
      // PULSING border + glow so it obviously wants a click
      ctx.lineWidth = 2 + 1.4 * pulse; ctx.strokeStyle = col;
      if (theme.effects.glow) { ctx.shadowBlur = 12 + 14 * pulse; ctx.shadowColor = col; }
      rr(ctx, bx, by, bw, bh, 12); ctx.stroke(); ctx.shadowBlur = 0;
      // weapon icon
      this.drawWeaponIcon(ctx, d.id, bx + fs(28), by + bh / 2 - fs(2), fs(20), col);
      // labels
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = rgba(p.textDim, 0.95); ctx.font = "800 " + fs(9) + "px " + theme.fonts.ui;
      ctx.fillText("NEW WEAPON", bx + fs(52), by + fs(19));
      ctx.fillStyle = col; ctx.font = "900 " + fs(17) + "px " + theme.fonts.ui;
      if (theme.effects.glow) { ctx.shadowBlur = 8 + 8 * pulse; ctx.shadowColor = col; }
      ctx.fillText(d.name, bx + fs(52), by + fs(37)); ctx.shadowBlur = 0;
      // select hint (or EQUIPPED tick if it's already the active weapon)
      ctx.textAlign = "right"; ctx.font = "700 " + fs(8) + "px " + theme.fonts.ui;
      if (d.active) { ctx.fillStyle = "#9aff8a"; ctx.fillText("EQUIPPED ✓", bx + bw - fs(11), by + fs(16)); }
      else { ctx.fillStyle = rgba(p.textDim, 0.85); ctx.fillText(d.keyNum <= 9 ? ("PRESS " + d.keyNum + " · OR CLICK") : "CLICK TO EQUIP", bx + bw - fs(11), by + fs(16)); }
      // countdown bar
      const cbh = Math.max(2, fs(3));
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx + fs(11), by + bh - fs(8), bw - fs(22), cbh);
      ctx.fillStyle = col; ctx.fillRect(bx + fs(11), by + bh - fs(8), (bw - fs(22)) * t, cbh);
      // click flash overlay (the "explosion" confirmation)
      if (pop > 0) { ctx.globalAlpha = a * pop * 0.55; ctx.fillStyle = "#ffffff"; rr(ctx, bx, by, bw, bh, 12); ctx.fill(); }
      ctx.restore();
      return rect;
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

    drawCrosshair(ctx, theme, x, y, salvo, scale) {
      const p = theme.palette, s = scale || 1;
      ctx.save();
      // MULTI-HIT PREVIEW: dim target rings at every extra shot's landing spot, with a faint spread line
      if (salvo && salvo.length > 1) {
        const xs = salvo.map(pt => pt.x), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
        ctx.strokeStyle = rgba(p.crosshair, 0.16); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        for (const pt of salvo) {
          if (Math.abs(pt.x - x) < 0.5 && Math.abs(pt.y - y) < 0.5) continue;   // center handled by the bright crosshair
          ctx.globalAlpha = 0.5;
          this._glow(ctx, theme, p.crosshair, theme.effects.glow ? 4 : 0);
          ctx.strokeStyle = rgba(p.crosshair, 0.7); ctx.lineWidth = 1.2;
          const rr2 = 6 * s;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rr2, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pt.x - rr2 * 1.6, pt.y); ctx.lineTo(pt.x - rr2 * 0.5, pt.y);
          ctx.moveTo(pt.x + rr2 * 0.5, pt.y); ctx.lineTo(pt.x + rr2 * 1.6, pt.y);
          ctx.stroke();
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
      }
      // bright main crosshair
      this._glow(ctx, theme, p.crosshair, theme.effects.glow ? 8 : 0);
      ctx.strokeStyle = p.crosshair; ctx.lineWidth = 1.5 * s;
      const R0 = 9 * s, A = 14 * s, B = 4 * s;
      ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - A, y); ctx.lineTo(x - B, y); ctx.moveTo(x + B, y); ctx.lineTo(x + A, y);
      ctx.moveTo(x, y - A); ctx.lineTo(x, y - B); ctx.moveTo(x, y + B); ctx.lineTo(x, y + A); ctx.stroke();
      ctx.restore();
    }

    drawHUD(ctx, theme, data) {
      const p = theme.palette, s = data.scale || 1, fs = (px) => Math.round(px * s);
      ctx.save();
      ctx.fillStyle = p.text; ctx.textBaseline = "top";
      this._glow(ctx, theme, p.accent, theme.effects.glow ? 8 : 0);
      ctx.font = "800 " + fs(24) + "px " + theme.fonts.ui; ctx.textAlign = "left";
      ctx.fillText(String(data.score).padStart(6, "0"), fs(18), fs(14));
      ctx.shadowBlur = 0; ctx.font = "600 " + fs(13) + "px " + theme.fonts.ui; ctx.fillStyle = p.textDim;
      ctx.textAlign = "right";
      ctx.fillText("WAVE " + data.wave + "   CITIES " + data.cities, this.w - fs(18), fs(18));
      if (data.mult > 1) {   // active multi-fire badge + countdown bar, centered in the clear top strip
        const gold = "#ffd24a", cx = this.w / 2, bw = fs(130);
        this._glow(ctx, theme, gold, theme.effects.glow ? 8 : 0);
        ctx.fillStyle = gold; ctx.font = "900 " + fs(15) + "px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillText("×" + data.mult + " MULTI-FIRE", cx, fs(12)); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(cx - bw / 2, fs(31), bw, fs(4));
        ctx.fillStyle = gold; ctx.fillRect(cx - bw / 2, fs(31), bw * Math.max(0, Math.min(1, data.multFrac)), fs(4));
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
      ctx.lineWidth = 1.6; ctx.lineCap = "round";
      for (const t of tracers) {
        const col = t.color || "#ffe066", sp = Math.hypot(t.vx, t.vy) || 1, len = t.army ? 10 : 8;
        if (theme.effects.glow) { ctx.shadowBlur = 6; ctx.shadowColor = col; }
        ctx.strokeStyle = col;
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
