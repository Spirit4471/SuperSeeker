// audio.js — 轻量 WebAudio 合成音效，无外部音频资源
export class AudioFX {
  constructor() {
    this.ctx = null;
  }

  // 必须由用户手势触发一次（浏览器自动播放限制）
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  beep(freq = 440, dur = 0.12, type = 'sine', gain = 0.15, slide = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  alert() { this.beep(660, 0.18, 'square', 0.12, 440); }
  chase() { this.beep(220, 0.3, 'sawtooth', 0.14, 220); }
  caught() { this.beep(320, 0.5, 'sawtooth', 0.18, -240); }
  disguise() { this.beep(300, 0.08, 'triangle', 0.1, -80); }
  step() { this.beep(90 + Math.random() * 30, 0.05, 'sine', 0.045); }
  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this.beep(f, 0.22, 'triangle', 0.14), i * 120));
  }
}
