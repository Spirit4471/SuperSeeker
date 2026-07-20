// main.js — 入口：渲染器、游戏状态机（menu → hide → play → won/lost）、主循环
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Grid } from './pathfind.js';
import { Player } from './player.js';
import { Seeker } from './seeker.js';
import { Hiders } from './hiders.js';
import { AudioFX } from './audio.js';
import { UI } from './ui.js';

// ── 调试参数：?flycam 俯瞰全图 / ?play 免点击自动开局 / ?fast 缩短时长（e2e 用）──
const params = new URLSearchParams(location.search);
const FAST = params.has('fast');
const HIDE_TIME = FAST ? 3 : 20;   // 躲藏阶段时长（秒）
const PLAY_TIME = FAST ? 8 : 120;  // 存活目标时长（秒）

// ── 渲染基础 ─────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1016);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 200);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── 世界与角色 ───────────────────────────────────
const world = buildWorld(scene);
const grid = new Grid(world.colliders);
const ui = new UI();
const audio = new AudioFX();

const player = new Player(camera, renderer.domElement, world, (pos) => {
  seeker.hearNoise(pos);
  ui.flashNoise();
});
scene.add(player.crateMesh);

const hiders = new Hiders(scene, world, grid, 3);

const seeker = new Seeker(scene, world, grid, player, hiders, {
  onAlert: () => audio.alert(),
  onChaseStart: () => {
    audio.chase();
    if (seeker.target?.kind === 'player') ui.setAlert(true);
  },
  onChaseEnd: () => ui.setAlert(false),
  onCatchPlayer: () => endGame(false),
  onCatchHider: () => {
    audio.caught();
    ui.setMates(hiders.aliveCount, 3);
  },
});

// 变身时播放音效
const origToggle = player.toggleDisguise.bind(player);
player.toggleDisguise = () => { origToggle(); audio.disguise(); };

// ── 游戏状态机 ───────────────────────────────────
let state = 'menu'; // menu | hide | play | won | lost
let stateTimer = 0;
let stepTimer = 0;

ui.onStart(() => {
  audio.ensure();
  renderer.domElement.requestPointerLock();
  startHide();
});

// ── 调试参数：?flycam 俯瞰全图 / ?play 免点击自动开局 / ?fast 缩短时长 ──
if (params.has('flycam')) {
  document.getElementById('overlay').classList.add('hidden');
  camera.position.set(0, 52, 0.01);
  camera.lookAt(0, 0, 0);
} else if (params.has('play')) {
  ui.showHUD();
  startHide();
}

// 供 e2e 测试与控制台调试读取
window.__game = {
  get state() { return state; },
  get timer() { return stateTimer; },
  set timer(v) { stateTimer = v; },
  seeker, player, hiders, world,
};

function startHide() {
  state = 'hide';
  stateTimer = HIDE_TIME;
  ui.showHUD();
  ui.setPhase('寻找者正在数数…抓紧躲藏！');
  ui.setMates(3, 3);
  player.enabled = true;
  hiders.scatter();
}

function startPlay() {
  state = 'play';
  stateTimer = PLAY_TIME;
  ui.setPhase('寻找者出动了！活下去！');
  seeker.activate();
}

function endGame(won) {
  if (state !== 'play') return;
  state = won ? 'won' : 'lost';
  player.enabled = false;
  document.exitPointerLock?.();
  ui.setAlert(false);
  if (won) audio.win(); else audio.caught();
  ui.showResult(won, won
    ? `你成功躲过了 ${PLAY_TIME} 秒！同伴存活 ${hiders.aliveCount}/3。`
    : `你在剩余 ${Math.max(0, Math.ceil(stateTimer))} 秒时被抓住了。同伴存活 ${hiders.aliveCount}/3。`);
}

// ── 主循环 ───────────────────────────────────────
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'hide' || state === 'play') {
    player.update(dt, world.colliders);
    hiders.update(dt, seeker);

    // 自己的脚步声（节奏随移动方式变化）
    const moving = player.keys['KeyW'] || player.keys['KeyA'] || player.keys['KeyS'] || player.keys['KeyD'];
    if (moving && !player.disguised) {
      stepTimer -= dt * (player.sprinting ? 1.7 : player.crouching ? 0.55 : 1);
      if (stepTimer <= 0) {
        stepTimer = 0.45;
        audio.step();
      }
    }

    stateTimer -= dt;
    ui.setTimer(stateTimer, state === 'play' && stateTimer < 20);

    if (state === 'hide') {
      if (stateTimer <= 0) startPlay();
    } else {
      seeker.update(dt);
      if (state === 'play' && stateTimer <= 0) endGame(true);
    }
  }

  renderer.render(scene, camera);
}
loop();
