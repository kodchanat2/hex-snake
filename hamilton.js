/*========== Hamiltonian cycle  ==========*/
// A closed path that visits every tile of the hex board exactly once.
// Board: axial coords i in [0,25), j in [0,29) with 12 - i <= j < 41 - i.
// Row j spans i = L(j)..R(j). Construction:
//   1. rows 0..26, cells L(j)+1..R(j), boustrophedon (even rows left→right,
//      odd rows right→left);
//   2. rows 27/28 zigzag right→left: (i,27),(i-1,28) for i = R(27)..L(27)+1;
//   3. up the left border from (L(27),27) to (L(0),0), which touches the start
//      (the zigzag already ends on (L(28),28)).

const HAMILTON_ROWS = 29;
const HAMILTON_HALF = 12;
const HAMILTON_MAX_I = 24;

const hamiltonLeft = j => Math.max(0, HAMILTON_HALF - j);
const hamiltonRight = j => Math.min(HAMILTON_MAX_I, HAMILTON_ROWS + HAMILTON_HALF - 1 - j);

function buildHamiltonCycle() {
  const cells = [];
  for (let j = 0; j <= HAMILTON_ROWS - 3; j++) {
    const row = [];
    for (let i = hamiltonLeft(j) + 1; i <= hamiltonRight(j); i++) row.push({ i, j });
    cells.push(...(j % 2 === 0 ? row : row.reverse()));
  }
  const zigRow = HAMILTON_ROWS - 2;
  for (let i = hamiltonRight(zigRow); i >= hamiltonLeft(zigRow) + 1; i--) {
    cells.push({ i, j: zigRow }, { i: i - 1, j: zigRow + 1 });
  }
  for (let j = HAMILTON_ROWS - 2; j >= 0; j--) cells.push({ i: hamiltonLeft(j), j });
  return cells;
}

const HAMILTON_CYCLE = buildHamiltonCycle();
const HAMILTON_SIZE = HAMILTON_CYCLE.length;
// posText -> index along the cycle. Keys match PosToText() in script.js (which
// loads after this file, so it is not callable here; all coords are >= 0).
const hamiltonKey = (i, j) => `P${i}_P${j}`;
const HAMILTON_INDEX = new Map(HAMILTON_CYCLE.map((c, k) => [hamiltonKey(c.i, c.j), k]));

// Steps needed to go from cycle index a forward to cycle index b.
const hamiltonDist = (a, b) => (b - a + HAMILTON_SIZE) % HAMILTON_SIZE;

// A cycle object the bots can use: cells in order, posText → index, size, forward distance.
function makeCycle(cells) {
  const size = cells.length;
  return {
    cells, size,
    index: new Map(cells.map((c, k) => [hamiltonKey(c.i, c.j), k])),
    dist: (a, b) => (b - a + size) % size,
  };
}
const DEFAULT_CYCLE = makeCycle(HAMILTON_CYCLE);
