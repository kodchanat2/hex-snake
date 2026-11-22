/*========== 3D snake: visual debug ==========*/
// Same colour language as the hex game's debug:
//   Hamilton: the whole cycle faintly (white), the next stretch of the route along it (yellow), the next step (red dot).
//   Chunk fill: a faint tint per free pocket (the head's pocket a little stronger), the path through it
//               (orange, faint, only its next steps) and the exit the tail opens (orange dot).
//   Joining the cycle: the approach route plus the stretch of cycle it will follow (cyan).
//   A*: the planned path to the food (red), or the escape route to the tail (blue).
//   While Hamilton is still looking for a way onto the cycle (A* or chunk fill drives): the cycle faintly,
//   its best try so far (pale cyan) and the cell that blocked it (red cube).
import * as THREE from 'three';

const COLORS = { cycle: 0xffffff, ahead: 0xf5d000, next: 0xff2020, astar: 0xff2020, chase: 0x2040ff, chunk: 0xff8c00, join: 0x00c8c8, attempt: 0x7fe8e8, blocker: 0xff2020 };
const AHEAD_SHOWN = 150;               // the yellow route shows only the next part of the cycle
const CHUNK_SHOWN = 40;                // the orange chunk path shows only its next steps (plus the exit dot)
const CHUNK_OPACITY = 0.3;

export function createDebug(scene, toWorld, SIZE) {
  const CELLS = SIZE ** 3;
  const MAX_POINTS = CELLS + 1;          // the whole cycle, closed
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  function dynamicLine(color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    line.renderOrder = 2;
    group.add(line);
    return line;
  }
  function setLine(line, cells, color) {
    const pos = line.geometry.attributes.position;
    const n = Math.min(cells.length, MAX_POINTS);
    for (let k = 0; k < n; k++) { const w = toWorld(cells[k]); pos.setXYZ(k, w.x, w.y, w.z); }
    pos.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
    if (color !== undefined) line.material.color.setHex(color);
  }
  const cycleLine = dynamicLine(COLORS.cycle, 0.18);
  const aheadLine = dynamicLine(COLORS.ahead, 0.95);
  const pathLine = dynamicLine(COLORS.astar, 0.95);
  const attemptLine = dynamicLine(COLORS.attempt, 0.6);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: COLORS.blocker, transparent: true, opacity: 0.8, depthTest: false }));
  blocker.renderOrder = 3;
  group.add(blocker);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.next, depthTest: false }));
  dot.renderOrder = 3;
  group.add(dot);

  // pocket tint: one instanced cube per free cell; the head's pocket gets its own, stronger layer
  const tintGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
  const tintMat = a => new THREE.MeshBasicMaterial({ transparent: true, opacity: a, depthWrite: false });
  const tintOthers = new THREE.InstancedMesh(tintGeo, tintMat(0.05), CELLS);
  const tintHead = new THREE.InstancedMesh(tintGeo, tintMat(0.11), CELLS);
  [tintOthers, tintHead].forEach(m => { m.count = 0; group.add(m); });
  const matrix = new THREE.Matrix4(), color = new THREE.Color();
  const id = c => (c.x * SIZE + c.y) * SIZE + c.z;
  const cellOf = k => ({ x: Math.floor(k / (SIZE * SIZE)), y: Math.floor(k / SIZE) % SIZE, z: k % SIZE });

  function drawPockets(pockets, snake) {
    if (!pockets) { tintOthers.count = tintHead.count = 0; return; }
    const headPockets = new Set();
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(([a, b, c]) => {
      const n = { x: snake[0].x + a, y: snake[0].y + b, z: snake[0].z + c };
      if ([n.x, n.y, n.z].every(v => v >= 0 && v < SIZE) && pockets.pocket[id(n)]) headPockets.add(pockets.pocket[id(n)]);
    });
    let o = 0, h = 0;
    for (let k = 0; k < CELLS; k++) {
      const pid = pockets.pocket[k];
      if (!pid) continue;
      const w = toWorld(cellOf(k));
      matrix.makeTranslation(w.x, w.y, w.z);
      color.setHSL(((pid * 67) % 360) / 360, 0.7, 0.6);
      const mesh = headPockets.has(pid) ? tintHead : tintOthers, i = headPockets.has(pid) ? h++ : o++;
      mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, color);
    }
    tintOthers.count = o; tintHead.count = h;
    [tintOthers, tintHead].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }

  let shownCycle = null;
  // move: what the bot returned last tick ({ path, chase, chunk }); info: bots.debugInfo()
  function update(game, move, info) {
    const on = group.visible && move;
    [cycleLine, aheadLine, pathLine, dot].forEach(o => { o.visible = !!on; });
    attemptLine.visible = blocker.visible = false;
    if (!on) { drawPockets(null); return; }
    const head = game.snake[0];
    const cyc = info.cycle && !move.chunk && move.driver.startsWith('cycle') ? info.cycle : null;
    cycleLine.visible = aheadLine.visible = !!cyc;
    pathLine.visible = !cyc;
    drawPockets(move.chunk ? info.pockets : null, game.snake);
    if (cyc) {
      if (shownCycle !== cyc) { setLine(cycleLine, [...cyc.cells, cyc.cells[0]]); shownCycle = cyc; }
      const h = cyc.index[id(head)], t = cyc.index[id(game.snake[game.snake.length - 1])];
      const f = game.food ? cyc.index[id(game.food)] : -1;
      const end = f >= 0 && cyc.dist(h, f) < cyc.dist(h, t) ? f : t;
      const ahead = [];
      for (let k = h; k !== end && ahead.length < AHEAD_SHOWN; k = (k + 1) % cyc.size) ahead.push(cyc.cells[k]);
      if (ahead.length < AHEAD_SHOWN) ahead.push(cyc.cells[end]);
      setLine(aheadLine, ahead);
      dot.material.color.setHex(COLORS.next);
      dot.position.copy(toWorld(move.path[0] || head));
      return;
    }
    if (move.attempt && move.attempt.cells.length) {             // Hamilton's best try while something else drives
      const at = move.attempt;
      if (shownCycle !== at.cyc) { setLine(cycleLine, [...at.cyc.cells, at.cyc.cells[0]]); shownCycle = at.cyc; }
      cycleLine.visible = attemptLine.visible = blocker.visible = true;
      setLine(attemptLine, [head, ...at.cells]);
      blocker.position.copy(toWorld(at.blocker));
    }
    const color = move.join ? COLORS.join : move.chunk ? COLORS.chunk : move.chase ? COLORS.chase : COLORS.astar;
    setLine(pathLine, move.chunk ? [head, ...move.path.slice(0, CHUNK_SHOWN)] : [head, ...move.path], color);
    pathLine.material.opacity = move.chunk ? CHUNK_OPACITY : 0.95;
    dot.material.color.setHex(color);
    dot.position.copy(toWorld(move.chunk ? move.path[move.path.length - 1] : move.path[0] || head));
  }

  return {
    update,
    get visible() { return group.visible; },
    set visible(v) { group.visible = v; },
  };
}
