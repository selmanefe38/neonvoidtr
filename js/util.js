'use strict';
// NEON VOID - web sürümü: ortak yardımcılar, çizim, ses
const W = 960, H = 720, TAU = Math.PI * 2;
const CYAN = [60, 220, 255], PINK = [255, 70, 150], GOLD = [255, 210, 70], GREEN = [90, 255, 140],
  RED = [255, 70, 70], PURPLE = [170, 100, 255], ORANGE = [255, 160, 60], WHITE = [255, 255, 255];
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const sc = (c, k) => { k = clamp(k, 0, 1); return [(c[0] * k) | 0, (c[1] * k) | 0, (c[2] * k) | 0]; };
const lc = (a, b, t) => [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0];
const css = (c, a) => (a === undefined || a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const hyp = Math.hypot;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Python ile birebir aynı sayıları üreten tohumlu üretici (mulberry32) - online dalgalar herkeste aynı olsun
class SeedRng {
  constructor(seed) { this.s = seed >>> 0; }
  random() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  randrange(n) { return Math.floor(this.random() * n); }
  choices(pop, weights, k) {
    const cum = []; let tot = 0;
    for (const w of weights) { tot += w; cum.push(tot); }
    const out = [];
    for (let n = 0; n < k; n++) {
      const r = this.random() * tot; let i = 0;
      while (cum[i] <= r) i++;
      out.push(pop[i]);
    }
    return out;
  }
}

// ---------- ışıma sprite'ları ----------
const glowCache = new Map();
function glowSprite(r, c) {
  const q = [c[0] & ~7, c[1] & ~7, c[2] & ~7];
  const key = r + '|' + q[0] + ',' + q[1] + ',' + q[2];
  let s = glowCache.get(key);
  if (!s) {
    if (glowCache.size > 700) glowCache.clear();
    s = mkCanvas(r * 2, r * 2);
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (let i = 0; i <= 10; i++) gr.addColorStop(i / 10, `rgba(${q[0]},${q[1]},${q[2]},${Math.pow(1 - i / 10, 2.2)})`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    glowCache.set(key, s);
  }
  return s;
}
function addGlow(ctx, x, y, r, c) {
  r = r | 0;
  if (r < 2 || (c[0] + c[1] + c[2]) < 24) return;
  const o = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite(r, c), x - r, y - r);
  ctx.globalCompositeOperation = o;
}

// ---------- çizim ----------
function poly(ctx, pts, x, y, fill, stroke, lw = 2, ang = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const px = pts[i][0], py = pts[i][1];
    const X = x + px * ca - py * sa, Y = y + px * sa + py * ca;
    if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = css(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = css(stroke); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function circ(ctx, x, y, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
  if (fill) { ctx.fillStyle = css(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = css(stroke); ctx.lineWidth = lw; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, c, lw = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = css(c); ctx.lineWidth = lw; ctx.stroke();
}
function rrect(ctx, x, y, w, h, fill, stroke, lw = 2, rad = 6) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = css(fill); ctx.fill(); }
  if (stroke) { ctx.strokeStyle = css(stroke); ctx.lineWidth = lw; ctx.stroke(); }
}
function arc(ctx, x, y, r, a0, a1, c, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.strokeStyle = css(c); ctx.lineWidth = lw; ctx.stroke();
}

// ---------- ses (WebAudio ile üretilir, dosya yok) ----------
class Sound {
  constructor() {
    this.ctx = null; this.sfxVol = 1; this.musicVol = 0.7; this.musicOn = true;
    this.timer = null; this.step = 0; this.next = 0; this.last = {};
  }
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const c = this.ctx = new AC();
      this.sg = c.createGain(); this.mg = c.createGain();
      this.sg.connect(c.destination); this.mg.connect(c.destination);
      this.applyVol();
      const n = (c.sampleRate * 1.3) | 0;
      this.nb = c.createBuffer(1, n, c.sampleRate);
      const d = this.nb.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { this.ctx = null; return false; }
  }
  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (this.musicOn && !this.timer) this.startMusic();
  }
  applyVol() { if (this.ctx) { this.sg.gain.value = this.sfxVol; this.mg.gain.value = this.musicVol * 0.45; } }
  setSfx(v) { this.sfxVol = clamp(v, 0, 1); this.applyVol(); }
  setMusic(v) { this.musicVol = clamp(v, 0, 1); this.applyVol(); }
  tone(f0, f1, dur, vol, type) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sg); o.start(t); o.stop(t + dur + 0.03);
  }
  noise(dur, vol, f0, f1) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nb; f.type = 'lowpass';
    f.frequency.setValueAtTime(f0 * 6, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sg); s.start(t, Math.random() * 0.2, dur + 0.02);
  }
  play(n) {
    if (!this.ctx || this.ctx.state !== 'running' || this.sfxVol <= 0) return;
    const now = performance.now();
    if (this.last[n] && now - this.last[n] < 45) return;
    this.last[n] = now;
    switch (n) {
      case 'shoot': this.tone(900, 380, 0.09, 0.07, 'square'); break;
      case 'hit': this.noise(0.07, 0.12, 300, 120); break;
      case 'boom': this.noise(0.5, 0.4, 160, 30); break;
      case 'bigboom': this.noise(1.1, 0.55, 120, 20); break;
      case 'pickup': this.tone(500, 1400, 0.25, 0.2, 'sine'); break;
      case 'hurt': this.tone(220, 60, 0.35, 0.3, 'sawtooth'); break;
      case 'bomb': this.tone(80, 600, 0.7, 0.3, 'sawtooth'); break;
      case 'wave': this.tone(300, 900, 0.5, 0.2, 'sine'); break;
      case 'boss': this.tone(90, 60, 1.2, 0.3, 'sawtooth'); break;
    }
  }
  startMusic() {
    if (!this.ensure()) return;
    this.stopMusic();
    this.next = this.ctx.currentTime + 0.1; this.step = 0;
    this.timer = setInterval(() => this.sched(), 60);
  }
  stopMusic() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this.startMusic(); else this.stopMusic();
  }
  sched() {
    const c = this.ctx;
    if (!c || c.state !== 'running') { if (c) this.next = c.currentTime + 0.1; return; }
    const chords = [[220, 261.63, 329.63, 440], [174.61, 220, 261.63, 349.23], [261.63, 329.63, 392, 523.25], [196, 246.94, 293.66, 392]];
    const pat = [0, 1, 2, 3, 2, 1, 2, 3];
    while (this.next < c.currentTime + 0.3) {
      const ch = chords[(this.step >> 3) & 3], i = this.step & 7, t = this.next;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = ch[pat[i]];
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g); g.connect(this.mg); o.start(t); o.stop(t + 0.3);
      if (i === 0) {
        const b = c.createOscillator(), bg = c.createGain();
        b.type = 'sine'; b.frequency.value = ch[0] / 2;
        bg.gain.setValueAtTime(0.001, t); bg.gain.linearRampToValueAtTime(0.7, t + 0.3);
        bg.gain.linearRampToValueAtTime(0.25, t + 0.9); bg.gain.linearRampToValueAtTime(0.001, t + 1.6);
        b.connect(bg); bg.connect(this.mg); b.start(t); b.stop(t + 1.65);
      }
      this.next += 0.2; this.step = (this.step + 1) & 31;
    }
  }
}
