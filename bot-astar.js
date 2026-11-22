/*========== Bot: time-aware A* ==========*/
// The original idea (A* to the fruit, chase the tail when that is unsafe) with its three holes fixed:
//   1. the safety check runs on a fresh search over a simulated board, not on the first search's closed list;
//   2. the heuristic is the real hex distance from the tile being scored to the target;
//   3. the simulation turns the path just walked into body, so the bot never plans through itself,
//      and when no safe move exists it takes the move with the most room instead of switching itself off.
// Timing rule of the game: a body tile with `decay = d` is enterable on move k (1-based, no eating
// on the way) when d <= k - 1, because the grid ticks only after the target tile is checked.
// Exposes AStarBot.nextMove() → { path: [{i, j}], isChasing }.

const AStarBot = (() => {
  const DIRS = [0, 1, 2, 3, 4, 5];
  const key = p => PosToText(p.i, p.j);
  const hexDist = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j), Math.abs(a.i + a.j - b.i - b.j));
  const neighbors = p => DIRS.map(dir => { const v = dirToPos(dir); return { i: p.i + v.i, j: p.j + v.j }; });

  // Snapshot of the live game: Map<posText, decay> for every body tile.
  function snapshot() {
    const body = new Map();
    grid.forEach((tile, pos) => { if (tile.state > 0 && tile.state < state.WALL) body.set(pos, tile.decay); });
    return { body, head: { ...currentTile }, score };
  }

  function isFreeAt(sim, text, step) {
    const tile = grid.get(text);
    if (!tile || tile.state === state.WALL) return false;
    const decay = sim.body.get(text);
    return decay === undefined || decay <= step - 1;
  }

  // New simulated state after the head moves to `next` (immutable update).
  function applyMove(sim, next) {
    const nextText = key(next);
    const isEat = nextText === key(itemTile);
    const body = new Map();
    sim.body.forEach((decay, pos) => { const left = isEat ? decay : decay - 1; if (left > 0) body.set(pos, left); });
    const nextScore = isEat ? sim.score + 1 : sim.score;
    body.set(nextText, nextScore + tailWidth);
    return { body, head: { i: next.i, j: next.j }, score: nextScore };
  }

  function buildPath(parent, end, startText) {
    const path = [];
    for (let cur = end; key(cur) !== startText; cur = parent.get(key(cur))) path.unshift({ i: cur.i, j: cur.j });
    return path;
  }

  // A* to one target. g = move number, h = hex distance. A tile blocked at its first arrival time
  // is not closed, so a longer route can still reach it after it frees.
  function astar(sim, target) {
    const startText = key(sim.head), targetText = key(target);
    const g = new Map([[startText, 0]]), parent = new Map(), closed = new Set();
    const open = [{ p: sim.head, f: hexDist(sim.head, target) }];
    while (open.length) {
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
      const { p } = open.splice(best, 1)[0], pText = key(p);
      if (closed.has(pText)) continue;
      closed.add(pText);
      if (pText === targetText) return buildPath(parent, p, startText);
      const step = g.get(pText) + 1;
      for (const n of neighbors(p)) {
        const nText = key(n);
        if (closed.has(nText) || !isFreeAt(sim, nText, step)) continue;
        if (g.has(nText) && g.get(nText) <= step) continue;
        g.set(nText, step); parent.set(nText, p);
        open.push({ p: n, f: step + hexDist(n, target) });
      }
    }
    return null;
  }

  // Earliest-arrival BFS for goals without one target (reach the tail, count room).
  function bfs(sim, isGoal) {
    const startText = key(sim.head), visited = new Set([startText]), parent = new Map();
    let frontier = [sim.head];
    for (let step = 1; frontier.length; step++) {
      const next = [];
      for (const cur of frontier) for (const n of neighbors(cur)) {
        const text = key(n);
        if (visited.has(text) || !isFreeAt(sim, text, step)) continue;
        visited.add(text); parent.set(text, cur);
        if (isGoal(text)) return { path: buildPath(parent, n, startText), seen: visited.size };
        next.push(n);
      }
      frontier = next;
    }
    return { path: null, seen: visited.size };
  }

  // Safe = the head can still step into a tile the tail has freed; from there it can follow the tail forever.
  const tailPath = sim => { const h = key(sim.head); return bfs(sim, text => text !== h && sim.body.has(text)).path; };
  const room = sim => bfs(sim, () => false).seen;

  function nextMove() {
    const sim = snapshot();
    const toItem = Number.isNaN(itemTile.i) ? null : astar(sim, itemTile);
    if (toItem && tailPath(toItem.reduce(applyMove, sim))) return { path: toItem, isChasing: false };

    // Unsafe or unreachable: stall on the safe step that keeps the tail farthest away (buys time for the body
    // to unwind); with no safe step, take the one with the most room.
    const options = neighbors(sim.head)
      .filter(n => isFreeAt(sim, key(n), 1))
      .map(n => {
        const after = applyMove(sim, n), path = tailPath(after);
        return { n, path, safe: !!path, far: path ? path.length : 0, space: path ? 0 : room(after) };
      });
    if (!options.length) return { path: [], isChasing: true, hasEscape: false };
    const safe = options.filter(o => o.safe);
    const pick = safe.length
      ? safe.reduce((a, b) => (b.far > a.far ? b : a))
      : options.reduce((a, b) => (b.space > a.space ? b : a));
    // path[0] is the move; the rest is the escape route to the freed tail tile (shown by the visual debug)
    return { path: [pick.n, ...(pick.path || [])], isChasing: true, hasEscape: pick.safe };
  }

  return { nextMove };
})();
