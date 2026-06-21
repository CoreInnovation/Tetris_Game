/* =========================================================
   Tetris renderer. Stateless-ish drawing helpers driven by the
   active theme. The game owns orchestration (order, shake,
   particles); the renderer knows how to draw each element in
   the current skin.

   Board coordinates: the game grid is COLS x ROWS_TOTAL where the
   top HIDDEN rows are the spawn buffer. The renderer draws using
   VISIBLE rows; callers pass visRow = internalRow - HIDDEN and the
   renderer skips anything with visRow < 0.
   ========================================================= */
(function (Arcade) {
  "use strict";

  const Pieces = Arcade.Tetris.Pieces;

  // ---- color helpers ----
  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function shade(hex, amt) { // amt -1..1 (dark..light)
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

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class Renderer {
    constructor(cfg) {
      this.cfg = cfg; // { COLS, VISIBLE_ROWS, HIDDEN }
      this.layout = null;
      // caches for cheap backgrounds / overlays
      this._bg = null; this._bgctx = null;
      this._bgW = 0; this._bgH = 0; this._bgLast = -1; this._bgThemeId = null;
      this._scanPattern = null;
    }

    // bottomInset reserves space (e.g. the on-screen touch controls) so the
    // board never renders underneath them.
    computeLayout(w, h, bottomInset) {
      const COLS = this.cfg.COLS, ROWS = this.cfg.VISIBLE_ROWS;
      bottomInset = bottomInset || 0;
      const compact = (w / h < 0.95) || w < 560;
      let L;
      if (!compact) {
        // Sides: [panel][gap][board][gap][panel]
        const panelU = 4.6, gapU = 0.55;
        const totalU = COLS + 2 * panelU + 2 * gapU;
        const cell = Math.max(1, Math.floor(Math.min((w - 24) / totalU, (h - 24 - bottomInset) / (ROWS + 0.5))));
        const boardW = COLS * cell, boardH = ROWS * cell;
        const panelW = Math.round(panelU * cell), gap = Math.round(gapU * cell);
        const totalW = panelW + gap + boardW + gap + panelW;
        const startX = Math.round((w - totalW) / 2);
        const boardY = Math.round((h - bottomInset - boardH) / 2);
        const boardX = startX + panelW + gap;
        const rightX = boardX + boardW + gap;
        const previewBox = Math.round(panelW * 0.86);
        L = {
          mode: "wide", cell: cell, compact: false,
          board: { x: boardX, y: boardY, w: boardW, h: boardH },
          hold: { x: startX, y: boardY, w: panelW, label: "HOLD",
                  box: { x: startX + (panelW - previewBox) / 2, y: boardY + 26, w: previewBox, h: previewBox * 0.72 } },
          stats: { x: startX, y: boardY + 26 + previewBox * 0.72 + 22, w: panelW, align: "left" },
          next: { x: rightX, y: boardY, w: panelW, label: "NEXT", count: 5, slots: [] }
        };
        let ny = boardY + 26;
        const nbW = previewBox, nbH = previewBox * 0.62;
        for (let i = 0; i < L.next.count; i++) {
          L.next.slots.push({ x: rightX + (panelW - nbW) / 2, y: ny, w: nbW, h: nbH });
          ny += nbH + 8;
        }
      } else {
        // Compact: top strip [hold | stats | next], board below.
        const topH = Math.min(120, Math.round(h * 0.16));
        const availH = h - topH - 16 - bottomInset;
        const cell = Math.max(1, Math.floor(Math.min((w - 16) / COLS, availH / ROWS)));
        const boardW = COLS * cell, boardH = ROWS * cell;
        const boardX = Math.round((w - boardW) / 2);
        const boardY = topH + 8;
        const third = Math.round((w - 16) / 3);
        const pbH = Math.max(12, topH - 28), pbW = Math.max(12, Math.min(third - 12, pbH * 1.4));
        L = {
          mode: "compact", cell: cell, compact: true,
          board: { x: boardX, y: boardY, w: boardW, h: boardH },
          hold: { x: 8, y: 6, w: third, label: "HOLD",
                  box: { x: 8 + (third - pbW) / 2, y: 24, w: pbW, h: pbH } },
          stats: { x: 8 + third, y: 14, w: third, align: "center" },
          next: { x: 8 + 2 * third, y: 6, w: third, label: "NEXT", count: 3, slots: [] }
        };
        const nbW = Math.max(8, Math.min((third - 16) / 3, pbH * 0.9)), nbH = nbW * 0.7;
        let nx = 8 + 2 * third + (third - (nbW * 3 + 12)) / 2;
        for (let i = 0; i < L.next.count; i++) {
          L.next.slots.push({ x: nx, y: 26, w: nbW, h: nbH });
          nx += nbW + 6;
        }
      }
      this.layout = L;
      return L;
    }

    cellPx(visRow, visCol) {
      const b = this.layout.board, c = this.layout.cell;
      return { x: b.x + visCol * c, y: b.y + visRow * c, size: c };
    }

    // ---- background ----
    // The animated background is the most expensive thing we draw (a base
    // gradient + 3 additive full-screen radial fills). Rather than rebuild it
    // 60x/sec, render it to an offscreen canvas at ~20fps and blit that. The
    // blobs drift slowly, so the throttle is visually indistinguishable.
    drawBackground(ctx, theme, w, h, now) {
      const bg = theme.bg;
      if (bg.type !== "animated") {
        ctx.fillStyle = bg.colors[0];
        ctx.fillRect(0, 0, w, h);
        return;
      }
      if (!this._bg) { this._bg = document.createElement("canvas"); this._bgctx = this._bg.getContext("2d"); }
      if (this._bgW !== w || this._bgH !== h) {
        this._bg.width = w; this._bg.height = h; this._bgW = w; this._bgH = h; this._bgLast = -1;
      }
      if (this._bgThemeId !== theme.id) { this._bgThemeId = theme.id; this._bgLast = -1; }
      if (this._bgLast < 0 || (now - this._bgLast) > 50) {
        this._paintAnimatedBg(this._bgctx, theme, w, h, now);
        this._bgLast = now;
      }
      ctx.drawImage(this._bg, 0, 0, w, h);
    }

    _paintAnimatedBg(ctx, theme, w, h, now) {
      const bg = theme.bg;
      const base = ctx.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, bg.colors[0]);
      base.addColorStop(0.5, bg.colors[1]);
      base.addColorStop(1, bg.colors[2]);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const t = now / 1000;
      const blobs = [
        { c: theme.palette.I, ph: 0 },
        { c: theme.palette.T, ph: 2.1 },
        { c: theme.palette.S, ph: 4.2 }
      ];
      ctx.globalCompositeOperation = "lighter";
      blobs.forEach((bl) => {
        const x = w * (0.5 + 0.42 * Math.sin(t * 0.18 + bl.ph));
        const y = h * (0.5 + 0.40 * Math.cos(t * 0.13 + bl.ph * 1.3));
        const rad = Math.max(w, h) * 0.30;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, rgba(bl.c, 0.16));
        g.addColorStop(1, rgba(bl.c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      });
      ctx.globalCompositeOperation = "source-over";
    }

    // ---- board frame + grid ----
    drawBoardFrame(ctx, theme) {
      const b = this.layout.board, p = theme.palette;
      ctx.save();
      // board background
      ctx.fillStyle = p.board;
      roundRect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 8);
      ctx.fill();
      // grid
      if (theme.effects.gridLines) {
        ctx.strokeStyle = p.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 1; c < this.cfg.COLS; c++) {
          const x = Math.round(b.x + c * this.layout.cell) + 0.5;
          ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h);
        }
        for (let r = 1; r < this.cfg.VISIBLE_ROWS; r++) {
          const y = Math.round(b.y + r * this.layout.cell) + 0.5;
          ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y);
        }
        ctx.stroke();
      }
      // border
      ctx.strokeStyle = p.boardBorder;
      ctx.lineWidth = 2;
      roundRect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 8);
      ctx.stroke();
      ctx.restore();
    }

    // ---- single block ----
    drawBlock(ctx, x, y, size, color, theme, opts) {
      opts = opts || {};
      const alpha = opts.alpha != null ? opts.alpha : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      const inset = 1;
      const x0 = x + inset, y0 = y + inset, s = size - inset * 2;

      if (theme.block === "neon") {
        if (opts.glow) { ctx.shadowBlur = size * 0.7; ctx.shadowColor = color; }
        const g = ctx.createLinearGradient(x0, y0, x0, y0 + s);
        g.addColorStop(0, shade(color, 0.35));
        g.addColorStop(0.5, color);
        g.addColorStop(1, shade(color, -0.35));
        ctx.fillStyle = g;
        roundRect(ctx, x0, y0, s, s, Math.max(2, size * 0.16));
        ctx.fill();
        ctx.shadowBlur = 0;
        // inner highlight
        ctx.strokeStyle = rgba("#ffffff", 0.45);
        ctx.lineWidth = Math.max(1, size * 0.06);
        roundRect(ctx, x0 + s * 0.12, y0 + s * 0.12, s * 0.76, s * 0.76, Math.max(1, size * 0.10));
        ctx.stroke();
      } else if (theme.block === "bevel") {
        // base
        ctx.fillStyle = color;
        ctx.fillRect(x0, y0, s, s);
        const bw = Math.max(2, Math.floor(size * 0.16));
        // light top + left
        ctx.fillStyle = shade(color, 0.45);
        ctx.fillRect(x0, y0, s, bw);
        ctx.fillRect(x0, y0, bw, s);
        // dark bottom + right
        ctx.fillStyle = shade(color, -0.45);
        ctx.fillRect(x0, y0 + s - bw, s, bw);
        ctx.fillRect(x0 + s - bw, y0, bw, s);
        // white corner glint (classic look)
        ctx.fillStyle = rgba("#ffffff", 0.9);
        ctx.fillRect(x0 + bw, y0 + bw, Math.max(2, bw * 0.7), Math.max(2, bw * 0.7));
        // crisp outline
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
      } else { // flat
        ctx.fillStyle = color;
        ctx.fillRect(x0, y0, s, s);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
      }
      ctx.restore();
    }

    drawGhostCell(ctx, x, y, size, color, theme) {
      ctx.save();
      const inset = 2, x0 = x + inset, y0 = y + inset, s = size - inset * 2;
      ctx.strokeStyle = theme.block === "neon" ? rgba(color, 0.55) : theme.palette.ghost;
      ctx.lineWidth = 2;
      if (theme.block === "neon") roundRect(ctx, x0, y0, s, s, Math.max(2, size * 0.14));
      else ctx.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
      ctx.stroke();
      if (theme.block === "neon") {
        ctx.fillStyle = rgba(color, 0.10);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- previews (hold / next) ----
    drawPanelBox(ctx, box, theme, label) {
      const p = theme.palette;
      ctx.save();
      ctx.fillStyle = p.panel;
      roundRect(ctx, box.x, box.y, box.w, box.h, 8);
      ctx.fill();
      ctx.strokeStyle = p.panelBorder;
      ctx.lineWidth = 1.5;
      roundRect(ctx, box.x, box.y, box.w, box.h, 8);
      ctx.stroke();
      ctx.restore();
    }

    drawMini(ctx, type, box, theme, opts) {
      if (!type) return;
      opts = opts || {};
      const m = Pieces.matrixFor(type, 0);
      // bounds of filled cells
      let minR = 99, maxR = -1, minC = 99, maxC = -1;
      Pieces.eachCell(m, (r, c) => {
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (c < minC) minC = c; if (c > maxC) maxC = c;
      });
      const pw = (maxC - minC + 1), ph = (maxR - minR + 1);
      const pad = Math.min(box.w, box.h) * 0.18;
      const cell = Math.min((box.w - pad * 2) / pw, (box.h - pad * 2) / ph);
      const offX = box.x + (box.w - pw * cell) / 2;
      const offY = box.y + (box.h - ph * cell) / 2;
      const color = opts.dim ? shade(theme.palette[type], -0.4) : theme.palette[type];
      Pieces.eachCell(m, (r, c) => {
        this.drawBlock(ctx, offX + (c - minC) * cell, offY + (r - minR) * cell, cell, color, theme,
          { glow: theme.effects.glow && !opts.dim, alpha: opts.dim ? 0.6 : 1 });
      });
    }

    // ---- text panels ----
    drawLabel(ctx, text, x, y, theme, opts) {
      opts = opts || {};
      ctx.save();
      ctx.font = (opts.size || 13) + "px " + theme.fonts.ui;
      ctx.fillStyle = opts.color || theme.palette.textDim;
      ctx.textAlign = opts.align || "left";
      ctx.textBaseline = "alphabetic";
      if (opts.glow && theme.effects.glow) { ctx.shadowBlur = 8; ctx.shadowColor = opts.color || theme.palette.accent; }
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    drawStats(ctx, theme, data) {
      const s = this.layout.stats;
      const align = s.align;
      const x = align === "center" ? s.x + (s.w ? s.w / 2 : 0) : s.x + 4;
      const items = [
        ["SCORE", data.score.toLocaleString()],
        ["LEVEL", String(data.level)],
        ["LINES", String(data.lines)]
      ];
      if (this.layout.compact) {
        // single compact line of three values
        const cw = s.w / 3;
        items.forEach((it, i) => {
          const cx = s.x + cw * i + cw / 2;
          this.drawLabel(ctx, it[0], cx, s.y + 12, theme, { align: "center", size: 11 });
          this.drawLabel(ctx, it[1], cx, s.y + 34, theme, { align: "center", size: 18, color: theme.palette.text, glow: true });
        });
      } else {
        let y = s.y;
        items.forEach(it => {
          this.drawLabel(ctx, it[0], x, y, theme, { align: align, size: 12 });
          this.drawLabel(ctx, it[1], x, y + 24, theme, { align: align, size: 22, color: theme.palette.text, glow: true });
          y += 56;
        });
      }
    }

    // ---- CRT scanlines (classic) ----
    // Cache the line pattern once (a 1x3 tile) instead of looping fillRect
    // per 3px every frame.
    drawScanlines(ctx, theme, w, h) {
      if (!theme.effects.scanlines) return;
      if (!this._scanPattern) {
        const off = document.createElement("canvas");
        off.width = 1; off.height = 3;
        const o = off.getContext("2d");
        o.fillStyle = "#000";
        o.fillRect(0, 0, 1, 1); // one dark line per 3px
        this._scanPattern = ctx.createPattern(off, "repeat");
      }
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = this._scanPattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  Arcade.Tetris.Renderer = Renderer;
  Arcade.Tetris._util = { shade: shade, rgba: rgba, hexToRgb: hexToRgb, roundRect: roundRect };
})(window.Arcade = window.Arcade || {});
