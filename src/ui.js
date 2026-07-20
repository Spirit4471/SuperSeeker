// ui.js — HUD 与菜单/结算覆盖层
export class UI {
  constructor() {
    this.overlay = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.timer = document.getElementById('timer');
    this.phase = document.getElementById('phase');
    this.alert = document.getElementById('alert');
    this.mates = document.getElementById('mates');
    this.noise = document.getElementById('noise');
    this.crosshair = document.getElementById('crosshair');
    this.startBtn = document.getElementById('startBtn');
    this.noiseTimer = null;
  }

  onStart(cb) {
    this.startBtn.addEventListener('click', cb);
  }

  showHUD() {
    this.overlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.crosshair.classList.remove('hidden');
  }

  setTimer(sec, urgent) {
    this.timer.textContent = Math.max(0, Math.ceil(sec));
    this.timer.classList.toggle('urgent', !!urgent);
  }

  setPhase(text) {
    this.phase.textContent = text;
  }

  setAlert(visible) {
    this.alert.classList.toggle('hidden', !visible);
  }

  flashNoise() {
    this.noise.classList.remove('hidden');
    clearTimeout(this.noiseTimer);
    this.noiseTimer = setTimeout(() => this.noise.classList.add('hidden'), 1200);
  }

  setMates(alive, total) {
    this.mates.textContent = `同伴存活：${alive}/${total}`;
  }

  showResult(won, desc) {
    this.hud.classList.add('hidden');
    this.crosshair.classList.add('hidden');
    this.overlay.classList.remove('hidden');
    this.overlay.innerHTML = `
      <div id="resultTitle" class="${won ? 'won' : 'lost'}">${won ? '🎉 你赢了！' : '💥 被抓住了…'}</div>
      <div id="resultDesc">${desc}</div>
      <button id="startBtn">再来一局</button>`;
    this.overlay.querySelector('#startBtn').addEventListener('click', () => location.reload());
  }
}
