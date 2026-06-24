/* =========================================================
   PointerControls — a shared MOUSE control profile for the
   grid-drop games (Tetris, Dr. Quackers). One implementation,
   both games, so the behaviour stays identical and we don't
   duplicate event wiring.

   Mapping:
     move mouse  -> slide the piece to the column under the cursor
     left click  -> rotate (CW)
     right click -> hard drop  (context menu suppressed)

   The host game supplies three tiny hooks and exposes its run
   state; everything else (event wiring, column stepping, click
   handling) lives here:
     game._curCol()           -> current piece origin column (or null)
     game._colTarget(clientX) -> desired origin column for that cursor x
     game._emitKey(code)      -> synthesize a key tap to the game
   plus .paused / .state / ._ctrl / .shell.canvas / ._unsub
   ========================================================= */
(function (Arcade) {
  "use strict";

  function bindMouse(game) {
    const canvas = game.shell.canvas;
    const active = () => game._ctrl === "mouse" && !game.paused && game.state === "playing";

    // Step the piece one column at a time toward the cursor column. We reuse
    // the game's own move path (via synthetic arrow taps) so collisions, wall
    // limits and SFX behave exactly like the keyboard.
    const follow = (clientX) => {
      if (!active()) return;
      let cur = game._curCol();
      if (cur == null) return;
      const tgt = game._colTarget(clientX);
      let guard = 0;
      while (cur !== tgt && guard++ < 32) {
        game._emitKey(tgt < cur ? "ArrowLeft" : "ArrowRight");
        const nc = game._curCol();
        if (nc === cur) break;   // blocked by a wall / stack
        cur = nc;
      }
    };

    const onMove = (e) => follow(e.clientX);
    const onDown = (e) => {
      if (!active()) return;
      if (e.button === 0) { e.preventDefault(); follow(e.clientX); game._emitKey("ArrowUp"); }   // left = rotate
      else if (e.button === 2) { e.preventDefault(); game._emitKey("Space"); }                    // right = drop
    };
    const onCtx = (e) => { if (game._ctrl === "mouse") e.preventDefault(); };   // let right-click be "drop", not a menu

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("contextmenu", onCtx);
    game._unsub.push(() => {
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("contextmenu", onCtx);
    });
  }

  // Map a clientX to a board column, accounting for any CSS scaling of the
  // canvas. `layout` must expose board.x and cell; `cssW` is the game's logical
  // width (the basis its layout was computed in).
  function columnAt(canvas, clientX, layout, cssW) {
    const rect = canvas.getBoundingClientRect();
    const scale = (cssW || rect.width) / (rect.width || 1);
    const x = (clientX - rect.left) * scale;
    return Math.floor((x - layout.board.x) / layout.cell);
  }

  Arcade.PointerControls = { bindMouse: bindMouse, columnAt: columnAt };
})(window.Arcade = window.Arcade || {});
