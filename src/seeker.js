// seeker.js — AI 寻找者：数数/巡逻/警觉/追捕/查看 状态机 + 视线锥检测
import * as THREE from 'three';
import { followPath } from './pathfind.js';

const VISION_RANGE = 18;          // 站立玩家被发现距离
const VISION_RANGE_CROUCH = 9;    // 蹲伏时被大幅缩短
const VISION_COS = Math.cos(THREE.MathUtils.degToRad(35)); // 70° 视锥
const DISGUISE_SPOT_RANGE = 3;    // 这么近，纸箱伪装会被识破
const DISGUISE_CHASE_RANGE = 6;   // 追逐中，这个距离内变身无效
const CATCH_RANGE = 1.3;
const SPEED_PATROL = 3.5;
const SPEED_CHASE = 5.6;

export class Seeker {
  constructor(scene, world, grid, player, hiders, events = {}) {
    this.world = world;
    this.grid = grid;
    this.player = player;
    this.hiders = hiders;
    this.events = events;
    this.obstacles = world.obstacleMeshes;
    this.raycaster = new THREE.Raycaster();

    this.pos = world.seekerSpawn.clone();
    this.heading = Math.PI * 0.75; // 出生面向地图中心
    this.state = 'counting';       // counting | patrol | suspicious | chase | check
    this.path = null;
    this.wpIndex = 0;
    this.suspicion = 0;
    this.target = null;            // {kind:'player'|'hider', ref?}
    this.lastSeen = new THREE.Vector3();
    this.loseTimer = 0;
    this.checkTimer = 0;
    this.repathTimer = 0;

    // ── 外观：红色小人 + 半透明视线锥 ──
    this.group = new THREE.Group();
    const matBody = new THREE.MeshLambertMaterial({ color: 0xd23c3c });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.3, 16), matBody);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), matBody);
    head.position.y = 1.75;
    head.castShadow = true;

    const coneLen = 12;
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(Math.tan(THREE.MathUtils.degToRad(35)) * coneLen, coneLen, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd166, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    this.cone.rotation.x = Math.PI / 2; // 锥尖朝后、开口朝模型前方(-z)
    this.cone.position.set(0, 1.6, -coneLen / 2);

    this.group.add(body, head, this.cone);
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  // 数数结束，开始行动
  activate() {
    if (this.state === 'counting') this.toPatrol();
  }

  toPatrol() {
    this.state = 'patrol';
    this.target = null;
    this.suspicion = 0;
    this.path = this.grid.findPath(this.pos, this.world.waypoints[this.wpIndex]);
  }

  // 听到冲刺噪音：前往查看（不打断追捕/确认）
  hearNoise(pos) {
    if (this.state === 'chase' || this.state === 'suspicious' || this.state === 'counting') return;
    this.lastSeen.copy(pos);
    this.path = this.grid.findPath(this.pos, pos);
    this.state = 'check';
    this.checkTimer = 0;
  }

  // ── 视线检测：距离 → 视锥角度 → 射线遮挡 ──
  canSee(pos, eyeH, range) {
    const eye = new THREE.Vector3(this.pos.x, 1.7, this.pos.z);
    const target = new THREE.Vector3(pos.x, eyeH, pos.z);
    const dir = target.clone().sub(eye);
    const dist = dir.length();
    if (dist > range) return false;
    dir.normalize();
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    if (fwd.dot(flat) < VISION_COS && dist > 1.5) return false; // 贴身距离不看角度
    this.raycaster.set(eye, dir);
    this.raycaster.far = Math.max(dist - 0.1, 0.01);
    return this.raycaster.intersectObjects(this.obstacles, false).length === 0;
  }

  // 找到当前最显眼的可见目标
  findTarget() {
    let best = null;
    const p = this.player;
    const dp = this.pos.distanceTo(p.pos);
    if (p.disguised) {
      // 伪装纸箱：锥形视野免疫，但贴身会露馅
      if (dp < DISGUISE_SPOT_RANGE) best = { kind: 'player', dist: dp };
    } else {
      const range = p.crouching ? VISION_RANGE_CROUCH : VISION_RANGE;
      const eyeH = p.crouching ? 0.5 : 1.2;
      if (dp < range && this.canSee(p.pos, eyeH, range)) best = { kind: 'player', dist: dp };
    }
    for (const h of this.hiders) {
      if (h.eliminated) continue;
      const dh = this.pos.distanceTo(h.pos);
      if (dh < VISION_RANGE && this.canSee(h.pos, 0.9, VISION_RANGE)) {
        if (!best || dh < best.dist) best = { kind: 'hider', ref: h, dist: dh };
      }
    }
    return best;
  }

  targetPos() {
    return this.target.kind === 'player' ? this.player.pos : this.target.ref.pos;
  }

  // 当前目标是否仍在视野中
  targetVisible() {
    const t = this.target;
    if (t.kind === 'player') {
      const p = this.player;
      const d = this.pos.distanceTo(p.pos);
      if (p.disguised) return d < DISGUISE_CHASE_RANGE; // 追击中：近身变身无效，远了金蝉脱壳
      const range = p.crouching ? VISION_RANGE_CROUCH : VISION_RANGE;
      return d < range && this.canSee(p.pos, p.crouching ? 0.5 : 1.2, range);
    }
    const h = t.ref;
    if (h.eliminated) return false;
    return this.pos.distanceTo(h.pos) < VISION_RANGE && this.canSee(h.pos, 0.9, VISION_RANGE);
  }

  targetStillThere() {
    if (this.target.kind === 'player' && this.player.disguised) {
      return this.pos.distanceTo(this.player.pos) < DISGUISE_SPOT_RANGE;
    }
    return this.targetVisible();
  }

  update(dt) {
    if (this.state === 'counting') return;

    switch (this.state) {
      case 'patrol': {
        const seen = this.findTarget();
        if (seen) {
          this.target = seen;
          this.state = 'suspicious';
          this.suspicion = 0;
          this.events.onAlert?.();
          break;
        }
        if (followPath(this.pos, this.path, SPEED_PATROL, dt)) {
          this.wpIndex = (this.wpIndex + 1) % this.world.waypoints.length;
          this.path = this.grid.findPath(this.pos, this.world.waypoints[this.wpIndex]);
        }
        this.faceMovement(dt);
        break;
      }

      case 'suspicious': {
        if (this.targetStillThere()) {
          this.facePoint(this.targetPos(), dt, 6);
          this.suspicion += dt * (this.target.dist < 8 ? 2.2 : 1.2);
          if (this.suspicion >= 0.6) {
            this.state = 'chase';
            this.repathTimer = 0;
            this.events.onChaseStart?.();
          }
        } else {
          this.suspicion -= dt * 1.5;
          if (this.suspicion <= 0) {
            this.suspicion = 0;
            this.toPatrol();
          }
        }
        break;
      }

      case 'chase': {
        const tPos = this.targetPos();
        if (this.targetVisible()) {
          this.lastSeen.copy(tPos);
          this.loseTimer = 0;
        } else {
          this.loseTimer += dt;
          if (this.loseTimer > 3) {
            // 丢失目标：去最后目击点查看
            this.path = this.grid.findPath(this.pos, this.lastSeen);
            this.state = 'check';
            this.checkTimer = 0;
            this.events.onChaseEnd?.();
            break;
          }
        }
        // 抓捕判定
        if (this.pos.distanceTo(tPos) < CATCH_RANGE) {
          if (this.target.kind === 'player') {
            this.events.onCatchPlayer?.();
          } else {
            this.target.ref.eliminate();
            this.events.onCatchHider?.(this.target.ref);
            this.toPatrol();
          }
          break;
        }
        // 周期性重新寻路，咬住目标
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.4;
          this.path = this.grid.findPath(this.pos, tPos);
        }
        followPath(this.pos, this.path, SPEED_CHASE, dt);
        this.faceMovement(dt, 10);
        break;
      }

      case 'check': {
        const seen = this.findTarget();
        if (seen) {
          this.target = seen;
          this.state = 'suspicious';
          this.suspicion = 0;
          this.events.onAlert?.();
          break;
        }
        if (this.path && this.path.length > 0) {
          followPath(this.pos, this.path, SPEED_PATROL, dt);
          this.faceMovement(dt);
        } else {
          // 到达查看点，原地扫视一圈
          this.checkTimer += dt;
          this.heading += dt * 2.2;
          if (this.checkTimer > 2.5) this.toPatrol();
        }
        break;
      }
    }

    // 同步外观
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
    const chasing = this.state === 'chase';
    this.cone.material.color.set(chasing ? 0xff5d5d : 0xffd166);
    this.cone.material.opacity = chasing ? 0.14 : 0.08;
  }

  faceMovement(dt, rate = 8) {
    if (!this.path || this.path.length === 0) return;
    const t = this.path[0];
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.01) return;
    this.heading = dampAngle(this.heading, Math.atan2(-dx, -dz), rate, dt);
  }

  facePoint(p, dt, rate = 8) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    this.heading = dampAngle(this.heading, Math.atan2(-dx, -dz), rate, dt);
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, lambda * dt);
}
