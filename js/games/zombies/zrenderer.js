/* =========================================================
   DEADGRID renderer — isometric (2:1 diamond) world under a
   camera that follows the hero. Looping ground field + decals,
   soft shadows, billboarded UNDEAD silhouettes, reticle + aim
   toggle + intro + all HUD/level-up/boss chrome. Pure canvas.
   Perf: the ground is drawn with inlined math and NO per-tile
   shadowBlur (the neon look comes from a single floor sheen);
   entities don't use shadowBlur either (rim strokes instead).
   ========================================================= */
(function (Arcade) {
  "use strict";

  const TAU = Math.PI * 2;
  const KX = 1.0, KY = 0.5;   // world-px -> screen scale (2:1 iso; world ~ screen)

  function hexToRgb(hex) { let h = String(hex).replace("#", ""); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; const n = parseInt(h, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function rgba(hex, a) { if (typeof hex !== "string" || hex[0] !== "#") return hex; const c = hexToRgb(hex); return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")"; }
  function lighten(hex, f) { const c = hexToRgb(hex); const m = v => Math.round(v + (255 - v) * f); return "rgb(" + m(c.r) + "," + m(c.g) + "," + m(c.b) + ")"; }
  function darken(hex, f) { const c = hexToRgb(hex); const m = v => Math.round(v * (1 - f)); return "rgb(" + m(c.r) + "," + m(c.g) + "," + m(c.b) + ")"; }
  function hash2(i, j) { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }

  class Renderer {
    constructor() { this.w = 0; this.h = 0; this.ox = 0; this.oy = 0; }
    resize(w, h) { this.w = w; this.h = h; }
    setCamera(ox, oy) { this.ox = ox; this.oy = oy; }
    w2s(wx, wy) { return { x: this.ox + (wx - wy) * KX, y: this.oy + (wx + wy) * KY }; }
    depth(wx, wy) { return wx + wy; }
    get KX() { return KX; } get KY() { return KY; }
    _rim(ctx, theme, col) { if (theme.effects.glow) { ctx.strokeStyle = lighten(col, 0.5); ctx.lineWidth = 1.6; } else { ctx.strokeStyle = darken(col, 0.5); ctx.lineWidth = 1.6; } }

    drawBackground(ctx, theme) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, theme.palette.bg1); g.addColorStop(1, theme.palette.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
    }

    // looping diamond floor — inlined projection, no per-tile shadowBlur (cheap)
    drawGround(ctx, theme, now, camWX, camWY, decals) {
      const p = theme.palette, T = theme.iso.tile, ox = this.ox, oy = this.oy, hw = T * KX, hh = T * KY;
      const pi = Math.floor(camWX / T), pj = Math.floor(camWY / T);
      const RANGE = Math.ceil(Math.max(this.w / (hw * 2), this.h / (hh * 2))) + 3, margin = hw + 24;
      ctx.lineWidth = theme.effects.gridGlow ? 1.4 : 1;
      for (let di = -RANGE; di <= RANGE; di++) {
        for (let dj = -RANGE; dj <= RANGE; dj++) {
          const i = pi + di, j = pj + dj, wx = i * T, wy = j * T;
          const ax = ox + (wx - wy) * KX, ay = oy + (wx + wy) * KY, cy = ay + hh;
          if (ax < -margin || ax > this.w + margin || cy < -margin || cy > this.h + margin) continue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + hw, ay + hh); ctx.lineTo(ax, ay + 2 * hh); ctx.lineTo(ax - hw, ay + hh); ctx.closePath();
          ctx.fillStyle = ((i + j) & 1) ? p.ground1 : p.ground2; ctx.fill();
          if (!theme.effects.permaDecals || hash2(i, j) > 0.30) { ctx.strokeStyle = p.gridLine; ctx.globalAlpha = theme.effects.gridGlow ? 0.8 : 0.42; ctx.stroke(); ctx.globalAlpha = 1; }
          if (theme.effects.permaDecals) { const r = hash2(i * 7 + 3, j * 11 + 5); if (r > 0.86) { ctx.fillStyle = rgba("#000000", 0.22); ctx.beginPath(); ctx.ellipse(ax + (r - 0.5) * hw, cy + (r - 0.5) * hh, 7, 3.5, 0, 0, TAU); ctx.fill(); } }
        }
      }
      // modern: one soft neon floor sheen under the hero (replaces costly per-line glow)
      if (theme.effects.gridGlow) {
        const cx = this.w / 2, cyy = this.h / 2, g = ctx.createRadialGradient(cx, cyy, 20, cx, cyy, Math.max(this.w, this.h) * 0.55);
        g.addColorStop(0, rgba(p.accent, 0.12)); g.addColorStop(0.45, rgba(p.gridLine, 0.05)); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
      }
      if (decals && decals.length) {
        ctx.save();
        for (const dc of decals) {
          const sx = ox + (dc.wx - dc.wy) * KX, sy = oy + (dc.wx + dc.wy) * KY;
          const a = theme.effects.permaDecals ? 0.5 : Math.max(0, dc.life / dc.maxLife) * 0.6;
          ctx.fillStyle = rgba(dc.color, a);
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(dc.rot); ctx.beginPath(); ctx.ellipse(0, 0, dc.r, dc.r * 0.5, 0, 0, TAU); ctx.fill(); ctx.restore();
        }
        ctx.restore();
      }
    }

    drawShadow(ctx, wx, wy, r) {
      const s = this.w2s(wx, wy);
      ctx.fillStyle = rgba("#000000", 0.28);
      ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.5, 0, 0, TAU); ctx.fill();
    }

    drawField(ctx, theme, f, now) {
      const s = this.w2s(f.wx, f.wy), rx = f.r, ry = f.r * 0.5;
      const a = Math.max(0, Math.min(1, f.life / (f.maxLife || 1)));
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.fillStyle = rgba(f.color, 0.20 * a + 0.06);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(f.color, 0.5 * a); ctx.lineWidth = 2;
      const pr = 0.7 + 0.3 * Math.sin(now / 220 + f.wx);
      ctx.beginPath(); ctx.ellipse(0, 0, rx * pr, ry * pr, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    drawTelegraph(ctx, theme, tg, now) {
      ctx.save();
      const col = tg.color || theme.palette.danger, puls = 0.4 + 0.4 * Math.sin(now / 90);
      if (tg.kind === "line") { const a = this.w2s(tg.wx, tg.wy), b = this.w2s(tg.x2, tg.y2); ctx.strokeStyle = rgba(col, 0.35 + 0.4 * puls); ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
      else if (tg.kind === "circle") { const s = this.w2s(tg.wx, tg.wy); ctx.strokeStyle = rgba(col, 0.5 + 0.4 * puls); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(s.x, s.y, tg.r, tg.r * 0.5, 0, 0, TAU); ctx.stroke(); }
      else if (tg.kind === "cone") { const s = this.w2s(tg.wx, tg.wy); ctx.fillStyle = rgba(col, 0.16 + 0.16 * puls); ctx.beginPath(); ctx.moveTo(s.x, s.y); for (let k = -1; k <= 1; k += 0.25) { const ang = tg.ang + k * tg.half; const e = this.w2s(tg.wx + Math.cos(ang) * tg.len, tg.wy + Math.sin(ang) * tg.len); ctx.lineTo(e.x, e.y); } ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }

    // ----------------- hero -----------------
    // Orbital Strike incoming-impact marker: a shrinking target ring + a streak falling from the sky
    drawStrike(ctx, theme, st, now) {
      const s = this.w2s(st.wx, st.wy), col = st.color || "#ff7a2a", k = Math.max(0, Math.min(1, st.delay / 0.5));
      ctx.save();
      if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = col; }
      ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, st.blast * (0.4 + k * 0.6), st.blast * (0.4 + k * 0.6) * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(s.x, s.y, st.blast * 0.18, st.blast * 0.18 * 0.5, 0, 0, TAU); ctx.stroke();
      // falling streak
      ctx.globalAlpha = 0.7; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x, s.y - 8 - (1 - k) * 220); ctx.lineTo(s.x, s.y - 8 - (1 - k) * 120); ctx.stroke();
      ctx.restore();
    }

    drawPlayer(ctx, theme, pl, now) {
      const s = this.w2s(pl.wx, pl.wy), p = theme.palette;
      const blink = pl.invuln > 0 && (Math.floor(now / 90) % 2 === 0);
      // rings on the ground
      ctx.save(); ctx.translate(s.x, s.y); ctx.lineWidth = 3;
      const hr = 22, hpF = Math.max(0, pl.hp / pl.maxHp);
      ctx.strokeStyle = rgba("#000000", 0.4); ctx.beginPath(); ctx.ellipse(0, 0, hr, hr * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = hpF > 0.3 ? p.accent : p.danger; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = ctx.strokeStyle; }
      ctx.beginPath(); ctx.ellipse(0, 0, hr, hr * 0.5, 0, -Math.PI / 2, -Math.PI / 2 + TAU * hpF); ctx.stroke(); ctx.shadowBlur = 0;
      if (pl.maxStam > 0) { const st = Math.max(0, pl.stam / pl.maxStam); ctx.strokeStyle = rgba("#5ad1ff", 0.85); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, hr + 5, (hr + 5) * 0.5, 0, Math.PI / 2, Math.PI / 2 + TAU * st); ctx.stroke(); }
      ctx.restore();
      // energy SHIELD bubble — visible armor around the player
      if (pl.shield > 0 && pl.maxShield > 0) {
        const sf = pl.shield / pl.maxShield, flick = pl.shieldHit > 0 ? 0.9 : (0.3 + 0.25 * sf + 0.12 * Math.sin(now / 200));
        ctx.save(); ctx.translate(s.x, s.y - 16); ctx.globalAlpha = flick; ctx.strokeStyle = "#7fdcff"; ctx.lineWidth = 2;
        if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = "#5ad1ff"; }
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // body
      ctx.save(); ctx.translate(s.x, s.y);
      const bob = pl.moving ? Math.sin(pl.walk) * 2 : 0, col = p.player, h = 30, face = Math.cos(pl.aim) >= 0 ? 1 : -1;
      ctx.globalAlpha = blink ? 0.5 : 1;
      if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = col; }
      ctx.fillStyle = col;
      // legs
      ctx.strokeStyle = darken(col, 0.25); ctx.lineWidth = 4; ctx.lineCap = "round";
      const ls = pl.moving ? Math.sin(pl.walk) * 3 : 0;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-3 - ls, -10); ctx.moveTo(3, 0); ctx.lineTo(3 + ls, -10); ctx.stroke();
      // torso
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-7, -9 + bob); ctx.lineTo(-5, -h + 6 + bob); ctx.lineTo(5, -h + 6 + bob); ctx.lineTo(7, -9 + bob); ctx.closePath(); ctx.fill();
      this._rim(ctx, theme, col); ctx.stroke();
      // head
      ctx.fillStyle = lighten(col, 0.15); ctx.beginPath(); ctx.arc(0, -h + 1 + bob, 6, 0, TAU); ctx.fill(); ctx.stroke();
      // gun arm toward aim
      ctx.shadowBlur = 0; ctx.strokeStyle = p.playerAccent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.6 + bob); ctx.lineTo(face * 12, -h * 0.55 + bob); ctx.stroke();
      ctx.fillStyle = p.playerAccent; ctx.beginPath(); ctx.arc(face * 14, -h * 0.55 + bob, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // ----------------- the dead -----------------
    drawZombie(ctx, theme, e, now) {
      const s = this.w2s(e.wx, e.wy), p = theme.palette, def = e.def;
      let col = def.color; if (e.buffT > 0) col = lighten(col, 0.28);
      const flash = e.hitFlash > 0, body = flash ? "#ffffff" : col;
      const skin = flash ? "#ffffff" : lighten(col, 0.16), dark = darken(col, 0.32);
      // ELITE: a glowing champion ring + crown so it reads as a dangerous, loot-dropping target
      if (e.elite) {
        const ec = "#ffd23f", pr = 0.6 + 0.4 * Math.sin(now / 160 + e.id);
        ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = 0.45 + 0.3 * pr; ctx.strokeStyle = ec; ctx.lineWidth = 2.5;
        if (theme.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = ec; }
        ctx.beginPath(); ctx.ellipse(0, 0, e.radius * 1.25, e.radius * 0.7, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(s.x, s.y);
      if (e.flip < 0) ctx.scale(-1, 1);
      ctx.scale(e.xj || 1, 1);
      if (theme.effects.glow && (def.role === "boss" || e.elite)) { ctx.shadowBlur = 18; ctx.shadowColor = e.elite ? "#ffd23f" : col; }
      const role = def.role, bob = Math.sin(e.bob) * 1.7, ls = Math.sin(e.bob) * 2.4;
      ctx.lineCap = "round";

      if (role === "swarm") {
        // tiny crawling tick: low body + scuttling legs + dot eyes
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -5, 7, 5, 0, 0, TAU); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 1.5; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 3, -4); ctx.lineTo(k * 7, -1 + Math.sin(e.bob + k) * 1.5); ctx.stroke(); }
        ctx.fillStyle = "#ff3a3a"; ctx.beginPath(); ctx.arc(3, -7, 1.1, 0, TAU); ctx.arc(6, -7, 1.1, 0, TAU); ctx.fill();
      } else if (role === "support") {
        const fb = Math.sin(e.bob) * 4, hh = 30; ctx.globalAlpha = (e.phaseA != null ? e.phaseA : 0.8);
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-13, -6 + fb); ctx.quadraticCurveTo(-15, -hh + fb, 0, -hh - 4 + fb); ctx.quadraticCurveTo(15, -hh + fb, 13, -6 + fb);
        for (let k = 0; k <= 4; k++) { ctx.lineTo(13 - k * 6.5, (k % 2 ? -2 : -8) + fb); } ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = "#0a0a14"; ctx.beginPath(); ctx.arc(-4, -hh * 0.62 + fb, 2.4, 0, TAU); ctx.arc(4, -hh * 0.62 + fb, 2.4, 0, TAU); ctx.fill();
      } else if (role === "exploder") {
        // bloated round zombie, swollen, glowing cracks
        const sw = 1 + (e.swell || 0) * 0.45, r = 13 * sw;
        ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-6, -6); ctx.moveTo(5, 0); ctx.lineTo(6, -6); ctx.stroke();
        ctx.fillStyle = e.armed ? (Math.floor(now / 60) % 2 ? "#ffffff" : "#ff5a3a") : body;
        ctx.beginPath(); ctx.arc(0, -r - 4 + bob, r, 0, TAU); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.fillStyle = rgba("#ff3a2a", 0.5 + 0.4 * Math.sin(now / 80)); ctx.beginPath(); ctx.arc(0, -r - 4 + bob, r * 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1a0a0a"; ctx.beginPath(); ctx.arc(-3, -r - 6 + bob, 1.3, 0, TAU); ctx.arc(3, -r - 6 + bob, 1.3, 0, TAU); ctx.fill();
      } else if (role === "tank") {
        // giant stacked husk + boulder fists + tiny head
        const w = 22;
        ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-9, -12); ctx.moveTo(9, 0); ctx.lineTo(9, -12); ctx.stroke();
        for (let k = 0; k < 4; k++) { const y = -12 - k * 11 + bob; ctx.fillStyle = flash ? "#fff" : (k % 2 ? darken(col, 0.16) : col); ctx.fillRect(-w + k, y - 11, (w - k) * 2, 11); ctx.strokeStyle = darken(col, 0.5); ctx.lineWidth = 1.5; ctx.strokeRect(-w + k, y - 11, (w - k) * 2, 11); }
        const dmgF = 1 - e.hp / e.maxHp; if (dmgF > 0.1) { ctx.strokeStyle = rgba("#ff7a2a", dmgF); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -52 + bob); ctx.lineTo(2, -34 + bob); ctx.lineTo(-3, -20 + bob); ctx.stroke(); }
        ctx.fillStyle = flash ? "#fff" : skin; ctx.beginPath(); ctx.arc(0, -60 + bob, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = flash ? "#fff" : dark; ctx.beginPath(); ctx.arc(-w - 3, -22 + bob, 8, 0, TAU); ctx.arc(w + 3, -22 + bob, 8, 0, TAU); ctx.fill();
      } else if (role === "charger") {
        // hulking skull-bull
        const hh = 30; ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-9, -12); ctx.moveTo(7, 0); ctx.lineTo(9, -12); ctx.stroke();
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-15, -10 + bob); ctx.lineTo(-12, -hh + bob); ctx.lineTo(12, -hh + bob); ctx.lineTo(15, -10 + bob); ctx.closePath(); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.fillStyle = flash ? "#fff" : "#e8e0d0"; ctx.beginPath(); ctx.arc(0, -hh - 3 + bob, 8, 0, TAU); ctx.fill();   // skull
        ctx.fillStyle = "#201810"; ctx.beginPath(); ctx.arc(-3, -hh - 4 + bob, 1.6, 0, TAU); ctx.arc(3, -hh - 4 + bob, 1.6, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#efe8d8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, -hh - 3 + bob); ctx.lineTo(19, -hh - 8 + bob); ctx.moveTo(-6, -hh - 3 + bob); ctx.lineTo(-19, -hh - 8 + bob); ctx.stroke();   // horns
      } else if (role === "ranged") {
        // bloated spitter, big drooling maw
        const hh = 28; ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-7, -7); ctx.moveTo(5, 0); ctx.lineTo(7, -7); ctx.stroke();
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(0, -6 + bob); ctx.bezierCurveTo(-17, -8 + bob, -12, -hh + bob, 0, -hh + bob); ctx.bezierCurveTo(12, -hh + bob, 17, -8 + bob, 0, -6 + bob); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.fillStyle = "#160e06"; ctx.beginPath(); ctx.ellipse(0, -hh * 0.55 + bob, 6, 4, 0, 0, TAU); ctx.fill();   // maw
        ctx.fillStyle = "#9fe04a"; ctx.beginPath(); ctx.arc(0, -hh * 0.4 + bob, 2, 0, TAU); ctx.fill();   // drool
        ctx.fillStyle = "#160e06"; ctx.beginPath(); ctx.arc(-5, -hh * 0.78 + bob, 1.4, 0, TAU); ctx.arc(5, -hh * 0.78 + bob, 1.4, 0, TAU); ctx.fill();
      } else if (role === "spawner") {
        // wide brood mother + glowing egg sac belly
        const hh = 24; ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -hh * 0.5 + bob, 24, hh * 0.62, 0, 0, TAU); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.strokeStyle = dark; ctx.lineWidth = 2; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 9, -4 + bob); ctx.lineTo(k * 11, 4 + Math.sin(e.bob + k) * 2); ctx.stroke(); }   // legs
        ctx.fillStyle = rgba("#ffd0ff", 0.4 + (e.bulge || 0) * 0.45); ctx.beginPath(); ctx.ellipse(0, -hh * 0.4 + bob, 14, 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#a040d0"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-6 + k * 6, -hh * 0.4 + bob, 3, 0, TAU); ctx.fill(); }
      } else if (role === "special") {
        // hooded necro + staff orb
        const hh = 40; ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-13, bob); ctx.lineTo(0, -hh + bob); ctx.lineTo(13, bob); ctx.closePath(); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.fillStyle = "#0a1a12"; ctx.beginPath(); ctx.arc(0, -hh * 0.62 + bob, 5, 0, TAU); ctx.fill();   // hood void
        ctx.fillStyle = "#7affc0"; ctx.beginPath(); ctx.arc(-2, -hh * 0.62 + bob, 1.3, 0, TAU); ctx.arc(2, -hh * 0.62 + bob, 1.3, 0, TAU); ctx.fill();   // glowing eyes
        ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, bob); ctx.lineTo(15, -hh * 0.9 + bob); ctx.stroke();   // staff
        ctx.fillStyle = "#7affc0"; if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = "#7affc0"; } ctx.beginPath(); ctx.arc(15, -hh * 0.92 + bob, 4 + (e.cast || 0) * 3, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      } else if (role === "boss") {
        const hh = 70, w = 52; ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -hh * 0.5 + bob, w, hh * 0.55, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = lighten(col, 0.3); ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = darken(col, 0.2); ctx.lineWidth = 4; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 16, -8 + bob); ctx.quadraticCurveTo(k * 22, 6 + bob, k * 26, 14 + Math.sin(now / 200 + k) * 4); ctx.stroke(); }
        ctx.fillStyle = "#0a0008"; ctx.beginPath(); ctx.ellipse(0, -hh * 0.45 + bob, w * 0.7, 12, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#fff5e0"; ctx.beginPath(); for (let k = -6; k <= 6; k++) { ctx.lineTo(k * (w * 0.7 / 6), -hh * 0.45 + bob + (k % 2 ? 8 : -8)); } ctx.lineTo(w * 0.7, -hh * 0.45 + bob); ctx.lineTo(-w * 0.7, -hh * 0.45 + bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba("#ff2a2a", 0.6 + 0.3 * Math.sin(now / 120)); ctx.beginPath(); ctx.arc(0, -hh * 0.45 + bob, 7, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#ffe14d"; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * 22, -hh * 0.78 + bob, 4, 0, TAU); ctx.fill(); }
      } else if (role === "runner") {
        // lean sprinting ghoul, leaning forward, arms trailing
        ctx.rotate(-0.22); const hh = 26;
        ctx.strokeStyle = dark; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-6 - ls, -10); ctx.moveTo(4, 0); ctx.lineTo(8 + ls, -9); ctx.stroke();   // stride
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-4, -8 + bob); ctx.lineTo(-2, -hh + bob); ctx.lineTo(9, -hh + 3 + bob); ctx.lineTo(6, -7 + bob); ctx.closePath(); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.strokeStyle = skin; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -hh * 0.8 + bob); ctx.lineTo(-10, -hh * 0.5 + bob); ctx.stroke();   // trailing arm
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(7, -hh + 1 + bob, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#0a1418"; ctx.beginPath(); ctx.arc(8, -hh + 1 + bob, 1.4, 0, TAU); ctx.fill();
      } else {
        // SHAMBLER — classic hunched zombie, arms reaching forward
        const hh = 28, sway = Math.sin(e.bob * 0.5) * 2;
        ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4 - ls, -10); ctx.moveTo(4, 0); ctx.lineTo(4 + ls, -10); ctx.stroke();   // legs
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-7, -9 + bob); ctx.lineTo(-6, -hh + bob); ctx.quadraticCurveTo(1, -hh - 2 + bob, 8, -hh + 3 + bob); ctx.lineTo(6, -9 + bob); ctx.closePath(); ctx.fill(); this._rim(ctx, theme, col); ctx.stroke();
        ctx.fillStyle = rgba(p.blood, 0.85); ctx.beginPath(); ctx.arc(-1, -17 + bob, 2.2, 0, TAU); ctx.fill();   // wound
        ctx.strokeStyle = skin; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(2, -hh * 0.78 + bob); ctx.lineTo(13, -hh * 0.7 + bob); ctx.lineTo(18, -hh * 0.74 + bob); ctx.stroke();   // arms out
        ctx.beginPath(); ctx.moveTo(1, -hh * 0.7 + bob); ctx.lineTo(11, -hh * 0.55 + bob); ctx.stroke();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(sway + 2, -hh - 1 + bob, 5.5, 0, TAU); ctx.fill(); this._rim(ctx, theme, col); ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "#180808"; ctx.beginPath(); ctx.arc(sway, -hh - 1 + bob, 1, 0, TAU); ctx.arc(sway + 4, -hh - 1 + bob, 1, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#3a0a0a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sway + 1, -hh + 2.5 + bob); ctx.lineTo(sway + 4, -hh + 2.5 + bob); ctx.stroke();   // mouth
      }
      ctx.restore();
    }

    drawTurret(ctx, theme, t, now) {
      const s = this.w2s(t.wx, t.wy), p = theme.palette, col = "#3df0a0";
      ctx.save(); ctx.translate(s.x, s.y);
      if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
      ctx.strokeStyle = darken(col, 0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-3, -10); ctx.moveTo(7, 0); ctx.lineTo(3, -10); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(-8, -22, 16, 13); this._rim(ctx, theme, col); ctx.strokeRect(-8, -22, 16, 13);
      ctx.fillStyle = "#0a1a12"; ctx.beginPath(); ctx.arc(0, -15, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(1, -16, 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(Math.sin(now / 200) * 4, -30); ctx.stroke();
      ctx.shadowBlur = 0; const hp = t.hp / t.maxHp; ctx.fillStyle = rgba("#000", 0.5); ctx.fillRect(-9, -27, 18, 2.5); ctx.fillStyle = hp > 0.4 ? col : p.danger; ctx.fillRect(-9, -27, 18 * hp, 2.5);
      ctx.restore();
    }

    drawProjectile(ctx, theme, b, now) {
      const s = this.w2s(b.wx, b.wy), col = b.color || theme.palette.bullet;
      ctx.save();
      if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
      ctx.fillStyle = col; ctx.strokeStyle = col;
      const z = b.z || 0;
      if (b.draw === "fork") { ctx.translate(s.x, s.y - 6); ctx.rotate(now / 60); ctx.lineWidth = 3; ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 0.5 - Math.PI / 2) * 9, Math.sin(k * 0.5 - Math.PI / 2) * 9); } ctx.stroke(); }
      else if (b.draw === "blob") { if (z > 0) { ctx.fillStyle = rgba("#000", 0.25); ctx.beginPath(); ctx.ellipse(s.x, s.y, 6, 3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = col; } ctx.beginPath(); ctx.arc(s.x, s.y - 6 - z, 6, 0, TAU); ctx.fill(); }
      else if (b.draw === "dart") { ctx.translate(s.x, s.y - 6); ctx.rotate(Math.atan2(b.vy * KY, b.vx * KX)); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill(); }
      else if (b.draw === "bolt") { ctx.translate(s.x, s.y - 6); ctx.rotate(Math.atan2(b.vy * KY, b.vx * KX)); ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -2.5); ctx.lineTo(-5, 2.5); ctx.closePath(); ctx.fill(); }
      else { ctx.translate(s.x, s.y - 6); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }

    drawEnemyProj(ctx, theme, b) {
      const s = this.w2s(b.wx, b.wy), col = b.color || "#9fc83a";
      ctx.save(); if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
      if (b.z > 0) { ctx.fillStyle = rgba("#000", 0.25); ctx.beginPath(); ctx.ellipse(s.x, s.y, 6, 3, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y - 6 - (b.z || 0), 6, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawPickup(ctx, theme, pu, now, def) {
      const s = this.w2s(pu.wx, pu.wy), bob = Math.sin(now / 250 + pu.wx) * 4, p = theme.palette;
      ctx.save();
      ctx.fillStyle = rgba("#000", 0.25); ctx.beginPath(); ctx.ellipse(s.x, s.y, 7, 3.5, 0, 0, TAU); ctx.fill();
      ctx.translate(s.x, s.y - 12 - bob);
      if (pu.kind === "xp") {
        const col = p.accent; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      } else {
        const col = (def && def.color) || p.bullet; if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = col; }
        if (pu.kind === "weapon") { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillStyle = rgba(col, 0.2); ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke(); }
        else { ctx.fillStyle = rgba(col, 0.9); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.font = "800 12px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pu.kind === "weapon" ? (def && def.name ? def.name[0] : "?") : (def && def.icon ? def.icon : "+"), 0, 1);
        // floating name label so the player learns what each pickup is
        ctx.shadowBlur = 0; ctx.font = "700 9px " + theme.fonts.ui; ctx.fillStyle = rgba("#000", 0.5); ctx.fillRect(-26, 12, 52, 12);
        ctx.fillStyle = col; ctx.fillText((def && def.name ? def.name : "").toUpperCase(), 0, 18.5);
      }
      ctx.restore();
    }

    drawReticle(ctx, theme, ret, now) {
      const s = this.w2s(ret.wx, ret.wy), p = theme.palette, col = ret.lock ? p.danger : p.accent;
      ctx.save(); ctx.translate(s.x, s.y - 8);
      if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
      ctx.strokeStyle = col; ctx.lineWidth = 2; const r = 11 + Math.sin(now / 150) * 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.beginPath(); for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4)); ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4)); } ctx.stroke();
      ctx.restore();
    }

    drawZap(ctx, theme, z) {
      const a = Math.max(0, z.life / z.maxLife);
      ctx.save(); if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = z.color; }
      ctx.strokeStyle = rgba(z.color, a); ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.beginPath();
      for (let i = 0; i < z.pts.length - 1; i++) { const p0 = this.w2s(z.pts[i].wx, z.pts[i].wy), p1 = this.w2s(z.pts[i + 1].wx, z.pts[i + 1].wy), segs = 4; ctx.moveTo(p0.x, p0.y - 8); for (let k = 1; k <= segs; k++) { const t = k / segs, jx = k < segs ? (Math.random() * 12 - 6) : 0, jy = k < segs ? (Math.random() * 12 - 6) : 0; ctx.lineTo(p0.x + (p1.x - p0.x) * t + jx, p0.y - 8 + (p1.y - p0.y) * t + jy); } }
      ctx.stroke(); ctx.restore();
    }

    drawRail(ctx, theme, r) {
      const a = Math.max(0, r.life / r.maxLife), p0 = this.w2s(r.wx, r.wy), p1 = this.w2s(r.x2, r.y2);
      ctx.save(); if (theme.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = r.color; }
      ctx.strokeStyle = rgba(r.color, a); ctx.lineWidth = 3 + 3 * a; ctx.beginPath(); ctx.moveTo(p0.x, p0.y - 8); ctx.lineTo(p1.x, p1.y - 8); ctx.stroke();
      ctx.restore();
    }

    drawSweep(ctx, theme, sw) {
      const a = Math.max(0, sw.life / sw.maxLife), s = this.w2s(sw.wx, sw.wy);
      ctx.save(); ctx.translate(s.x, s.y - 8); if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = sw.color; }
      ctx.fillStyle = rgba(sw.color, 0.4 * a); ctx.strokeStyle = rgba(sw.color, a); ctx.lineWidth = 3;
      const prog = 1 - a, a0 = sw.ang - sw.half + prog * 0.6, a1 = sw.ang + sw.half;
      ctx.beginPath(); ctx.moveTo(0, 0); for (let t = a0; t <= a1; t += 0.12) ctx.lineTo(Math.cos(t) * sw.r, Math.sin(t) * sw.r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }

    drawOrbit(ctx, theme, pl, orbit, now) {
      if (!orbit || !orbit.count) return;
      const s = this.w2s(pl.wx, pl.wy), col = "#7ad0ff";
      ctx.save(); ctx.translate(s.x, s.y - 14); if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = col; }
      ctx.fillStyle = col;
      for (let k = 0; k < orbit.count; k++) { const a = orbit.ang + k * TAU / orbit.count, x = Math.cos(a) * orbit.r, y = Math.sin(a) * orbit.r * 0.5; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(4, 0); ctx.lineTo(0, 9); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
      ctx.restore();
    }

    drawBeam(ctx, theme, beam) {
      const s = this.w2s(beam.wx, beam.wy);
      ctx.save(); ctx.translate(s.x, s.y - 14);
      const col = "#ff5a36"; if (theme.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = col; }
      ctx.rotate(Math.atan2(Math.sin(beam.ang) * KY, Math.cos(beam.ang) * KX));
      for (let layer = 0; layer < 3; layer++) { ctx.fillStyle = rgba(layer === 0 ? "#ffe14d" : (layer === 1 ? "#ff8c2a" : "#ff3a1a"), 0.5 - layer * 0.12); const len = beam.len * (KX + KY), ww = 8 + layer * 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -ww); ctx.lineTo(len, ww); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }

    drawShockwave(ctx, theme, sw) {
      const s = this.w2s(sw.wx, sw.wy), t = sw.life / sw.maxLife, r = sw.maxR * (1 - t);
      ctx.save(); ctx.globalAlpha = t; if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = sw.color; }
      ctx.strokeStyle = sw.color; ctx.lineWidth = 3 + 4 * t; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.5, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }

    // ----------------- HUD / chrome -----------------
    drawHUD(ctx, theme, d) {
      const p = theme.palette;
      ctx.save(); ctx.textBaseline = "top";
      if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.accent; }
      ctx.fillStyle = p.text; ctx.font = "800 24px " + theme.fonts.ui; ctx.textAlign = "left";
      ctx.fillText(String(d.score).padStart(7, "0"), 18, 12);
      ctx.shadowBlur = 0; ctx.font = "600 13px " + theme.fonts.ui; ctx.fillStyle = p.textDim; ctx.textAlign = "right";
      ctx.fillText("WAVE " + d.wave + "   LVL " + d.level, this.w - 18, 14);
      let ry = 34;
      if (d.combo > 1) { ctx.font = "800 20px " + theme.fonts.ui; ctx.fillStyle = p.danger; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.danger; } ctx.fillText("x" + d.combo + " COMBO", this.w - 18, ry); ctx.shadowBlur = 0; ry += 22; }
      if (d.mod) { ctx.font = "800 13px " + theme.fonts.ui; ctx.fillStyle = d.mod.color; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = d.mod.color; } ctx.fillText("⚠ " + d.mod.name.split(" — ")[0], this.w - 18, ry); ctx.shadowBlur = 0; }
      // HP + SHIELD bars (top-left, under the score) — armor is FELT
      const pl = d.pl;
      if (pl) {
        const bx0 = 18, bw0 = 168, hy = 44;
        ctx.fillStyle = rgba("#000", 0.5); ctx.fillRect(bx0, hy, bw0, 7);
        ctx.fillStyle = (pl.hp / pl.maxHp) > 0.3 ? "#46f06a" : p.danger; ctx.fillRect(bx0, hy, bw0 * Math.max(0, pl.hp / pl.maxHp), 7);
        if (pl.maxShield > 0) { ctx.fillStyle = rgba("#000", 0.5); ctx.fillRect(bx0, hy + 9, bw0, 5); ctx.fillStyle = "#5ad1ff"; if (theme.effects.glow) { ctx.shadowBlur = 6; ctx.shadowColor = "#5ad1ff"; } ctx.fillRect(bx0, hy + 9, bw0 * Math.max(0, pl.shield / pl.maxShield), 5); ctx.shadowBlur = 0; }
      }
      const bw = Math.min(this.w - 36, 520), bx = (this.w - bw) / 2, by = this.h - 16, xpF = Math.max(0, Math.min(1, d.xpF));
      ctx.fillStyle = rgba("#000", 0.45); ctx.fillRect(bx, by, bw, 7);
      ctx.fillStyle = p.accent; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.accent; } ctx.fillRect(bx, by, bw * xpF, 7); ctx.shadowBlur = 0;
      ctx.restore();
    }

    drawWeaponTag(ctx, theme, weapon, owned, level) {
      const p = theme.palette; ctx.save(); ctx.textBaseline = "bottom"; ctx.textAlign = "left"; ctx.font = "700 13px " + theme.fonts.ui;
      const col = (weapon && weapon.color) || p.accent; ctx.fillStyle = col; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = col; }
      const lv = level ? "  Lv" + level : "";
      ctx.fillText("◢ " + (weapon ? weapon.name : "") + lv + "   (" + owned + ")   [Q/E swap]", 18, this.h - 26);
      ctx.restore();
    }

    drawAimToggle(ctx, theme, mode) {
      const p = theme.palette, w = 150, h = 26, x = (this.w - w) / 2, y = 38;
      this._aimRect = { x: x, y: y, w: w, h: h };
      ctx.save();
      ctx.fillStyle = rgba("#000", 0.42); this._roundRect(ctx, x, y, w, h, 13); ctx.fill();
      ctx.strokeStyle = mode === "auto" ? p.accent : p.danger; ctx.lineWidth = 1.5; if (theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = ctx.strokeStyle; } this._roundRect(ctx, x, y, w, h, 13); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = p.text; ctx.font = "700 12px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((mode === "auto" ? "● AUTO-AIM" : "✛ MANUAL AIM") + "   (F)", x + w / 2, y + h / 2 + 1);
      ctx.restore();
    }
    aimToggleHit(px, py) { const r = this._aimRect; return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

    drawBossBar(ctx, theme, boss) {
      const p = theme.palette, w = Math.min(this.w - 80, 560), x = (this.w - w) / 2, y = 74;
      ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = p.text; ctx.font = "700 13px " + theme.fonts.ui; ctx.textBaseline = "bottom";
      ctx.fillText(boss.def.name.toUpperCase(), this.w / 2, y - 4);
      ctx.fillStyle = rgba("#000", 0.55); ctx.fillRect(x, y, w, 10);
      const f = Math.max(0, boss.hp / boss.maxHp); ctx.fillStyle = p.danger; if (theme.effects.glow) { ctx.shadowBlur = 10; ctx.shadowColor = p.danger; } ctx.fillRect(x, y, w * f, 10);
      ctx.shadowBlur = 0; ctx.strokeStyle = rgba(p.text, 0.4); ctx.lineWidth = 1; ctx.strokeRect(x, y, w, 10);
      ctx.restore();
    }

    drawDamageNumbers(ctx, theme, list) {
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const d of list) { const s = this.w2s(d.wx, d.wy), t = d.life / d.maxLife; ctx.globalAlpha = Math.min(1, t * 1.5); ctx.font = (d.crit ? "800 " : "700 ") + (d.crit ? 20 : 14) + "px " + theme.fonts.ui; ctx.fillStyle = d.crit ? "#ffe14d" : "#ffffff"; ctx.fillText(d.crit ? d.val + "!" : String(d.val), s.x, s.y - 26 - (1 - t) * 24); }
      ctx.restore();
    }

    drawToasts(ctx, theme, toasts, now) {
      if (!toasts.length) return;
      const p = theme.palette; ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < toasts.length; i++) { const t = toasts[i], pr = (now - t.born) / t.life, alpha = pr < 0.15 ? pr / 0.15 : (1 - (pr - 0.15) / 0.85); ctx.globalAlpha = Math.max(0, alpha); ctx.font = "800 " + (t.big ? 26 : 16) + "px " + theme.fonts.ui; ctx.fillStyle = t.color || p.accent; if (theme.effects.glow) { ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; } ctx.fillText(t.text, this.w / 2, this.h * 0.30 - pr * 16 + i * 26); }
      ctx.restore();
    }

    drawIntro(ctx, theme, alpha, isTouch) {
      const p = theme.palette;
      const lines = isTouch
        ? ["Drag LEFT side to MOVE   •   DASH button to dodge", "Tap the AIM pill to switch AUTO / MANUAL aim", "Pickups:  ✚ heal   ⚡ speed   ❄ freeze   💣 nuke   ★ gold", "Survive, grab XP shards, LEVEL UP to pick upgrades!"]
        : ["WASD / Arrows MOVE   •   SPACE dash   •   Q / E swap weapon", "Press F to switch AUTO / MANUAL aim (mouse aims)", "Pickups:  ✚ heal   ⚡ speed   ❄ freeze   💣 nuke   ★ gold", "Survive, grab XP shards, LEVEL UP to pick upgrades!"];
      const fs = this.w < 520 ? 11 : 13, lh = fs + 8, bw = Math.min(this.w - 16, 480), bh = lh * lines.length + 18, bx = (this.w - bw) / 2, by = this.h * 0.60;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = rgba("#000", 0.55); this._roundRect(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.strokeStyle = rgba(p.accent, 0.5); ctx.lineWidth = 1; this._roundRect(ctx, bx, by, bw, bh, 10); ctx.stroke();
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "600 " + fs + "px " + theme.fonts.ui;
      for (let i = 0; i < lines.length; i++) { ctx.fillStyle = i === lines.length - 1 ? p.accent : p.text; ctx.fillText(lines[i], this.w / 2, by + 14 + i * lh); }
      ctx.restore();
    }

    drawLevelUp(ctx, theme, cards, sel) {
      const p = theme.palette;
      ctx.save(); ctx.fillStyle = rgba("#000", 0.62); ctx.fillRect(0, 0, this.w, this.h);
      ctx.textAlign = "center"; ctx.fillStyle = p.accent; if (theme.effects.glow) { ctx.shadowBlur = 14; ctx.shadowColor = p.accent; }
      ctx.font = "800 30px " + theme.fonts.ui; ctx.fillText("LEVEL UP!", this.w / 2, this.h * 0.16);
      ctx.shadowBlur = 0; ctx.fillStyle = p.textDim; ctx.font = "600 14px " + theme.fonts.ui; ctx.fillText("Choose an upgrade — tap a card or press 1 / 2 / 3", this.w / 2, this.h * 0.16 + 30);
      const n = cards.length, cw = Math.min(190, (this.w - 40) / n - 14), ch = Math.min(232, this.h * 0.46), gap = 16;
      const totalW = n * cw + (n - 1) * gap, x0 = (this.w - totalW) / 2, y0 = this.h * 0.30;
      this._cardRects = [];
      for (let i = 0; i < n; i++) {
        const c = cards[i], x = x0 + i * (cw + gap), active = i === sel;
        this._cardRects.push({ x: x, y: y0, w: cw, h: ch });
        ctx.fillStyle = active ? rgba(c.color || p.accent, 0.22) : rgba("#ffffff", 0.05);
        ctx.strokeStyle = c.color || p.accent; ctx.lineWidth = active ? 3 : 1.5; if (theme.effects.glow && active) { ctx.shadowBlur = 16; ctx.shadowColor = c.color || p.accent; }
        this._roundRect(ctx, x, y0, cw, ch, 10); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = c.color || p.accent; ctx.font = "800 28px " + theme.fonts.ui; ctx.fillText(c.icon || "★", x + cw / 2, y0 + 42);
        ctx.fillStyle = p.text; ctx.font = "800 15px " + theme.fonts.ui; this._wrap(ctx, c.title, x + cw / 2, y0 + 78, cw - 18, 18);
        ctx.fillStyle = c.kind === "weapon" ? c.color : p.accent; ctx.font = "700 12px " + theme.fonts.ui; ctx.fillText(c.tag || "", x + cw / 2, y0 + 112);
        ctx.fillStyle = p.textDim; ctx.font = "500 12px " + theme.fonts.ui; this._wrap(ctx, c.desc, x + cw / 2, y0 + 138, cw - 22, 15);
        ctx.fillStyle = p.textDim; ctx.font = "700 13px " + theme.fonts.ui; ctx.fillText("[" + (i + 1) + "]", x + cw / 2, y0 + ch - 14);
      }
      ctx.restore();
    }
    levelUpHit(px, py) { if (!this._cardRects) return -1; for (let i = 0; i < this._cardRects.length; i++) { const r = this._cardRects[i]; if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i; } return -1; }

    _roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    _wrap(ctx, text, cx, y, maxW, lh) { const words = String(text).split(" "); let line = "", yy = y; for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; } else line = test; } if (line) ctx.fillText(line, cx, yy); }

    drawTouchControls(ctx, theme, stick, aimStick, aimMode, dashPos) {
      const p = theme.palette; ctx.save();
      // dash button (always available, bottom-right)
      ctx.globalAlpha = 0.22; ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(dashPos.x, dashPos.y, 40, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.85; ctx.fillStyle = "#fff"; ctx.font = "800 13px " + theme.fonts.ui; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("DASH", dashPos.x, dashPos.y);
      if (aimMode === "manual" && aimStick && aimStick.active) {
        ctx.lineWidth = 2; ctx.strokeStyle = p.danger; ctx.fillStyle = p.danger;
        ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.arc(aimStick.baseX, aimStick.baseY, 60, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(aimStick.kx, aimStick.ky, 24, 0, TAU); ctx.fill();
      }
      if (stick && stick.active) {
        ctx.lineWidth = 2; ctx.strokeStyle = p.accent; ctx.fillStyle = p.accent;
        ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, 60, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, 60, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(stick.kx, stick.ky, 24, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    drawVignette(ctx, theme) {
      if (!theme.effects.vignette) return;
      const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    }

    drawScanlines(ctx, theme) {
      if (!theme.effects.scanlines) return;
      if (!this._scan) { const o = document.createElement("canvas"); o.width = 1; o.height = 3; const c = o.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 1, 1); this._scan = ctx.createPattern(o, "repeat"); }
      ctx.save(); ctx.globalAlpha = 0.10; ctx.fillStyle = this._scan; ctx.fillRect(0, 0, this.w, this.h); ctx.restore();
    }

    centerText(ctx, theme, text, sub) {
      const p = theme.palette; ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (theme.effects.glow) { ctx.shadowBlur = 18; ctx.shadowColor = p.accent; }
      ctx.fillStyle = p.text; ctx.font = "800 40px " + theme.fonts.ui; ctx.fillText(text, this.w / 2, this.h / 2 - 10);
      if (sub) { ctx.shadowBlur = 0; ctx.fillStyle = p.textDim; ctx.font = "600 16px " + theme.fonts.ui; ctx.fillText(sub, this.w / 2, this.h / 2 + 28); }
      ctx.restore();
    }
  }

  Arcade.Zombies = Arcade.Zombies || {};
  Arcade.Zombies.Renderer = Renderer;
})(window.Arcade = window.Arcade || {});
