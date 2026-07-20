// hiders.js — 3 个 AI 躲藏者同伴：开局找掩体藏匿，被追捕时逃跑，被抓倒地淘汰
import * as THREE from 'three';
import { followPath } from './pathfind.js';

const SPEED = 4.2;

export class Hiders {
  constructor(scene, world, grid, count = 3) {
    this.grid = grid;
    this.world = world;
    this.list = [];

    const matAlive = new THREE.MeshLambertMaterial({ color: 0x4a9edb });
    const matDead = new THREE.MeshLambertMaterial({ color: 0x555b66 });

    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.1, 12), matAlive);
      body.position.y = 0.75;
      body.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), matAlive);
      head.position.y = 1.55;
      head.castShadow = true;
      group.add(body, head);

      // 出生在玩家附近，各自预选不同的掩体点
      const spot = world.hideSpots[(i * 3 + 1) % world.hideSpots.length];
      const pos = world.playerSpawn.clone();
      pos.x += (i - 1) * 1.5;
      pos.z += 1.5;
      group.position.copy(pos);
      scene.add(group);

      const h = {
        pos,
        mesh: group,
        spot,
        heading: 0,
        path: null,
        hidden: false,
        eliminated: false,
        repathTimer: 0,
        eliminate() {
          this.eliminated = true;
          this.mesh.rotation.x = Math.PI / 2; // 倒地
          this.mesh.position.y = 0.35;
          for (const m of this.mesh.children) m.material = matDead;
        },
      };
      this.list.push(h);
    }
  }

  get aliveCount() {
    return this.list.filter((h) => !h.eliminated).length;
  }

  [Symbol.iterator]() {
    return this.list[Symbol.iterator]();
  }

  // 躲藏阶段开始：各自跑向预选的掩体点
  scatter() {
    for (const h of this.list) {
      h.path = this.grid.findPath(h.pos, h.spot);
    }
  }

  update(dt, seeker) {
    for (const h of this.list) {
      if (h.eliminated) continue;

      // 自己正被追捕：逃向离寻找者最远的掩体点
      if (seeker.state === 'chase' && seeker.target?.kind === 'hider' && seeker.target.ref === h) {
        h.hidden = false;
        h.repathTimer -= dt;
        if (h.repathTimer <= 0) {
          h.repathTimer = 0.5;
          let best = null, bestD = -1;
          for (const s of this.world.hideSpots) {
            const d = s.distanceTo(seeker.pos);
            if (d > bestD) { bestD = d; best = s; }
          }
          h.path = this.grid.findPath(h.pos, best);
        }
      }

      if (h.path && h.path.length > 0) {
        followPath(h.pos, h.path, SPEED, dt);
        const t = h.path[0];
        if (t) h.heading = Math.atan2(-(t.x - h.pos.x), -(t.z - h.pos.z));
      } else if (!h.hidden) {
        h.hidden = true; // 到达掩体点，趴下别动
      }

      h.mesh.position.set(h.pos.x, 0, h.pos.z);
      h.mesh.rotation.y = h.heading;
    }
  }
}
