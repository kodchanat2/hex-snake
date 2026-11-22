/*========== Bot: Hamiltonian cycle + safe shortcuts ==========*/
// Guaranteed to fill the board while the body lies on the given cycle. Each move either follows the cycle or
// takes a shortcut that stays safe. Exposes HamiltonBot.nextMove(cycle) → { target, viaShortcut },
// where cycle = makeCycle(cells) from hamilton.js.
//
// Following the cycle is always safe: the body then lies
// on the cycle behind the head, ordered tail → head, and the tile ahead is
// free until the board is full. Invariant kept by every move: all body tiles
// lie on the cycle arc [tail .. head], so every tile strictly between head and
// tail (going forward) is free — call that run of tiles the "gap".
//
// A shortcut jumps to a free neighbour further ahead in the gap. The tiles it
// skips become "holes" inside the body arc; they are only re-entered once the
// tail has passed them. The gap shrinks by one on every bite (the tail stays
// put) and only grows back as the tail moves, so a shortcut is allowed only
// while the snake is short and enough gap is left over afterwards.

const HamiltonBot = (() => {
  const NEIGHBOR_DIRS = [0, 1, 2, 3, 4, 5];
  // No shortcuts once the body covers this share of the board.
  const SHORTCUT_MAX_FILL = 0.5;
  // Gap tiles that must remain between the new head and the tail after a shortcut.
  const SHORTCUT_GAP_BUFFER = 4;

  function botNeighbors(pos) {
    return NEIGHBOR_DIRS.map(dir => {
      const v = dirToPos(dir);
      return { i: pos.i + v.i, j: pos.j + v.j };
    });
  }

  // Body tiles and the tail (tile with the lowest decay) of the live game.
  function botSnapshot() {
    let length = 0;
    let tailText = null;
    let tailDecay = Infinity;
    grid.forEach((tile, pos) => {
      if (tile.state <= 0 || tile.state >= state.WALL) return;
      length++;
      if (tile.decay < tailDecay) {
        tailDecay = tile.decay;
        tailText = pos;
      }
    });
    return { length, tailText };
  }

  // Tiles the head may enter right now: empty or the item (a body tile with
  // decay 1 is still solid when the move is checked).
  function botIsFree(pos) {
    const tile = grid.get(PosToText(pos.i, pos.j));
    return !!tile && tile.state <= 0;
  }

  // Pick the next tile for the head.
  function botNextMove(cyc) {
    const headText = PosToText(currentTile.i, currentTile.j);
    const head = cyc.index.get(headText);
    const next = cyc.cells[(head + 1) % cyc.size];
    const { length, tailText } = botSnapshot();
    const tail = cyc.index.get(tailText);
    // A one-tile snake has the whole cycle ahead of it.
    const tailDist = length > 1 ? cyc.dist(head, tail) : cyc.size;
    const itemText = PosToText(itemTile.i, itemTile.j);
    const item = cyc.index.get(itemText);
    const canShortcut = length < cyc.size * SHORTCUT_MAX_FILL && item !== undefined;
    if (!canShortcut) return { target: next, viaShortcut: false };

    // Shortcut: the free neighbour strictly inside the gap that is nearest to the fruit along the cycle,
    // leaving at least SHORTCUT_GAP_BUFFER gap tiles (+1 if it is a bite) before the tail. (Tested against an
    // A* path restricted to the gap: that one jumps further ahead, leaves bigger holes and fills the board ~17% slower.)
    const best = botNeighbors(currentTile)
      .filter(botIsFree)
      .map(n => ({ n, k: cyc.index.get(PosToText(n.i, n.j)) }))
      .filter(({ k }) => {
        const ahead = cyc.dist(head, k);
        if (ahead < 1 || ahead >= tailDist) return false;
        const gapLeft = tailDist - ahead - 1 - (k === item ? 1 : 0);
        return ahead === 1 || gapLeft >= SHORTCUT_GAP_BUFFER;
      })
      .reduce((a, b) => (!a || cyc.dist(b.k, item) < cyc.dist(a.k, item) ? b : a), null);
    if (!best) return { target: next, viaShortcut: false };
    return { target: best.n, viaShortcut: cyc.dist(head, best.k) > 1 };
  }

  return { nextMove: botNextMove };
})();
