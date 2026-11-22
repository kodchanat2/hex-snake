/*========== 3D snake: Hamiltonian cycles ==========*/
// buildCycle(): a fixed cycle through all cells: a 2D cycle on the floor plane (x, z) — rows z boustrophedon
// over x = 1..X-1, back along column x = 0 — run through the y layers alternately, minus its cell (0,0),
// whose vertical column then carries the cycle from the top layer back to the bottom one.
// Needs an even number of rows (dims.z) and of layers (dims.y), e.g. 10 × 10 × 10 or 16 × 4 × 16.
//
// repairCycle(snake): a cycle that contains the body (tail → head) as one unbroken stretch, so the cycle bot
// can take over mid-game. The cube grid has no triangles, so free cells join the loop in pairs around a
// square (a → v → w → b with a–b, a–v, v–w, w–b all touching); when that gets stuck, a short stretch of the
// loop is re-routed through the leftover cells by exhaustive search. null = not possible right now.

const MAX_CLUSTER = 8, MAX_SEGMENT = 14;
const REPAIR_BUDGET_MS = 0;            // extra randomized restarts within this budget (0 = one attempt: each costs ~50-150 ms)

export function makeCycles(G) {
  const { dims, CELLS, id, cellOf, neighbors, touches } = G;

  function buildCycle() {
    if (dims.z % 2 || dims.y % 2) throw new Error(`buildCycle needs an even depth and height, got ${dims.x}×${dims.y}×${dims.z}`);
    const flat = [];                                           // 2D cycle on (x, z)
    for (let z = 0; z < dims.z; z++) {
      const row = [];
      for (let x = 1; x < dims.x; x++) row.push({ x, z });
      flat.push(...(z % 2 ? row.reverse() : row));
    }
    for (let z = dims.z - 1; z >= 0; z--) flat.push({ x: 0, z });
    const c0 = flat.pop();
    const cells = [];
    for (let y = 0; y < dims.y; y++) (y % 2 ? [...flat].reverse() : flat).forEach(c => cells.push({ x: c.x, y, z: c.z }));
    for (let y = dims.y - 1; y >= 0; y--) cells.push({ x: c0.x, y, z: c0.z });
    return cells;
  }

  function makeCycle(cells) {
    const index = new Int32Array(CELLS);
    cells.forEach((c, k) => { index[id(c)] = k; });
    return { cells, index, size: cells.length, dist: (a, b) => (b - a + cells.length) % cells.length };
  }

  // Shortest free path head → tail (both excluded).
  let rand = Math.random;
  const shuffled = list => list.map(v => [rand(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

  function closingPath(head, tail, blocked) {
    const parent = new Map([[id(head), null]]);
    let frontier = [head];
    while (frontier.length) {
      const next = [];
      for (const p of frontier) for (const n of shuffled(neighbors(p))) {
        const k = id(n);
        if (parent.has(k)) continue;
        if (k === id(tail)) {
          const path = [];
          for (let c = p; id(c) !== id(head); c = parent.get(id(c))) path.unshift(c);
          return path;
        }
        if (blocked.has(k)) continue;
        parent.set(k, p); next.push(n);
      }
      frontier = next;
    }
    return null;
  }

  function insertPair(L, v) {
    for (const a of neighbors(v)) {
      const ak = id(a);
      if (!L.on.has(ak) || L.fixed.has(ak)) continue;
      const b = cellOf(L.next.get(ak));
      const partners = neighbors(v).filter(x => !L.on.has(id(x)) && touches(x, b));
      if (!partners.length) continue;
      const degree = c => neighbors(c).filter(n => !L.on.has(id(n))).length;
      const w = partners.reduce((p, q) => (degree(q) < degree(p) ? q : p));
      L.next.set(ak, id(v)); L.next.set(id(v), id(w)); L.next.set(id(w), id(b));
      L.on.add(id(v)); L.on.add(id(w));
      return true;
    }
    return false;
  }

  function hamPath(a, b, inner) {
    const path = [], used = new Set();
    const dfs = p => {
      if (path.length === inner.size) return touches(p, b);
      for (const n of neighbors(p)) {
        const k = id(n);
        if (!inner.has(k) || used.has(k)) continue;
        used.add(k); path.push(k);
        if (dfs(n)) return true;
        used.delete(k); path.pop();
      }
      return false;
    };
    return dfs(a) ? path : null;
  }

  function reroute(L, v) {
    const cluster = [v], seen = new Set([id(v)]);
    for (let k = 0; k < cluster.length && cluster.length < MAX_CLUSTER; k++) {
      for (const n of neighbors(cluster[k])) {
        if (!L.on.has(id(n)) && !seen.has(id(n)) && cluster.length < MAX_CLUSTER) { seen.add(id(n)); cluster.push(n); }
      }
    }
    const starts = new Set();
    cluster.forEach(c => neighbors(c).forEach(a => { if (L.on.has(id(a)) && !L.fixed.has(id(a))) starts.add(id(a)); }));
    for (const ak of starts) {
      const stretch = [ak];
      for (let cur = ak; stretch.length <= MAX_SEGMENT && !L.fixed.has(cur);) {
        cur = L.next.get(cur); stretch.push(cur);
        if (stretch.length < 3) continue;
        const inner = new Set([...stretch.slice(1, -1), ...cluster.map(id)]);
        const path = hamPath(cellOf(ak), cellOf(cur), inner);
        if (!path) continue;
        cluster.forEach(c => L.on.add(id(c)));
        let prev = ak;
        for (const k of path) { L.next.set(prev, k); prev = k; }
        L.next.set(prev, cur);
        return true;
      }
    }
    return false;
  }

  const stats = { left: 0, tries: 0 };
  // Randomized restarts: the insertion heuristic depends on tie-breaks, so retry until one works.
  function repairCycle(snake, random = Math.random) {
    rand = random;
    const t0 = Date.now();
    stats.tries = 0;
    do {
      stats.tries++;
      const cells = repairOnce(snake);
      if (cells) return cells;
    } while (Date.now() - t0 < REPAIR_BUDGET_MS);
    return null;
  }

  function repairOnce(snake) {
    if (snake.length < 2) return null;
    const body = [...snake].reverse();                         // tail → head
    const tail = body[0], head = body[body.length - 1];
    const closing = closingPath(head, tail, new Set(body.map(id)));
    if (!closing) return null;
    const loop = [...body, ...closing];
    const L = { next: new Map(), on: new Set(loop.map(id)), fixed: new Set(body.slice(0, -1).map(id)) };
    loop.forEach((c, k) => L.next.set(id(c), id(loop[(k + 1) % loop.length])));
    let free = [];
    for (let k = 0; k < CELLS; k++) if (!L.on.has(k)) free.push(cellOf(k));
    // Most cornered cells first (fewest free neighbours): inserting easy cells early strands lone cells,
    // and on a bipartite grid a lone cell can never join the loop.
    const freeDegree = c => neighbors(c).filter(n => !L.on.has(id(n))).length;
    while (free.length) {
      free = free.map(v => ({ v, d: freeDegree(v) + rand() * 0.5 })).sort((a, b) => a.d - b.d).map(e => e.v);
      const done = free.some(v => insertPair(L, v)) || free.some(v => reroute(L, v));
      free = free.filter(v => !L.on.has(id(v)));
      if (!done) break;
    }
    stats.left = free.length;
    if (free.length) return null;
    const cells = [];
    for (let k = id(tail), n = 0; n < CELLS; n++, k = L.next.get(k)) cells.push(cellOf(k));
    return cells;
  }

  return { buildCycle, makeCycle, repairCycle, stats };
}
