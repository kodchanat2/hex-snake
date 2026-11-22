/*========== 3D snake: chunk fill ==========*/
// When the body splits the free cells into pockets, no cycle can pass through all of them yet. The snake
// fills the pocket it is in without wasting space and leaves through a body cell the tail has freed by then;
// meanwhile the tail moves, pockets merge, and the cycle can be rebuilt.
// Timing (3d.html rules): body cell i (0 = head) has life = length − i moves left (the tail: 1, it may be
// entered as it leaves). On move k it is free when life <= k − fruits eaten before move k.

const SEARCH_BUDGET = 20000;           // DFS expansions per plan

export function makeChunkFill(G) {
  const { CELLS, id, cellOf, neighbors } = G;
  let plan = [], planLength = -1;

  function pockets(snake) {
    const body = new Set(snake.map(id)), pocket = new Int32Array(CELLS).fill(0);
    let count = 0;
    for (let k = 0; k < CELLS; k++) {
      if (body.has(k) || pocket[k]) continue;
      count++;
      const stack = [cellOf(k)]; pocket[k] = count;
      while (stack.length) for (const n of neighbors(stack.pop())) {
        const nk = id(n);
        if (!body.has(nk) && !pocket[nk]) { pocket[nk] = count; stack.push(n); }
      }
    }
    return { pocket, count };                                  // pocket[cell id] = 1..count, 0 = body
  }

  function search(snake, food, pocket, pid) {
    const life = new Map(snake.map((c, i) => [id(c), snake.length - i]));
    const foodId = food ? id(food) : -1;
    const path = [], used = new Set([id(snake[0])]);
    let best = null, budget = SEARCH_BUDGET, eats = 0, size = 0;
    for (let k = 0; k < CELLS; k++) if (pocket[k] === pid) size++;
    const exitFrom = p => neighbors(p).find(n => {
      const l = life.get(id(n));
      return l !== undefined && !used.has(id(n)) && l <= path.length + 1 - eats;
    });
    const onward = p => neighbors(p).filter(n => pocket[id(n)] === pid && !used.has(id(n))).length;
    const dfs = p => {
      if (budget-- <= 0) return true;
      const exit = exitFrom(p);
      if (exit && (!best || path.length + 1 > best.length)) best = [...path, exit];
      if (exit && path.length === size) return true;
      const next = neighbors(p).filter(n => pocket[id(n)] === pid && !used.has(id(n))).sort((a, b) => onward(a) - onward(b));
      for (const n of next) {
        const ate = id(n) === foodId;
        used.add(id(n)); path.push(n); if (ate) eats++;
        if (dfs(n)) return true;
        used.delete(id(n)); path.pop(); if (ate) eats--;
      }
      return false;
    };
    dfs(snake[0]);
    return best;
  }

  function replan(snake, food, P) {
    let bestPlan = null;
    const tried = new Set();
    for (const n of neighbors(snake[0])) {
      const pid = P.pocket[id(n)];
      if (!pid || tried.has(pid)) continue;
      tried.add(pid);
      const found = search(snake, food, P.pocket, pid);
      if (found && (!bestPlan || found.length > bestPlan.length)) bestPlan = found;
    }
    plan = bestPlan || [];
    planLength = snake.length;
  }

  // → { target, plan } or null (no way out of any neighbouring pocket)
  function nextMove(snake, food, P) {
    const body = new Set(snake.slice(0, -1).map(id));
    const head = plan[0];
    const stale = !head || planLength !== snake.length || !G.touches(head, snake[0]) || (body.has(id(head)) && plan.length > 1);
    if (stale) replan(snake, food, P);
    if (!plan.length) return null;
    const target = plan.shift();
    return { target, plan: [target, ...plan] };
  }

  return { pockets, nextMove, reset() { plan = []; planLength = -1; } };
}
