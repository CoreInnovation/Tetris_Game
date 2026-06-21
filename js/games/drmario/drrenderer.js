/* =========================================================
   Dr. Quackers renderer — draws the bottle, capsule pills (with
   rounded "joined" capsule ends) and goofy wobbling viruses.
   Self-contained gfx helpers so the module doesn't depend on the
   Tetris renderer.
   ========================================================= */
(function (Arcade) {
  "use strict";

  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, amt) {
    if (typeof hex !== "string" || hex[0] !== "#") return hex;
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  }
  function rgba(hex, a) {
    if (typeof hex !== "string" || hex[0] !== "#") return hex;
    const { r, g, b } = hexToRgb(hex);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // per-corner rounded rect: radii {tl,tr,br,bl}
  function rrc(ctx, x, y, w, h, tl, tr, br, bl) {
    const m = Math.min(w, h) / 2; // clamp so radii never overshoot the rect
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  class Renderer {
    constructor(cfg) {
      this.cfg = cfg; // { COLS, ROWS, SPAWN_COL }
      this.layout = null;
      this._bg = null; this._bgctx = null;
      this._bgW = 0; this._bgH = 0; this._bgLast = -1; this._bgThemeId = null;
      this._scanPattern = null;
    }

    computeLayout(w, h, bottomInset) {
      const COLS = this.cfg.COLS, ROWS = this.cfg.ROWS;
      bottomInset = bottomInset || 0;
      const compact = (w / h < 0.95) || w < 560;
      let L;
      if (!compact) {
        const panelU = 5.2, gapU = 0.7, neckU = 1.2;
        const totalU = COLS + panelU + gapU;
        const cell = Math.max(1, Math.floor(Math.min((w - 32) / totalU, (h - 32 - bottomInset) / (ROWS + neckU))));
        const boardW = COLS * cell, boardH = ROWS * cell, neckH = Math.round(neckU * cell);
        const panelW = Math.round(panelU * cell), gap = Math.round(gapU * cell);
        const totalW = boardW + gap + panelW;
        const startX = Math.round((w - totalW) / 2);
        const boardY = Math.round((h - bottomInset - boardH + neckH) / 2);
        const panelX = startX + boardW + gap;
        const pbW = Math.min(panelW, Math.round(3.4 * cell)), pbH = Math.round(1.8 * cell);
        L = {
          mode: "wide", compact: false, cell: cell, neckH: neckH,
          board: { x: startX, y: boardY, w: boardW, h: boardH },
          next: { box: { x: panelX + (panelW - pbW) / 2, y: boardY + 24, w: pbW, h: pbH }, label: "NEXT" },
          stats: { x: panelX, y: boardY + 24 + pbH + 30, w: panelW, align: "left" }
        };
      } else {
        const topH = Math.min(120, Math.round(h * 0.15));
        const neckH = Math.max(8, Math.round(0.8 * Math.min((w - 16) / COLS, (h - topH - 16 - bottomInset) / ROWS)));
        const availH = h - topH - 16 - bottomInset - neckH;
        const cell = Math.max(1, Math.floor(Math.min((w - 16) / COLS, availH / ROWS)));
        const boardW = COLS * cell, boardH = ROWS * cell;
        const boardX = Math.round((w - boardW) / 2);
        const boardY = topH + 8 + neckH;
        const half = Math.round((w - 16) / 2);
        const pbH = Math.max(14, topH - 30), pbW = Math.max(20, Math.min(half - 16, pbH * 2.2));
        L = {
          mode: "compact", compact: true, cell: cell, neckH: neckH,
          board: { x: boardX, y: boardY, w: boardW, h: boardH },
          next: { box: { x: 8 + (half - pbW) / 2, y: 26, w: pbW, h: pbH }, label: "NEXT" },
          stats: { x: 8 + half, y: 14, w: half, align: "center" }
        };
      }
      this.layout = L;
      return L;
    }

    cellPx(r, c) {
      const b = this.layout.board, s = this.layout.cell;
      return { x: b.x + c * s, y: b.y + r * s, size: s };
    }

    // ---- background (cached, throttled) ----
    drawBackground(ctx, theme, w, h, now) {
      const bg = theme.bg;
      if (bg.type !== "animated") { ctx.fillStyle = bg.colors[0]; ctx.fillRect(0, 0, w, h); return; }
      if (!this._bg) { this._bg = document.createElement("canvas"); this._bgctx = this._bg.getContext("2d"); }
      if (this._bgW !== w || this._bgH !== h) { this._bg.width = w; this._bg.height = h; this._bgW = w; this._bgH = h; this._bgLast = -1; }
      if (this._bgThemeId !== theme.id) { this._bgThemeId = theme.id; this._bgLast = -1; }
      if (this._bgLast < 0 || (now - this._bgLast) > 50) { this._paintBg(this._bgctx, theme, w, h, now); this._bgLast = now; }
      ctx.drawImage(this._bg, 0, 0, w, h);
    }
    _paintBg(ctx, theme, w, h, now) {
      const bg = theme.bg;
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, bg.colors[0]); base.addColorStop(0.5, bg.colors[1]); base.addColorStop(1, bg.colors[2]);
      ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      const t = now / 1000;
      const blobs = [theme.palette.R, theme.palette.B, theme.palette.Y];
      ctx.globalCompositeOperation = "lighter";
      blobs.forEach((c, i) => {
        const x = w * (0.5 + 0.42 * Math.sin(t * 0.17 + i * 2.1));
        const y = h * (0.5 + 0.4 * Math.cos(t * 0.13 + i * 2.7));
        const rad = Math.max(w, h) * 0.3;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, rgba(c, 0.14)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = "source-over";
    }

    // ---- bottle frame + neck + grid ----
    drawBottle(ctx, theme) {
      const b = this.layout.board, p = theme.palette, s = this.layout.cell, neck = this.layout.neckH;
      ctx.save();
      // glass body
      ctx.fillStyle = p.board;
      rr(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 12); ctx.fill();
      // grid
      if (theme.effects.gridLines) {
        ctx.strokeStyle = p.grid; ctx.lineWidth = 1; ctx.beginPath();
        for (let c = 1; c < this.cfg.COLS; c++) { const x = Math.round(b.x + c * s) + 0.5; ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); }
        for (let r = 1; r < this.cfg.ROWS; r++) { const y = Math.round(b.y + r * s) + 0.5; ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); }
        ctx.stroke();
      }
      // neck (opening above spawn columns)
      const neckW = 2 * s + 8;
      const neckX = b.x + this.cfg.SPAWN_COL * s - 4;
      ctx.fillStyle = p.board;
      ctx.fillRect(neckX, b.y - neck - 2, neckW, neck + 6);
      ctx.strokeStyle = p.boardBorder; ctx.lineWidth = 3;
      // body outline + neck outline as one shape-ish
      rr(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 12); ctx.stroke();
      ctx.strokeRect(neckX, b.y - neck - 2, neckW, neck + 6);
      // rim cap
      ctx.fillStyle = p.boardBorder;
      ctx.fillRect(neckX - 5, b.y - neck - 8, neckW + 10, 7);
      ctx.restore();
    }

    // ---- a capsule half / single ----
    drawHalf(ctx, x, y, size, color, link, theme, opts) {
      opts = opts || {};
      const inset = Math.max(1, size * 0.06);
      const x0 = x + inset, y0 = y + inset, s = size - inset * 2;
      const big = s * 0.46, flat = s * 0.16;
      // corner radii based on which side joins the partner (flat there)
      let tl = big, tr = big, br = big, bl = big;
      if (link === "R") { tr = flat; br = flat; }       // partner to the right
      else if (link === "L") { tl = flat; bl = flat; }  // partner to the left
      else if (link === "U") { tl = flat; tr = flat; }  // partner above
      else if (link === "D") { bl = flat; br = flat; }  // partner below
      ctx.save();
      ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
      if (theme.block === "neon") {
        if (opts.glow) { ctx.shadowBlur = size * 0.6; ctx.shadowColor = color; }
        const g = ctx.createLinearGradient(x0, y0, x0, y0 + s);
        g.addColorStop(0, shade(color, 0.4)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
        rrc(ctx, x0, y0, s, s, tl, tr, br, bl); ctx.fillStyle = g; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba("#ffffff", 0.4); ctx.lineWidth = Math.max(1, size * 0.05);
        rrc(ctx, x0 + s * 0.14, y0 + s * 0.14, s * 0.72, s * 0.72, tl * 0.6, tr * 0.6, br * 0.6, bl * 0.6); ctx.stroke();
      } else {
        rrc(ctx, x0, y0, s, s, tl, tr, br, bl); ctx.fillStyle = color; ctx.fill();
        // bevel: light top-left highlight, dark edge
        ctx.strokeStyle = shade(color, 0.5); ctx.lineWidth = Math.max(1.5, size * 0.10);
        rrc(ctx, x0 + ctx.lineWidth * 0.5, y0 + ctx.lineWidth * 0.5, s - ctx.lineWidth, s - ctx.lineWidth, tl, tr, br, bl); ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
        rrc(ctx, x0 + 0.5, y0 + 0.5, s - 1, s - 1, tl, tr, br, bl); ctx.stroke();
        // glossy dot
        ctx.fillStyle = rgba("#ffffff", 0.7);
        ctx.beginPath(); ctx.arc(x0 + s * 0.32, y0 + s * 0.30, Math.max(1.5, s * 0.10), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    drawGhostHalf(ctx, x, y, size, color, link, theme) {
      const inset = Math.max(1, size * 0.1), x0 = x + inset, y0 = y + inset, s = size - inset * 2;
      const big = s * 0.3, flat = s * 0.1;
      let tl = big, tr = big, br = big, bl = big;
      if (link === "R") { tr = flat; br = flat; }
      else if (link === "L") { tl = flat; bl = flat; }
      else if (link === "U") { tl = flat; tr = flat; }
      else if (link === "D") { bl = flat; br = flat; }
      ctx.save();
      ctx.strokeStyle = theme.block === "neon" ? rgba(color, 0.5) : theme.palette.ghost;
      ctx.lineWidth = 2;
      rrc(ctx, x0, y0, s, s, tl, tr, br, bl); ctx.stroke();
      ctx.restore();
    }

    // ---- a goofy virus ----
    drawVirus(ctx, x, y, size, color, theme, now, seed) {
      const cx = x + size / 2, cy = y + size / 2, R = size * 0.4;
      const wob = Math.sin(now / 280 + (seed || 0)) * (size * 0.04);
      ctx.save();
      ctx.translate(0, wob);
      if (theme.block === "neon" && theme.effects.glow) { ctx.shadowBlur = size * 0.5; ctx.shadowColor = color; }
      // body
      const g = theme.block === "neon"
        ? (function () { const lg = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.2, cx, cy, R * 1.1); lg.addColorStop(0, shade(color, 0.4)); lg.addColorStop(1, shade(color, -0.2)); return lg; })()
        : color;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // little antennae (kept inside the cell so they never paint into the row above)
      ctx.strokeStyle = shade(color, -0.3); ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.5, cy - R * 0.8); ctx.lineTo(cx - R * 0.7, cy - R * 0.98);
      ctx.moveTo(cx + R * 0.5, cy - R * 0.8); ctx.lineTo(cx + R * 0.7, cy - R * 0.98);
      ctx.stroke();
      ctx.fillStyle = shade(color, -0.3);
      ctx.beginPath(); ctx.arc(cx - R * 0.7, cy - R * 1.02, size * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + R * 0.7, cy - R * 1.02, size * 0.05, 0, Math.PI * 2); ctx.fill();
      // eyes
      const eyeR = R * 0.32, eyeDX = R * 0.42, eyeY = cy - R * 0.12;
      const look = Math.sin(now / 600 + (seed || 0)) * eyeR * 0.3;
      ctx.fillStyle = theme.palette.eye;
      ctx.beginPath(); ctx.arc(cx - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.palette.pupil;
      ctx.beginPath(); ctx.arc(cx - eyeDX + look, eyeY, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + eyeDX + look, eyeY, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
      // grumpy zigzag mouth
      ctx.strokeStyle = theme.palette.pupil; ctx.lineWidth = Math.max(1.2, size * 0.05);
      const my = cy + R * 0.45, mw = R * 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - mw, my);
      ctx.lineTo(cx - mw * 0.33, my - mw * 0.35);
      ctx.lineTo(cx + mw * 0.33, my + mw * 0.1);
      ctx.lineTo(cx + mw, my - mw * 0.3);
      ctx.stroke();
      ctx.restore();
    }

    // ---- previews + text ----
    drawPanelBox(ctx, box, theme) {
      ctx.save();
      ctx.fillStyle = theme.palette.panel; rr(ctx, box.x, box.y, box.w, box.h, 8); ctx.fill();
      ctx.strokeStyle = theme.palette.panelBorder; ctx.lineWidth = 1.5;
      rr(ctx, box.x, box.y, box.w, box.h, 8); ctx.stroke();
      ctx.restore();
    }

    drawNextPill(ctx, box, cL, cR, theme) {
      const cell = Math.min(box.h * 0.7, (box.w * 0.7) / 2);
      const x = box.x + (box.w - cell * 2) / 2, y = box.y + (box.h - cell) / 2;
      this.drawHalf(ctx, x, y, cell, theme.palette[cL], "R", theme, { glow: theme.effects.glow });
      this.drawHalf(ctx, x + cell, y, cell, theme.palette[cR], "L", theme, { glow: theme.effects.glow });
    }

    label(ctx, text, x, y, theme, opts) {
      opts = opts || {};
      ctx.save();
      ctx.font = (opts.size || 13) + "px " + theme.fonts.ui;
      ctx.fillStyle = opts.color || theme.palette.textDim;
      ctx.textAlign = opts.align || "left"; ctx.textBaseline = "alphabetic";
      if (opts.glow && theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = opts.color || theme.palette.accent; }
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    drawStats(ctx, theme, data) {
      const s = this.layout.stats;
      const items = [["LEVEL", String(data.level)], ["VIRUS", String(data.virus)], ["SCORE", data.score.toLocaleString()]];
      if (this.layout.compact) {
        const cw = s.w / 3;
        items.forEach((it, i) => {
          const cx = s.x + cw * i + cw / 2;
          this.label(ctx, it[0], cx, s.y + 12, theme, { align: "center", size: 11 });
          this.label(ctx, it[1], cx, s.y + 34, theme, { align: "center", size: 18, color: theme.palette.text, glow: true });
        });
      } else {
        let y = s.y;
        items.forEach(it => {
          this.label(ctx, it[0], s.x + 4, y, theme, { size: 12 });
          this.label(ctx, it[1], s.x + 4, y + 24, theme, { size: 22, color: theme.palette.text, glow: true });
          y += 56;
        });
      }
    }

    drawScanlines(ctx, theme, w, h) {
      if (!theme.effects.scanlines) return;
      if (!this._scanPattern) {
        const off = document.createElement("canvas"); off.width = 1; off.height = 3;
        const o = off.getContext("2d"); o.fillStyle = "#000"; o.fillRect(0, 0, 1, 1);
        this._scanPattern = ctx.createPattern(off, "repeat");
      }
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = this._scanPattern; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
  }

  Arcade.DrMario = Arcade.DrMario || {};
  Arcade.DrMario.Renderer = Renderer;
})(window.Arcade = window.Arcade || {});
