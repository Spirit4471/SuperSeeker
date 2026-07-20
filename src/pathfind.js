// pathfind.js — 地图栅格化（1m 网格）+ BFS 寻路 + 路径跟随
import * as THREE from 'three';
import { MAP_HALF } from './world.js';

export class Grid {
  constructor(colliders) {
    this.size = MAP_HALF * 2; // 40x40 格
    this.blocked = new Uint8Array(this.size * this.size);
    const R = 0.35; // collider 按代理半径膨胀，避免贴墙走
    for (const c of colliders) {
      const x0 = this.toCell(c.minX - R), x1 = this.toCell(c.maxX + R);
      const z0 = this.toCell(c.minZ - R), z1 = this.toCell(c.maxZ + R);
      for (let i = x0; i <= x1; i++) {
        for (let j = z0; j <= z1; j++) {
          if (this.inBounds(i, j)) this.blocked[j * this.size + i] = 1;
        }
      }
    }
  }

  toCell(v) { return Math.floor(v + MAP_HALF); }
  inBounds(i, j) { return i >= 0 && i < this.size && j >= 0 && j < this.size; }
  isBlocked(i, j) { return !this.inBounds(i, j) || this.blocked[j * this.size + i] === 1; }
  isWalkable(x, z) { return !this.isBlocked(this.toCell(x), this.toCell(z)); }

  cellCenter(i, j) {
    return new THREE.Vector3(i - MAP_HALF + 0.5, 0, j - MAP_HALF + 0.5);
  }

  // 从格 (ci,cj) 向外环形找最近可走格
  nearestWalkable(ci, cj) {
    if (!this.isBlocked(ci, cj)) return [ci, cj];
    for (let r = 1; r < 10; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ni = ci + di, nj = cj + dj;
          if (!this.isBlocked(ni, nj)) return [ni, nj];
        }
      }
    }
    return null;
  }

  // BFS 寻路，返回平滑后的世界坐标路径 (THREE.Vector3[])，找不到返回 null
  findPath(from, to) {
    const s = this.nearestWalkable(this.toCell(from.x), this.toCell(from.z));
    const t = this.nearestWalkable(this.toCell(to.x), this.toCell(to.z));
    if (!s || !t) return null;
    const [si, sj] = s, [ti, tj] = t;
    const W = this.size;

    const prev = new Int32Array(W * W).fill(-1);
    const seen = new Uint8Array(W * W);
    seen[sj * W + si] = 1;
    const queue = [[si, sj]];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let found = false;

    while (queue.length > 0) {
      const [ci, cj] = queue.shift();
      if (ci === ti && cj === tj) { found = true; break; }
      for (const [di, dj] of DIRS) {
        const ni = ci + di, nj = cj + dj;
        if (this.isBlocked(ni, nj) || seen[nj * W + ni]) continue;
        seen[nj * W + ni] = 1;
        prev[nj * W + ni] = cj * W + ci;
        queue.push([ni, nj]);
      }
    }
    if (!found) return null;

    // 回溯出格子路径
    const cells = [];
    let cur = tj * W + ti;
    const start = sj * W + si;
    while (cur !== -1) {
      cells.push([cur % W, Math.floor(cur / W)]);
      if (cur === start) break;
      cur = prev[cur];
    }
    cells.reverse();

    const pts = cells.map(([i, j]) => this.cellCenter(i, j));
    return smoothPath(pts);
  }
}

// 剔除共线中间点，减少转向抖动
function smoothPath(pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z;
    const bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z;
    if (Math.abs(ax * bz - az * bx) > 1e-6) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 沿路径前进（消费路径点），返回是否已到达终点
export function followPath(pos, path, speed, dt) {
  if (!path || path.length === 0) return true;
  const target = path[0];
  const dx = target.x - pos.x, dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * dt;
  if (dist <= Math.max(step, 0.05)) {
    pos.x = target.x;
    pos.z = target.z;
    path.shift();
    return path.length === 0;
  }
  pos.x += (dx / dist) * step;
  pos.z += (dz / dist) * step;
  return false;
}
