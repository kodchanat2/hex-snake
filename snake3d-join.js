/*========== 3D snake: join the cycle ==========*/
// Instead of building a new cycle through the body, walk onto the fixed one. Plan = an approach path from the
// head to some cycle cell c[j], then c[j+1], c[j+2] … along the cycle for as long as the body. After that
// the whole body lies on the cycle as one unbroken stretch and the cycle bot can take over.
//
// A join point is valid when every cycle cell the snake will step on is free by the time it gets there:
// not on its own approach path (that becomes body), and any old body cell has run out of life by then.
// Timing (3d.html rules): body cell i (0 = head) has life = length − i; on move k it is free when
// life <= k − fruits eaten before move k. One search per move (earliest-arrival BFS, then a check per
// reachable cell) is capped at a few milliseconds, so it runs in the game loop without stalls.
// While no join works, lastAttempt() is the furthest one got: its cells, how far along the cycle it got,
// and the cell that blocked it (still body when the snake would get there).

export function makeJoin(G) {
  const { id, neighbors } = G;
  let plan = null;                                             // { cyc, cells: [{x,y,z}], length, food }

  // earliest arrival time at every reachable cell, with the parent for the path back
  function arrivals(snake) {
    const life = new Map(snake.map((c, i) => [id(c), snake.length - i]));
    const time = new Map([[id(snake[0]), 0]]), parent = new Map();
    let frontier = [snake[0]];
    for (let step = 1; frontier.length; step++) {
      const next = [];
      for (const c of frontier) for (const n of neighbors(c)) {
        const k = id(n);
        if (time.has(k)) continue;
        const l = life.get(k);
        if (l !== undefined && l > step) continue;
        time.set(k, step); parent.set(k, c); next.push(n);
      }
      frontier = next;
    }
    return { life, time, parent };
  }

  function pathTo(cell, parent, head) {
    const path = [];
    for (let c = cell; id(c) !== id(head); c = parent.get(id(c))) path.unshift(c);
    return path;
  }

  // Can the snake join `cyc` at `cell` reached after `m` moves? → { cells } when it can, otherwise
  // { got, cells, blocker }: how many cycle cells ahead were clear before `blocker` (for the debug view).
  // The cheap check (the cycle stretch against old body life) runs first; the approach path is only
  // rebuilt when that passes, or when this is the furthest try so far (bestGot).
  function tryJoin(cyc, cell, m, A, snake, food, bestGot) {
    const j = cyc.index[id(cell)], follow = snake.length;
    let got = 0, blocker = null;
    for (let i = 1; i <= follow; i++) {
      const c = cyc.cells[(j + i) % cyc.size], l = A.life.get(id(c));
      if (l !== undefined && l > m + i) { blocker = c; break; }
      got = i;
    }
    if (blocker && got <= bestGot) return { got, blocker, cells: null };
    const approach = m ? pathTo(cell, A.parent, snake[0]) : [];
    const arcTo = n => { const out = []; for (let i = 1; i <= n; i++) out.push(cyc.cells[(j + i) % cyc.size]); return out; };
    if (blocker) return { got, blocker, cells: [...approach, ...arcTo(got)] };
    // full check: the approach (a bite on the way delays the tail by one move) and no overlap with the stretch
    const used = new Set(approach.map(id));
    let eats = 0;
    for (let k = 0; k < approach.length; k++) {
      const l = A.life.get(id(approach[k]));
      if (l !== undefined && l > k + 1 - eats) return { got: 0, blocker: approach[k], cells: approach.slice(0, k) };
      if (food && id(approach[k]) === id(food)) eats++;
    }
    const total = follow + eats;                                // eating on the way makes the body longer
    for (let i = 1; i <= total; i++) {
      const c = cyc.cells[(j + i) % cyc.size], k = id(c), l = A.life.get(k);
      if (used.has(k) || (l !== undefined && l > m + i - eats)) return { got: i - 1, blocker: c, cells: [...approach, ...arcTo(i - 1)] };
      if (food && k === id(food)) eats++;
    }
    return { cells: [...approach, ...arcTo(total)] };
  }

  const SEARCH_BUDGET_MS = 6;          // per search; earliest join points are tried first
  const RETRY_MOVES = 3;               // after a failed search, wait this many moves before the next one
  let attempt = null, wait = 0;        // attempt: the best failed try, for the debug view
  function search(snake, food, cycles) {
    const t0 = performance.now();
    const A = arrivals(snake);
    const order = [...A.time.entries()].sort((a, b) => a[1] - b[1]);
    attempt = null;
    for (const [k, m] of order) {
      if (performance.now() - t0 > SEARCH_BUDGET_MS) break;
      const cell = G.cellOf(k);
      for (const cyc of cycles) {
        const r = tryJoin(cyc, cell, m, A, snake, food, attempt ? attempt.got : -1);
        if (!r.blocker) { attempt = null; return { cyc, cells: r.cells }; }
        if (r.cells && (!attempt || r.got > attempt.got)) attempt = { ...r, cyc };
      }
    }
    return null;
  }

  // → { target, plan, cyc } or null when no join point works right now
  function nextMove(snake, food, cycles) {
    const stillGood = plan && plan.length === snake.length && plan.food === (food ? id(food) : -1) &&
      plan.cells.length && G.touches(plan.cells[0], snake[0]);
    if (!stillGood) {
      plan = null;
      if (wait-- > 0) return null;
      const found = search(snake, food, cycles);
      plan = found ? { ...found, length: snake.length, food: food ? id(food) : -1 } : null;
      if (!plan) wait = RETRY_MOVES;
    }
    if (!plan) return null;
    const target = plan.cells.shift();
    const view = [target, ...plan.cells];
    if (!plan.cells.length) plan = null;
    else { plan.length = snake.length; }
    return { target, plan: view, cyc: plan ? plan.cyc : null };
  }

  return { nextMove, reset() { plan = null; attempt = null; wait = 0; }, lastAttempt: () => attempt };
}
