/* =========================================================
   Tetris themes (skins). Each theme is pure data consumed by
   the renderer. Add a new skin by pushing another object here.

   effects flags:
     glow       neon glow on blocks/text
     particles  line-clear bursts + ambient motes
     shake      screen shake on big clears / hard drop
     scanlines  CRT scanline overlay (retro)
     gridLines  draw the empty-cell grid
     bgAnim     animated background
     trails     piece movement leaves a faint trail (modern)
   ========================================================= */
(function (Arcade) {
  "use strict";

  const CLASSIC = {
    id: "classic",
    name: "Classic",
    palette: {
      I: "#2dd0d0", J: "#2750e8", L: "#ef7d18", O: "#f0d000",
      S: "#4cc93f", T: "#b000d0", Z: "#e23030",
      ghost: "rgba(255,255,255,0.16)",
      board: "#0c0c12",
      boardBorder: "#3a3a4a",
      grid: "rgba(255,255,255,0.05)",
      panel: "#13131c",
      panelBorder: "#2a2a3a",
      text: "#e8e8f0",
      textDim: "#8a8aa0",
      accent: "#f0d000"
    },
    bg: { type: "solid", colors: ["#08080c"] },
    block: "bevel",
    effects: {
      glow: false, particles: false, shake: false,
      scanlines: true, gridLines: true, bgAnim: false, trails: false
    },
    fonts: {
      ui: '"Consolas","Courier New",monospace',
      mono: '"Consolas","Courier New",monospace'
    }
  };

  const MODERN = {
    id: "modern",
    name: "Modern Neon",
    palette: {
      I: "#22e0ff", J: "#4d6bff", L: "#ff9f1c", O: "#ffe14d",
      S: "#46f08a", T: "#c06bff", Z: "#ff4d6d",
      ghost: "rgba(255,255,255,0.10)",
      board: "rgba(10,12,24,0.55)",
      boardBorder: "rgba(120,180,255,0.35)",
      grid: "rgba(255,255,255,0.045)",
      panel: "rgba(16,18,34,0.55)",
      panelBorder: "rgba(120,180,255,0.25)",
      text: "#f0f4ff",
      textDim: "#9aa6c8",
      accent: "#22e0ff"
    },
    bg: { type: "animated", colors: ["#0a0a18", "#141033", "#06121f"] },
    block: "neon",
    effects: {
      glow: true, particles: true, shake: true,
      scanlines: false, gridLines: true, bgAnim: true, trails: true
    },
    fonts: {
      ui: '"Segoe UI",system-ui,-apple-system,Roboto,sans-serif',
      mono: '"Consolas","SF Mono",monospace'
    }
  };

  Arcade.Tetris = Arcade.Tetris || {};
  Arcade.Tetris.Themes = [CLASSIC, MODERN];
  Arcade.Tetris.getTheme = function (id) {
    return Arcade.Tetris.Themes.find(t => t.id === id) || Arcade.Tetris.Themes[0];
  };
})(window.Arcade = window.Arcade || {});
