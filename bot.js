/*========== Bot: modes ==========*/
// Needs hamilton.js, cycle-repair.js, chunk-fill.js, bot-hamilton.js, bot-astar.js.
//   'astar'    — time-aware A* only: fast to the fruit, not guaranteed to fill the board.
//   'hamilton' — Hamiltonian cycle with safe shortcuts (always fills the board when it drives from the start).
//                Switched on mid-game: while the body splits the free space into pockets, the snake fills its
//                pocket and leaves through tiles the tail frees (chunk-fill.js); once the free space is one
//                piece, A* plays until a cycle through the body is rebuilt (cycle-repair.js).
// Two buttons pick the mode; steering by hand turns the bot off (script.js).

const BOT_LABELS = { astar: 'A*', hamilton: 'Hamilton' };
const BOT_REPAIR_RETRY = 5;           // moves to wait after a failed cycle rebuild
var botSpeed = 1;
var botMode = 'hamilton';
var botCycle = null;                  // cycle the Hamilton mode follows (null = rebuilding after a mid-game switch)
var botRepairWait = 0;
var botPockets = 1;                   // free pockets when the Hamilton mode last looked (no cycle yet)
var botDriver = '';                   // what decided the last move: 'cycle', 'cycle + shortcut', 'A*' or 'A* (rebuilding cycle)'

function botSetMode(mode) {
  isBotEnabled = true;
  botMode = mode;
  botCycle = null;
  botRepairWait = 0;
  botMoveList = [];
  ChunkFill.reset();
}

// Body tiles ordered tail → head (lowest decay first).
function botBody() {
  const body = [];
  grid.forEach((tile, pos) => {
    if (tile.state > 0 && tile.state < state.WALL) body.push({ ...TextToPos(pos), decay: tile.decay });
  });
  return body.sort((a, b) => a.decay - b.decay).map(({ i, j }) => ({ i, j }));
}

// The cycle bot is safe while every body tile lies on the cycle arc tail → head.
function botOnCycle(cyc, body) {
  const tail = cyc.index.get(PosToText(body[0].i, body[0].j));
  const span = cyc.dist(tail, cyc.index.get(PosToText(currentTile.i, currentTile.j)));
  return body.every(p => cyc.dist(tail, cyc.index.get(PosToText(p.i, p.j))) <= span);
}

// Adopting a cycle mid-game needs the body as one unbroken stretch of it (no holes), so the gap ahead is free.
function botTightOnCycle(cyc, body) {
  const tail = cyc.index.get(PosToText(body[0].i, body[0].j));
  return cyc.dist(tail, cyc.index.get(PosToText(currentTile.i, currentTile.j))) === body.length - 1 && botOnCycle(cyc, body);
}

// Hamilton mode: follow a cycle the body lies on (the fixed one from the start of a game, or one rebuilt
// through the body after switching in mid-game), with A* shortcuts whenever they are safe.
function botHamiltonTarget() {
  const body = botBody();
  if (botCycle && !botOnCycle(botCycle, body)) botCycle = null;
  if (!botCycle && botTightOnCycle(DEFAULT_CYCLE, body)) botCycle = DEFAULT_CYCLE;
  if (!botCycle && botRepairWait-- <= 0) {
    const cells = repairCycle(body);
    if (cells) botCycle = makeCycle(cells);
    else botRepairWait = BOT_REPAIR_RETRY;
  }
  if (!botCycle) return botChunkTarget();
  const { target, viaShortcut } = HamiltonBot.nextMove(botCycle);
  botDriver = viaShortcut ? 'cycle + shortcut' : 'cycle';
  isTailChasing = false;
  botMoveList = [grid.get(PosToText(target.i, target.j))].filter(Boolean);
  return target;
}

// No cycle yet. One free pocket: A* plays (null) while the rebuild is retried. Several pockets: fill the
// head's pocket and leave through a tile the tail has freed (chunk-fill.js), so the pockets can merge.
function botChunkTarget() {
  const pockets = ChunkFill.pockets();
  botPockets = pockets;
  if (pockets <= 1) { ChunkFill.reset(); return null; }
  const move = ChunkFill.nextMove();
  if (!move) return null;
  botDriver = `chunk fill (${pockets} pockets)`;
  isTailChasing = false;
  botMoveList = move.plan.map(p => grid.get(PosToText(p.i, p.j))).filter(Boolean);
  return move.target;
}

function botTick() {
  if (Number.isNaN(itemTile.i)) return;                 // board full
  let target = botMode === 'hamilton' ? botHamiltonTarget() : null;
  if (!target) {
    const { path, isChasing } = AStarBot.nextMove();
    botDriver = botMode !== 'hamilton' ? 'A*'
      : botPockets > 1 ? `A* (no way out of the pocket, ${botPockets} pockets)` : 'A* (rebuilding cycle)';
    isTailChasing = isChasing;
    botMoveList = path.map(p => grid.get(PosToText(p.i, p.j)));
    target = path[0];
  }
  if (target) controller.dir = posToDir(currentTile, target);
}

// ---------- Visual debug (tap the top-left corner) ----------
const BOT_DEBUG_COLORS = { cycle: 'rgba(255,255,255,0.25)', ahead: '#f5d000', next: 'red', astar: 'red', chase: 'blue', chunk: '#ff8c00' };

function botDebugLine(cells, color, width) {
  if (cells.length < 2) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  cells.forEach((p, k) => {
    const tile = grid.get(PosToText(p.i, p.j));
    if (!tile) return;
    k ? ctx.lineTo(tile.x * screen_scale, tile.y * screen_scale) : ctx.moveTo(tile.x * screen_scale, tile.y * screen_scale);
  });
  ctx.stroke(); ctx.lineWidth = 1;
}

function botDebugDots(tiles, color) {
  ctx.fillStyle = color;
  tiles.filter(Boolean).forEach(tile => {
    ctx.beginPath();
    ctx.arc(tile.x * screen_scale, tile.y * screen_scale, TileSize / 3 * screen_scale, 0, 2 * Math.PI);
    ctx.fill();
  });
}

// Faint tint per free pocket (a different hue each); the head's pocket a little stronger.
function botDebugPockets() {
  const ids = ChunkFill.pocketMap();
  const headPocket = new Set(neighborsOfHead().map(p => ids.get(PosToText(p.i, p.j))).filter(Boolean));
  ids.forEach((id, pos) => {
    const tile = grid.get(pos);
    draw.tile(tile.x * screen_scale, tile.y * screen_scale, TileSize * screen_scale);
    ctx.fillStyle = `hsla(${(id * 67) % 360}, 70%, 60%, ${headPocket.has(id) ? 0.22 : 0.12})`;
    ctx.fill();
  });
}
const neighborsOfHead = () => [0, 1, 2, 3, 4, 5].map(d => { const v = dirToPos(d); return { i: currentTile.i + v.i, j: currentTile.j + v.j }; });

// Hamilton: the whole cycle faintly, the route ahead along it (head → fruit, or head → tail when the fruit is
// behind the tail) in yellow, the next step in red. A* / rebuilding: the planned path in red, a tail chase in blue.
function botDebugDraw() {
  const usingCycle = isBotEnabled && botMode === 'hamilton' && botCycle && botDriver.startsWith('cycle');
  if (usingCycle) {
    const cyc = botCycle;
    botDebugLine([...cyc.cells, cyc.cells[0]], BOT_DEBUG_COLORS.cycle, 1);
    const head = cyc.index.get(PosToText(currentTile.i, currentTile.j));
    const body = botBody(), tail = cyc.index.get(PosToText(body[0].i, body[0].j));
    const item = cyc.index.get(PosToText(itemTile.i, itemTile.j));
    const end = item !== undefined && cyc.dist(head, item) < cyc.dist(head, tail) ? item : tail;
    const ahead = [];
    for (let k = head; k !== end; k = (k + 1) % cyc.size) ahead.push(cyc.cells[k]);
    ahead.push(cyc.cells[end]);
    botDebugLine(ahead, BOT_DEBUG_COLORS.ahead, 2);
    botDebugDots(botMoveList, BOT_DEBUG_COLORS.next);
  } else if (botDriver.startsWith('chunk')) {
    botDebugPockets();
    botDebugLine([currentTile, ...botMoveList.map(t => TextToPos(t.pos))], BOT_DEBUG_COLORS.chunk, 2);
    botDebugDots(botMoveList.slice(-1), BOT_DEBUG_COLORS.chunk);
  } else {
    botDebugDots(botMoveList, isTailChasing ? BOT_DEBUG_COLORS.chase : BOT_DEBUG_COLORS.astar);
  }
}
