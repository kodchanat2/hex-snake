/*========== 3D snake bots ==========*/
// Pure logic (no rendering): move(mode, game) reads { snake: [{x,y,z}] head first, dir, food } and returns
// { dir, path, driver }. Rules of 3d.html: moving into the cell the tail is leaving is allowed.
//
// 'astar'    — time-aware A*: a body cell with i cells behind it frees after i moves; take the shortest path to
//              the food only if the tail is still reachable after eating, else stall on the safe move farthest
//              from the tail, else the roomiest move. After a board's worth of moves without eating it takes
//              the food path anyway (otherwise it can chase its tail forever near the end).
// 'hamilton' — a Hamiltonian cycle with safe shortcuts (always fills the board while the body lies on it).
//              Switched on mid-game: the snake walks onto the fixed cycle at a point whose stretch ahead will be
//              clear in time (snake3d-join.js); when no such point exists yet, chunk fill (snake3d-chunk.js)
//              or A* keeps it alive and the join is tried again on the next move.
import { makeGrid } from './snake3d-grid.js';
import { makeCycles } from './snake3d-cycle.js';
import { makeChunkFill } from './snake3d-chunk.js';
import { makeJoin } from './snake3d-join.js';

const SHORTCUT_MAX_FILL = 0.5;        // no shortcuts once the body covers this share of the board
const SHORTCUT_GAP_BUFFER = 4;        // free cycle cells kept ahead of the tail after a shortcut
const REPAIR_RETRY = 25;              // moves to wait after a failed cycle rebuild
// The rebuild runs in the game loop and at 16³ one attempt takes ~2 s and has not once succeeded, so it froze
// the game. Off until it runs outside the loop (or is replaced); A* / chunk fill keep the snake alive meanwhile.
const REBUILD_IN_LOOP = false;

export function createBots(SIZE) {
  const G = makeGrid(SIZE);
  const { CELLS, id, sub, neighbors, manhattan } = G;
  const C = makeCycles(G);
  const chunk = makeChunkFill(G);
  const join = makeJoin(G);
  const forward = C.makeCycle(C.buildCycle());
  const backward = C.makeCycle([...forward.cells].reverse());

  /*---------- Hamiltonian cycle ----------*/
  function onCycle(cyc, snake) {
    const h = cyc.index[id(snake[0])], t = cyc.index[id(snake[snake.length - 1])];
    const span = cyc.dist(t, h);
    return snake.every(c => cyc.dist(t, cyc.index[id(c)]) <= span);
  }
  const tight = (cyc, snake) => snake.every((c, k) => k === 0 || cyc.index[id(c)] === (cyc.index[id(snake[k - 1])] - 1 + cyc.size) % cyc.size);

  function cycleMove(cyc, game) {
    const { snake, food } = game;
    const head = cyc.index[id(snake[0])], tail = cyc.index[id(snake[snake.length - 1])];
    const tailDist = snake.length > 1 ? cyc.dist(head, tail) : cyc.size;
    const next = cyc.cells[(head + 1) % cyc.size];
    const item = food ? cyc.index[id(food)] : -1;
    const body = new Set(snake.slice(0, -1).map(id));          // the tail leaves this move
    let best = null;
    if (food && snake.length < CELLS * SHORTCUT_MAX_FILL) {
      for (const n of neighbors(snake[0])) {
        if (body.has(id(n))) continue;
        const k = cyc.index[id(n)], ahead = cyc.dist(head, k);
        if (ahead < 1 || ahead >= tailDist) continue;
        const gapLeft = tailDist - ahead - 1 - (k === item ? 1 : 0);
        if (ahead !== 1 && gapLeft < SHORTCUT_GAP_BUFFER) continue;
        if (!best || cyc.dist(k, item) < cyc.dist(best.k, item)) best = { n, k };
      }
    }
    const target = best ? best.n : next;
    return { dir: sub(target, snake[0]), path: [target], driver: best && cyc.dist(head, best.k) > 1 ? 'cycle + shortcut' : 'cycle' };
  }

  /*---------- time-aware A* ----------*/
  const lifeOf = snake => new Map(snake.map((c, i) => [id(c), snake.length - i]));
  function search(snake, isGoal, target = null) {
    const life = lifeOf(snake), start = snake[0];
    const seen = new Set([id(start)]), parent = new Map();
    let frontier = [start];
    for (let step = 1; frontier.length; step++) {
      if (target) frontier.sort((a, b) => manhattan(a, target) - manhattan(b, target));
      const nextFrontier = [];
      for (const c of frontier) for (const n of neighbors(c)) {
        const k = id(n);
        if (seen.has(k)) continue;
        const l = life.get(k);
        if (l !== undefined && l > step) continue;
        seen.add(k); parent.set(k, c);
        if (isGoal(n, l)) {
          const path = [];
          for (let p = n; id(p) !== id(start); p = parent.get(id(p))) path.unshift(p);
          return { path, seen: seen.size };
        }
        nextFrontier.push(n);
      }
      frontier = nextFrontier;
    }
    return { path: null, seen: seen.size };
  }
  function walk(snake, path, food) {
    const ate = food && id(path[path.length - 1]) === id(food);
    return [...[...path].reverse(), ...snake].slice(0, snake.length + (ate ? 1 : 0));
  }
  const tailRoute = snake => search(snake, (n, l) => l !== undefined).path;
  const room = snake => search(snake, () => false).seen;

  let hungry = 0, lastLength = 0;
  function astarMove(game) {
    const { snake, food } = game;
    hungry = snake.length > lastLength ? 0 : hungry + 1;
    lastLength = snake.length;
    if (food) {
      const toFood = search(snake, n => id(n) === id(food), food).path;
      const gamble = hungry > CELLS;
      if (toFood && (gamble || tailRoute(walk(snake, toFood, food)))) {
        return { dir: sub(toFood[0], snake[0]), path: toFood, driver: gamble ? 'A* (risky bite)' : 'A*' };
      }
    }
    const body = new Set(snake.slice(0, -1).map(id));
    const options = neighbors(snake[0]).filter(n => !body.has(id(n))).map(n => {
      const after = walk(snake, [n], food), route = tailRoute(after);
      return { n, route, far: route ? route.length : -1, space: route ? 0 : room(after) };
    });
    if (!options.length) return { dir: game.dir, path: [], driver: 'A* (trapped)', chase: true };
    const safe = options.filter(o => o.route);
    const pick = safe.length ? safe.reduce((a, b) => (b.far > a.far ? b : a)) : options.reduce((a, b) => (b.space > a.space ? b : a));
    return { dir: sub(pick.n, snake[0]), path: [pick.n, ...(pick.route || [])], driver: safe.length ? 'A* (chasing the tail)' : 'A* (no safe route)', chase: true };
  }

  /*---------- Hamilton mode: cycle, rebuild, chunk fill ----------*/
  let cycle = null, repairWait = 0, pocketInfo = null;
  function hamiltonMove(game) {
    const { snake, food } = game;
    pocketInfo = null;
    if (cycle && !onCycle(cycle, snake)) cycle = null;
    if (!cycle) cycle = tight(forward, snake) ? forward : tight(backward, snake) ? backward : null;
    if (!cycle && REBUILD_IN_LOOP && repairWait-- <= 0) {
      const cells = C.repairCycle(snake);
      if (cells) { cycle = C.makeCycle(cells); chunk.reset(); } else repairWait = REPAIR_RETRY;
    }
    if (cycle) return cycleMove(cycle, game);
    // walk onto the fixed cycle at a point whose stretch ahead will be clear in time (snake3d-join.js)
    const j = join.nextMove(snake, food, [forward, backward]);
    if (j) {
      chunk.reset();
      return { dir: sub(j.target, snake[0]), path: j.plan, driver: 'joining the cycle', join: true };
    }
    const attempt = join.lastAttempt();                         // what Hamilton is still trying (debug view)
    const P = chunk.pockets(snake);
    if (P.count > 1) {
      const m = chunk.nextMove(snake, food, P);
      if (m) {
        pocketInfo = P;
        return { dir: sub(m.target, snake[0]), path: m.plan, driver: `chunk fill (${P.count} pockets)`, chunk: true, attempt };
      }
    } else chunk.reset();
    const a = astarMove(game);
    return { ...a, driver: P.count > 1 ? `A* (no way out of the pocket, ${P.count} pockets)` : 'A* (waiting to join the cycle)', attempt };
  }

  return {
    move(mode, game) {
      if (mode === 'hamilton') return hamiltonMove(game);
      cycle = null; pocketInfo = null; join.reset();
      return astarMove(game);
    },
    reset() { cycle = null; repairWait = 0; hungry = 0; lastLength = 0; pocketInfo = null; chunk.reset(); join.reset(); },
    debugInfo: () => ({ cycle, pockets: pocketInfo }),
    cycleCells: () => forward.cells,
  };
}
