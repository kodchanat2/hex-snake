/*========== Cycle repair ==========*/
// Builds a new Hamiltonian cycle that contains the snake's body, in order tail → head, as one unbroken
// stretch. Then the cycle bot can take over mid-game without ever crossing the body.
//
// Method (insertion on the triangular lattice): close the body into a loop with a shortest free path
// head → tail, then keep inserting free tiles into loop edges that are not body edges:
//   - one tile v between a → b when v touches both (every hex edge has two such "triangle" tiles);
//   - two touching tiles v, w between a → b when a touches v and w touches b.
// It stops when every tile is on the loop (success) or nothing more can be inserted (null: a free pocket
// the loop cannot reach yet, e.g. a dead-end corridor; try again a few moves later).
// Exposes repairCycle(bodyTailToHead: [{i, j}]) → [{i, j}] in cycle order starting at the tail, or null.

const repairCycle = (() => {
  const key = p => hamiltonKey(p.i, p.j);
  const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const neighbors = p => DIRS.map(([a, b]) => ({ i: p.i + a, j: p.j + b })).filter(n => HAMILTON_INDEX.has(key(n)));
  const touches = (p, q) => DIRS.some(([a, b]) => p.i + a === q.i && p.j + b === q.j);

  // Shortest path head → tail through free tiles (excludes both ends).
  function closingPath(head, tail, blocked) {
    const tailKey = key(tail), parent = new Map([[key(head), null]]);
    let frontier = [head];
    while (frontier.length) {
      const next = [];
      for (const p of frontier) for (const n of neighbors(p)) {
        const k = key(n);
        if (parent.has(k)) continue;
        if (k === tailKey) {
          const path = [];
          for (let c = p; key(c) !== key(head); c = parent.get(key(c))) path.unshift(c);
          return path;
        }
        if (blocked.has(k)) continue;
        parent.set(k, p); next.push(n);
      }
      frontier = next;
    }
    return null;
  }

  // Insert v (or v and one free neighbour w) into a non-body loop edge a → b.
  function insertOne({ next, cell, fixed }, v) {
    for (const a of neighbors(v)) {
      const ak = key(a);
      if (!cell.has(ak) || fixed.has(ak)) continue;
      const b = cell.get(next.get(ak));
      if (touches(v, b)) {                                         // a → v → b
        next.set(ak, key(v)); next.set(key(v), key(b)); cell.set(key(v), v);
        return true;
      }
      const w = neighbors(v).find(x => !cell.has(key(x)) && touches(x, b));
      if (w) {                                                     // a → v → w → b
        next.set(ak, key(v)); next.set(key(v), key(w)); next.set(key(w), key(b));
        cell.set(key(v), v); cell.set(key(w), w);
        return true;
      }
    }
    return false;
  }

  const MAX_CLUSTER = 8, MAX_SEGMENT = 12;

  // Local search: take a loop stretch a → s1 … → b (non-body edges, up to MAX_SEGMENT long) next to the
  // leftover cluster around v, and look for a path a → b that covers the stretch and the cluster.
  function reroute({ next, cell, fixed }, v) {
    const cluster = [v], seen = new Set([key(v)]);
    for (let k = 0; k < cluster.length && cluster.length < MAX_CLUSTER; k++) {
      for (const n of neighbors(cluster[k])) {
        if (!cell.has(key(n)) && !seen.has(key(n)) && cluster.length < MAX_CLUSTER) { seen.add(key(n)); cluster.push(n); }
      }
    }
    const starts = new Set();
    cluster.forEach(c => neighbors(c).forEach(a => { if (cell.has(key(a)) && !fixed.has(key(a))) starts.add(key(a)); }));
    for (const ak of starts) {
      const stretch = [ak];
      for (let cur = ak; stretch.length <= MAX_SEGMENT && !fixed.has(cur);) {
        cur = next.get(cur); stretch.push(cur);
        if (stretch.length < 3) continue;
        const inner = new Set([...stretch.slice(1, -1), ...cluster.map(key)]);
        const path = hamPath(cell.get(ak), cell.get(cur), inner);
        if (!path) continue;
        cluster.forEach(c => cell.set(key(c), c));
        let prev = ak;
        for (const p of path) { next.set(prev, key(p)); prev = key(p); }
        next.set(prev, cur);
        return true;
      }
    }
    return false;
  }

  // Exhaustive DFS for a path from a to b that visits every tile of `inner` exactly once (inner is small).
  function hamPath(a, b, inner) {
    const path = [], used = new Set();
    const lookup = new Map([...inner].map(k => [k, HAMILTON_CYCLE[HAMILTON_INDEX.get(k)]]));
    function dfs(p) {
      if (path.length === inner.size) return touches(p, b);
      for (const n of neighbors(p)) {
        const k = key(n);
        if (!inner.has(k) || used.has(k)) continue;
        used.add(k); path.push(lookup.get(k));
        if (dfs(n)) return true;
        used.delete(k); path.pop();
      }
      return false;
    }
    return dfs(a) ? path : null;
  }

  return function repairCycle(body) {
    if (body.length < 2) return null;
    const tail = body[0], head = body[body.length - 1];
    const bodyKeys = new Set(body.map(key));
    const closing = closingPath(head, tail, bodyKeys);
    if (!closing) return null;

    // Loop as a linked list; body edges (tail → … → head) are fixed.
    const next = new Map(), cell = new Map();
    const loop = [...body, ...closing];
    loop.forEach((p, k) => { cell.set(key(p), p); next.set(key(p), key(loop[(k + 1) % loop.length])); });
    const fixed = new Set(body.slice(0, -1).map(key));           // edge a → next(a) is fixed when a is a body tile except the head
    const loopState = { next, cell, fixed };
    let free = HAMILTON_CYCLE.filter(p => !cell.has(key(p)));

    for (let changed = true; changed && free.length;) {
      changed = false;
      for (const v of free) {
        if (!cell.has(key(v)) && insertOne(loopState, v)) changed = true;
      }
      free = free.filter(v => !cell.has(key(v)));
      // Stuck: re-route a short stretch of the loop through the leftover tiles near it.
      if (!changed) changed = free.some(v => reroute(loopState, v));
      free = free.filter(v => !cell.has(key(v)));
    }
    if (free.length) return null;

    const order = [];
    for (let k = key(tail), n = 0; n < HAMILTON_CYCLE.length; n++, k = next.get(k)) order.push(cell.get(k));
    return order;
  };
})();
