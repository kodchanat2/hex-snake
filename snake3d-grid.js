/*========== 3D snake: grid helpers ==========*/
// Cells are { x, y, z } with 0 <= x < dims.x, 0 <= y < dims.y (up), 0 <= z < dims.z; id() packs a cell into
// one integer. makeGrid(n) is the cube n × n × n.

export const DIRS = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];

export function makeGrid(size) {
  const dims = typeof size === 'number' ? { x: size, y: size, z: size } : { ...size };
  const { x: DX, y: DY, z: DZ } = dims;
  const id = c => (c.x * DY + c.y) * DZ + c.z;
  const cellOf = k => ({ x: Math.floor(k / (DY * DZ)), y: Math.floor(k / DZ) % DY, z: k % DZ });
  const inside = c => c.x >= 0 && c.x < DX && c.y >= 0 && c.y < DY && c.z >= 0 && c.z < DZ;
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const neighbors = c => DIRS.map(d => add(c, d)).filter(inside);
  const touches = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) === 1;
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
  return { dims, CELLS: DX * DY * DZ, id, cellOf, inside, add, sub, neighbors, touches, manhattan };
}
