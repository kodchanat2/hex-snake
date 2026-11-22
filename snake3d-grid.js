/*========== 3D snake: grid helpers ==========*/
// Cells are { x, y, z } in 0..N-1; id() packs a cell into one integer.

export const DIRS = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

export function makeGrid(N) {
  const id = c => (c.x * N + c.y) * N + c.z;
  const cellOf = k => ({ x: Math.floor(k / (N * N)), y: Math.floor(k / N) % N, z: k % N });
  const inside = c => c.x >= 0 && c.x < N && c.y >= 0 && c.y < N && c.z >= 0 && c.z < N;
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const neighbors = c => DIRS.map(d => add(c, d)).filter(inside);
  const touches = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  return { N, CELLS: N * N * N, id, cellOf, inside, add, sub, neighbors, touches, manhattan };
}
