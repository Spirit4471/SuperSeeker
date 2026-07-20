// player.js — 第一人称玩家：移动/碰撞/蹲伏/冲刺噪音/变身纸箱
import * as THREE from 'three';

const EYE_STAND = 1.6;
const EYE_CROUCH = 0.9;
const EYE_DISGUISE = 0.7;
const RADIUS = 0.4;
const SPEED_WALK = 5;
const SPEED_SPRINT = 8;
const SPEED_CROUCH = 2.5;

export class Player {
  constructor(camera, dom, world, onNoise) {
    this.camera = camera;
    this.world = world;
    this.onNoise = onNoise; // (pos: Vector3) => void，冲刺时周期性触发

    this.pos = world.playerSpawn.clone();
    this.yaw = -Math.PI * 0.75; // 出生朝向地图中心
    this.pitch = 0;
    this.keys = {};
    this.crouching = false;
    this.disguised = false;
    this.enabled = false;
    this.locked = false;
    this.noiseTimer = 0;

    // 变身后的伪装纸箱（玩家第一人称看不到自己，这个箱子是给寻找者看的）
    this.crateMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshLambertMaterial({ color: 0xb08850 }),
    );
    this.crateMesh.castShadow = true;
    this.crateMesh.visible = false;

    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.onKey(e.code);
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch -= e.movementY * 0.0023;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
  }

  onKey(code) {
    if (!this.enabled) return;
    if (code === 'KeyC') this.crouching = !this.crouching;
    if (code === 'KeyE') this.toggleDisguise();
  }

  toggleDisguise() {
    this.disguised = !this.disguised;
    if (this.disguised) {
      this.crateMesh.position.set(this.pos.x, 0.55, this.pos.z);
      this.crateMesh.rotation.y = this.yaw;
      this.crateMesh.visible = true;
    } else {
      this.crateMesh.visible = false;
    }
  }

  get sprinting() {
    return (this.keys['ShiftLeft'] || this.keys['ShiftRight']) && !this.crouching && !this.disguised;
  }

  update(dt, colliders) {
    if (!this.enabled) return;

    let mx = 0, mz = 0;
    if (this.keys['KeyW']) mz -= 1;
    if (this.keys['KeyS']) mz += 1;
    if (this.keys['KeyA']) mx -= 1;
    if (this.keys['KeyD']) mx += 1;
    const moving = mx !== 0 || mz !== 0;

    if (moving && this.disguised) {
      // 一动就露馅：移动自动解除伪装
      this.disguised = false;
      this.crateMesh.visible = false;
    }

    if (moving) {
      const speed = this.crouching ? SPEED_CROUCH : (this.sprinting ? SPEED_SPRINT : SPEED_WALK);
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dx = (mx * cos - mz * sin) * speed * dt;
      const dz = (mx * sin + mz * cos) * speed * dt;
      this.moveWithCollision(dx, dz, colliders);
    }

    // 冲刺发出噪音脉冲，会引来寻找者
    if (this.sprinting && moving) {
      this.noiseTimer -= dt;
      if (this.noiseTimer <= 0) {
        this.noiseTimer = 0.5;
        this.onNoise?.(this.pos.clone());
      }
    } else {
      this.noiseTimer = 0;
    }

    // 相机
    const eye = this.disguised ? EYE_DISGUISE : (this.crouching ? EYE_CROUCH : EYE_STAND);
    this.camera.position.set(this.pos.x, eye, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }

  // 圆（玩家）vs AABB（障碍物），逐轴解算
  moveWithCollision(dx, dz, colliders) {
    this.pos.x += dx;
    for (const c of colliders) {
      if (this.circleHits(c)) this.pos.x = dx > 0 ? c.minX - RADIUS : c.maxX + RADIUS;
    }
    this.pos.z += dz;
    for (const c of colliders) {
      if (this.circleHits(c)) this.pos.z = dz > 0 ? c.minZ - RADIUS : c.maxZ + RADIUS;
    }
  }

  circleHits(c) {
    const nx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
    const ddx = this.pos.x - nx, ddz = this.pos.z - nz;
    return ddx * ddx + ddz * ddz < RADIUS * RADIUS;
  }
}
