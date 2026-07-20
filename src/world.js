// world.js — 程序化生成仓库地图：地面、墙体、货架、纸箱掩体、灯光
import * as THREE from 'three';

export const MAP_HALF = 20; // 地图半边长（米），x/z ∈ [-20, 20]

const WALL_H = 4;
const INNER_H = 3;

export function buildWorld(scene) {
  const colliders = [];      // {minX, maxX, minZ, maxZ}，供移动碰撞与栅格化
  const obstacleMeshes = []; // 参与视线遮挡的 mesh

  const matFloor = new THREE.MeshLambertMaterial({ color: 0x2a2e3a });
  const matWall  = new THREE.MeshLambertMaterial({ color: 0x8d94a8 });
  const matShelf = new THREE.MeshLambertMaterial({ color: 0x4a5568 });
  const matCrate = new THREE.MeshLambertMaterial({ color: 0xb08850 });

  // ── 地面 ───────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF * 2 + 4, MAP_HALF * 2 + 4),
    matFloor,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── 辅助：加一个盒子障碍物 ──────────────────────────
  function addBox(x, z, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    obstacleMeshes.push(m);
    return m;
  }

  // ── 外墙（厚 0.6，高 4）─────────────────────────────
  const T = 0.6, H = MAP_HALF;
  addBox(0, -H - T / 2, 2 * (H + T), WALL_H, T, matWall);
  addBox(0,  H + T / 2, 2 * (H + T), WALL_H, T, matWall);
  addBox(-H - T / 2, 0, T, WALL_H, 2 * (H + T), matWall);
  addBox( H + T / 2, 0, T, WALL_H, 2 * (H + T), matWall);

  // ── 隔断墙（高 3）───────────────────────────────────
  // 墙 A：z=-2，x∈[-20,4]，门洞 x=-8 与 x=0（各宽 2.4）
  addBox(-14.6, -2, 10.8, INNER_H, 0.4, matWall);
  addBox(-4.0,  -2,  5.6, INNER_H, 0.4, matWall);
  addBox( 2.6,  -2,  2.8, INNER_H, 0.4, matWall);
  // 墙 B：x=8，z∈[-20,6]，门洞 z=-10（宽 2.4）
  addBox(8, -15.6, 0.4, INNER_H,  8.8, matWall);
  addBox(8,  -1.4, 0.4, INNER_H, 14.8, matWall);
  // 墙 C：x=-6，z∈[4,20]，门洞 z=12（宽 2.4）
  addBox(-6,  7.4, 0.4, INNER_H, 6.8, matWall);
  addBox(-6, 16.6, 0.4, INNER_H, 6.8, matWall);

  // ── 货架（高 2，可挡视线）──────────────────────────
  addBox( 14, -10, 1.2, 2, 8,   matShelf);
  addBox( 14,   4, 1.2, 2, 6,   matShelf);
  addBox(-14,   8, 8,   2, 1.2, matShelf);
  addBox(  2,  12, 6,   2, 1.2, matShelf);
  addBox( -2, -14, 6,   2, 1.2, matShelf);

  // ── 纸箱掩体：从手工挑选的合法候选点随机取 24 个 ──────
  const candidates = [
    [-16,-8], [-12,-16], [-4,-6], [2,-8], [4,-16], [-16,4], [-2,2], [4,8],
    [12,-4], [12,-14], [18,-8], [18,4], [10,12], [16,16], [6,18], [-2,18],
    [-12,16], [-18,12], [-10,18], [0,-18], [10,-18], [18,-18], [-18,-18],
    [-8,8], [6,-6], [12,8], [18,12], [-18,6], [0,16], [-10,-10],
  ];
  shuffle(candidates);
  const crateSpots = [];
  for (const [cx, cz] of candidates.slice(0, 24)) {
    const s = 1.0 + Math.random() * 0.4; // 1.0~1.4m 见方
    addBox(cx, cz, s, s, s, matCrate);
    crateSpots.push(new THREE.Vector3(cx, s / 2, cz));
  }

  // ── 灯光与雾 ───────────────────────────────────────
  scene.fog = new THREE.Fog(0x0e1016, 25, 70);

  scene.add(new THREE.HemisphereLight(0xbfd1ff, 0x202430, 0.9));

  const dir = new THREE.DirectionalLight(0xfff2d8, 1.2);
  dir.position.set(18, 26, 12);
  dir.castShadow = true;
  dir.shadow.camera.left = -30;
  dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30;
  dir.shadow.camera.bottom = -30;
  dir.shadow.camera.far = 80;
  dir.shadow.mapSize.set(2048, 2048);
  scene.add(dir);

  const p1 = new THREE.PointLight(0xffd166, 14, 18);
  p1.position.set(-12, 3.2, -10);
  scene.add(p1);
  const p2 = new THREE.PointLight(0x7fb4ff, 12, 18);
  p2.position.set(14, 3.2, 10);
  scene.add(p2);

  // ── 关键点位 ───────────────────────────────────────
  const hideSpots = [
    [-18,-8], [-18,16], [-4,18], [10,18], [18,10],
    [18,-16], [6,-16], [-4,-18], [12,2], [-12,2],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const waypoints = [
    [-12,-8], [0,-12], [14,-16], [16,-2], [12,4],
    [16,14], [4,16], [-12,14], [-14,2], [0,6],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  return {
    colliders,
    obstacleMeshes,
    hideSpots,
    waypoints,
    crateSpots,
    playerSpawn: new THREE.Vector3(-16, 0, -16),
    seekerSpawn: new THREE.Vector3(16, 0, 16),
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
