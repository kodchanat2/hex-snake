/*========== Chunk fill ==========*/
// When the body splits the free tiles into pockets, no cycle can pass through all of them yet. Instead the
// snake fills the pocket it is in, tile after tile without wasting space, and leaves through a body tile
// the tail has freed by the time it gets there. Meanwhile the tail keeps moving, pockets merge, and the
// cycle can be rebuilt (cycle-repair.js).
//
// Plan = a path through the head's pocket (depth-first, fewest-exits-first, bounded search), longest first,
// that ends next to a body tile with decay <= moves made - fruits eaten, i.e. free on the next move.
// Exposes ChunkFill.pockets() → number of free pockets, ChunkFill.pocketMap() → Map<posText, pocket id>,
// ChunkFill.nextMove() → { target, plan } or null.

const ChunkFill = (() => {
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const SEARCH_BUDGET = 20000;        // DFS expansions per plan
  const key = p => PosToText(p.i, p.j);
  const neighbors = p => DIRS.map(([a, b]) => ({ i: p.i + a, j: p.j + b })).filter(n => grid.has(key(n)));
  const isFree = p => grid.get(key(p)).state <= 0;
  let plan = [], planScore = -1;

  function pocketsOf() {
    const id = new Map();
    let n = 0;
    grid.forEach((tile, pos) => {
      if (tile.state > 0 || id.has(pos)) return;
      n++;
      const stack = [TextToPos(pos)]; id.set(pos, n);
      while (stack.length) for (const q of neighbors(stack.pop())) {
        if (isFree(q) && !id.has(key(q))) { id.set(key(q), n); stack.push(q); }
      }
    });
    return { id, count: n };
  }

  function search(pocket) {
    const itemKey = key(itemTile);
    const decay = pos => grid.get(pos).decay;
    const path = [], used = new Set([key(currentTile)]);
    let best = null, budget = SEARCH_BUDGET, eats = 0;
    const exitFrom = p => neighbors(p).find(n => {
      const k = key(n), t = grid.get(k);
      return t.state > 0 && !used.has(k) && decay(k) <= path.length - eats;
    });
    const onward = p => neighbors(p).filter(n => pocket.has(key(n)) && !used.has(key(n))).length;
    function dfs(p) {
      if (budget-- <= 0) return true;
      const exit = exitFrom(p);
      if (exit && (!best || path.length > best.length - 1)) best = [...path, exit];
      if (path.length === pocket.size && exit) return true;          // the whole pocket, with a way out
      const next = neighbors(p).filter(n => pocket.has(key(n)) && !used.has(key(n))).sort((a, b) => onward(a) - onward(b));
      for (const n of next) {
        const k = key(n), ate = k === itemKey;
        used.add(k); path.push(n); if (ate) eats++;
        if (dfs(n)) return true;
        used.delete(k); path.pop(); if (ate) eats--;
      }
      return false;
    }
    dfs(currentTile);
    return best;
  }

  function replan() {
    const { id } = pocketsOf();
    let bestPlan = null;
    const tried = new Set();
    for (const n of neighbors(currentTile)) {
      const pid = id.get(key(n));
      if (pid === undefined || tried.has(pid)) continue;
      tried.add(pid);
      const pocket = new Set([...id].filter(([, v]) => v === pid).map(([k]) => k));
      const found = search(pocket);
      if (found && (!bestPlan || found.length > bestPlan.length)) bestPlan = found;
    }
    plan = bestPlan || [];
    planScore = score;
  }

  function nextMove() {
    const head = plan[0];
    const stale = !head || planScore !== score || !grid.get(key(head)) ||
      (grid.get(key(head)).state > 0 && plan.length > 1);             // only the final exit tile may be body
    if (stale) replan();
    if (!plan.length) return null;
    const target = plan.shift();
    return { target, plan: [target, ...plan] };
  }

  return { pockets: () => pocketsOf().count, pocketMap: () => pocketsOf().id, nextMove, reset: () => { plan = []; planScore = -1; } };
})();
