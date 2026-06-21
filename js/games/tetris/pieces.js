/* =========================================================
   Tetris pieces — Super Rotation System (SRS).

   Each tetromino is defined by explicit per-rotation matrices
   (most robust — no rotation math to get wrong) plus SRS wall-
   kick offset tables.

   Matrices: 1 = filled. Rotation states: 0 (spawn), 1 (CW / "R"),
   2 (180), 3 (CCW / "L").

   Kick tables are stored in canonical SRS form where +Y means UP.
   Our board's Y increases DOWNWARD, so when applying a kick we do:
       testCol = col + kick.x
       testRow = row - kick.y      // note the minus
   ========================================================= */
(function (Arcade) {
  "use strict";

  // Color KEYS only here; actual colors come from the active theme palette.
  const SHAPES = {
    I: [
      [[0,0,0,0],
       [1,1,1,1],
       [0,0,0,0],
       [0,0,0,0]],
      [[0,0,1,0],
       [0,0,1,0],
       [0,0,1,0],
       [0,0,1,0]],
      [[0,0,0,0],
       [0,0,0,0],
       [1,1,1,1],
       [0,0,0,0]],
      [[0,1,0,0],
       [0,1,0,0],
       [0,1,0,0],
       [0,1,0,0]]
    ],
    J: [
      [[1,0,0],
       [1,1,1],
       [0,0,0]],
      [[0,1,1],
       [0,1,0],
       [0,1,0]],
      [[0,0,0],
       [1,1,1],
       [0,0,1]],
      [[0,1,0],
       [0,1,0],
       [1,1,0]]
    ],
    L: [
      [[0,0,1],
       [1,1,1],
       [0,0,0]],
      [[0,1,0],
       [0,1,0],
       [0,1,1]],
      [[0,0,0],
       [1,1,1],
       [1,0,0]],
      [[1,1,0],
       [0,1,0],
       [0,1,0]]
    ],
    O: [
      [[1,1],
       [1,1]],
      [[1,1],
       [1,1]],
      [[1,1],
       [1,1]],
      [[1,1],
       [1,1]]
    ],
    S: [
      [[0,1,1],
       [1,1,0],
       [0,0,0]],
      [[0,1,0],
       [0,1,1],
       [0,0,1]],
      [[0,0,0],
       [0,1,1],
       [1,1,0]],
      [[1,0,0],
       [1,1,0],
       [0,1,0]]
    ],
    T: [
      [[0,1,0],
       [1,1,1],
       [0,0,0]],
      [[0,1,0],
       [0,1,1],
       [0,1,0]],
      [[0,0,0],
       [1,1,1],
       [0,1,0]],
      [[0,1,0],
       [1,1,0],
       [0,1,0]]
    ],
    Z: [
      [[1,1,0],
       [0,1,1],
       [0,0,0]],
      [[0,0,1],
       [0,1,1],
       [0,1,0]],
      [[0,0,0],
       [1,1,0],
       [0,1,1]],
      [[0,1,0],
       [1,1,0],
       [1,0,0]]
    ]
  };

  // Wall-kick data. Keyed by "from>to" rotation transition.
  // JLSTZ share one table; I has its own; O never kicks.
  const KICKS_JLSTZ = {
    "0>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "1>0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "1>2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "2>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "2>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "3>2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "3>0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "0>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };

  const KICKS_I = {
    "0>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "1>0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    "2>1": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "2>3": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "3>2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "3>0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "0>3": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };

  const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

  function getKicks(type, from, to) {
    if (type === "O") return [[0, 0]];
    const table = (type === "I") ? KICKS_I : KICKS_JLSTZ;
    return table[from + ">" + to] || [[0, 0]];
  }

  /** Iterate filled cells of a matrix, calling cb(rowOffset, colOffset). */
  function eachCell(matrix, cb) {
    for (let r = 0; r < matrix.length; r++) {
      const row = matrix[r];
      for (let c = 0; c < row.length; c++) {
        if (row[c]) cb(r, c);
      }
    }
  }

  Arcade.Tetris = Arcade.Tetris || {};
  Arcade.Tetris.Pieces = {
    SHAPES: SHAPES,
    TYPES: TYPES,
    getKicks: getKicks,
    eachCell: eachCell,
    matrixFor: function (type, rot) { return SHAPES[type][((rot % 4) + 4) % 4]; }
  };
})(window.Arcade = window.Arcade || {});
