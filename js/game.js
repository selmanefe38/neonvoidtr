'use strict';
// NEON VOID - web sürümü: oyun mantığı, menüler, online (WebSocket), dokunmatik/klavye/gamepad
const DEFAULT_PORT = 7777, RACE_TIME = 180;
const ONLINE_ITEMS = ['1v1 DÜELLO - ODA KUR', 'PUAN YARIŞI - ODA KUR', 'ODAYA KATIL', 'GERİ'];
const DIM = [150, 170, 220], DIM2 = [120, 140, 190];
const UI_STATES = ['menu', 'online', 'connect', 'lobby', 'server', 'settings', 'prep', 'info', 'scores'];
const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', bomb: 'KeyX' };
const RESERVED = ['Escape', 'KeyM', 'KeyG', 'KeyP', 'F11', 'Enter', 'NumpadEnter', 'Tab', 'Pause'];

function kname(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const m = { Space: 'BOŞLUK', ArrowUp: 'YUKARI OK', ArrowDown: 'AŞAĞI OK', ArrowLeft: 'SOL OK', ArrowRight: 'SAĞ OK',
    ShiftLeft: 'SOL SHIFT', ShiftRight: 'SAĞ SHIFT', ControlLeft: 'SOL CTRL', ControlRight: 'SAĞ CTRL', Enter: 'ENTER' };
  return m[code] || code.toUpperCase();
}
function splitAddr(a) {
  a = String(a || '').trim().replace(/^[a-z]+:\/\//i, '').split('/')[0];
  let host = a, port = DEFAULT_PORT;
  const i = a.lastIndexOf(':');
  if (i > 0 && /^\d+$/.test(a.slice(i + 1))) { host = a.slice(0, i); port = parseInt(a.slice(i + 1), 10); }
  return [host || '127.0.0.1', port];
}
function parseInvite(s) {
  s = String(s || '').trim();
  let m = s.match(/^neonvoid:\/\/([^\/]+)\/([A-Za-z0-9]+)/i);
  if (m) return [m[1], m[2].toUpperCase()];
  m = s.match(/^https?:\/\/([^\/?#]+)[^?#]*\?(?:[^#]*&)?room=([A-Za-z0-9]+)/i);
  if (m) return [m[1], m[2].toUpperCase()];
  return null;
}
const randRoom = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

class NetClient {
  constructor() { this.ws = null; this.inbox = []; this.connected = false; this.closed = false; }
  connect(url, room, name) {
    let ws;
    try { ws = this.ws = new WebSocket(url); } catch (e) { this.closed = true; this.inbox.push({ t: '_err', e: String(e) }); return; }
    ws.onopen = () => { this.connected = true; this.send({ t: 'join', room, name }); };
    ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m && typeof m === 'object') this.inbox.push(m); } catch (e) { /* yoksay */ } };
    ws.onerror = () => { if (!this.connected && !this.closed) { this.closed = true; this.inbox.push({ t: '_err', e: 'sunucuya ulaşılamadı' }); } };
    ws.onclose = () => { if (!this.closed) { this.closed = true; this.inbox.push({ t: '_closed' }); } };
  }
  send(o) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); } catch (e) { /* */ } }
  poll() { const o = this.inbox; this.inbox = []; return o; }
  close() { this.closed = true; try { this.ws && this.ws.close(); } catch (e) { /* */ } }
}

class Game {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    this.snd = new Sound();
    this.cfg = this.loadCfg();
    this.hi = this.cfg.hi | 0;
    this.keys = Object.assign({}, DEFAULT_KEYS, this.cfg.keys || {});
    this.bloomOn = this.cfg.bloom !== false; this.shakeOn = this.cfg.shake !== false;
    this.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    this.autofire = this.cfg.autofire !== undefined ? !!this.cfg.autofire : this.touch;
    this.snd.sfxVol = this.cfg.sfx !== undefined ? +this.cfg.sfx : 1; this.snd.musicVol = this.cfg.music !== undefined ? +this.cfg.music : 0.7;
    this.ship = (this.cfg.ship | 0) % SHIPS.length; this.diff = this.cfg.diff !== undefined ? (this.cfg.diff | 0) % 3 : 1;
    this.down = new Set(); this.hits = []; this.pointers = new Map(); this.stick = null; this.fireHeld = false; this.padPrev = {};
    this.stars = []; for (const [l, n] of [[0, 40], [1, 30], [2, 20]]) for (let i = 0; i < n; i++) this.stars.push(new Star(l));
    this.nebula = this.makeNebula(); this.vignette = this.makeVignette();
    this.tiny = mkCanvas(W / 6 | 0, H / 6 | 0); this.tctx = this.tiny.getContext('2d');
    this.state = 'menu'; this.t = 0; this.nebY = 0; this.mode = 'solo'; this.net = null;
    this.menuSel = 0; this.onlineSel = 0; this.setSel = 0; this.rebind = null; this.pauseSel = 0; this.settingsFrom = 'menu';
    this.infoPage = 0; this.infoCache = null; this.pendingMode = null; this.msg = ''; this.lobbyMsg = '';
    this.app = !!window.Capacitor;  // APK içinde sayfa 'localhost'tan gelir, sunucu adresini kullanıcı girer
    // GitHub Pages gibi statik barındırmada oyun sunucusu yoktur: adres kullanıcıdan (ya da davet linkinden) gelir
    this.noSrv = this.app || /\.(github\.io|pages\.dev|netlify\.app|vercel\.app)$/.test(location.hostname);
    this.addr = (!this.noSrv && location.protocol.startsWith('http') && location.host) ? location.host : this.cfg.addr || (this.noSrv ? '' : '127.0.0.1:' + DEFAULT_PORT);
    this.room = ''; this.field = 0; this.slot = null; this.hiMe = this.hiOpp = null; this.netPing = 0;
    this.oppName = 'RAKİP'; this.leaveArm = 0;
    this.name = String(this.cfg.name || (this.touch ? 'MOBIL' : 'WEB') + (10 + Math.floor(Math.random() * 90))).toUpperCase().slice(0, 12);
    this.reset();
    this.bindEvents();
    // davet linkiyle geldiyse doğrudan odaya gir:  ?room=ABCD
    const q = new URLSearchParams(location.search), r = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const srv = (q.get('srv') || '').trim(); if (srv) this.addr = srv.slice(0, 80);
    if (r) { this.pendingMode = 'join'; this.room = r; this.lobbyStart(); }
    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ------------------------------------------------------------- kayıt
  loadCfg() { try { return JSON.parse(localStorage.getItem('neonvoid_cfg') || '{}') || {}; } catch (e) { return {}; } }
  saveCfg() {
    Object.assign(this.cfg, { hi: this.hi, keys: this.keys, bloom: this.bloomOn, shake: this.shakeOn, autofire: this.autofire,
      sfx: this.snd.sfxVol, music: this.snd.musicVol, ship: this.ship, diff: this.diff, addr: this.addr, name: this.name });
    try { localStorage.setItem('neonvoid_cfg', JSON.stringify(this.cfg)); } catch (e) { /* */ }
  }
  makeNebula() {
    const c = mkCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#04050d'; g.fillRect(0, 0, W, H);
    const blobs = [[160, 140, 330, [40, 20, 90]], [780, 260, 360, [10, 50, 90]], [430, 520, 380, [70, 15, 70]], [860, 640, 300, [10, 40, 70]], [90, 600, 280, [20, 30, 80]]];
    for (const [x, y, r, col] of blobs) {
      for (const dy of [0, H, -H]) {
        const gr = g.createRadialGradient(x, y + dy, 0, x, y + dy, r);
        gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.55)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
    }
    return c;
  }
  makeVignette() {
    const c = mkCanvas(W, H), g = c.getContext('2d');
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return c;
  }

  reset() {
    this.player = new Player(this.ship);
    this.pbullets = []; this.ebullets = []; this.enemies = []; this.powerups = []; this.newEnemies = [];
    this.parts = []; this.rings = []; this.texts = []; this.boss = null; this.bossPending = false; this.queue = [];
    this.spawnTimer = 1.5; this.wave = 0; this.waveClearTimer = 1.2; this.score = 0; this.chain = 0; this.chainTimer = 0;
    this.shake = 0; this.flash = 0; this.banner = ['', 0, WHITE]; this.bannerSub = ''; this.bossIdx = 0;
    this.kills = this.grazeN = this.bossesK = this.maxChain = 0; this.runTime = 0; this.runSaved = false; this.rank = null;
    this.slowT = 0; this.curDiff = 1; this.overTimer = 0; this.newHi = false;
    this.rng = new SeedRng(Math.floor(Math.random() * (1 << 30)));
    this.countdown = 0; this.result = null; this.resultReason = ''; this.myFin = false; this.opp = null; this.oppFin = false;
    this.oppGone = false; this.endTimer = 0; this.raceTime = RACE_TIME; this.puTimer = 5; this.puId = 0; this.matchOn = false;
    this.netTimer = 0; this.toast = ['', 0]; this.rematchMe = this.rematchOpp = false;
  }
  start() {
    this.mode = 'solo'; this.saveCfg(); this.reset(); this.curDiff = this.diff; this.state = 'play'; this.snd.unlock();
  }

  // ------------------------------------------------------------- online
  menuItems() { return ['TEK OYUNCU', 'ONLINE', 'AYARLAR', 'NASIL OYNANIR', 'SKOR TABLOSU', 'SUNUCU AÇ']; }
  wsUrl() {
    const raw = String(this.addr || '').trim();
    const [host, port] = splitAddr(raw);
    const secure = /^(wss|https):\/\//i.test(raw);
    const hasPort = /:\d+(\/|$)/.test(raw.replace(/^[a-z]+:\/\//i, ''));
    const isIp = /^[\d.]+$/.test(host) || host === 'localhost';
    if (!this.noSrv && location.protocol.startsWith('http') && location.hostname === host && String(location.port || (location.protocol === 'https:' ? 443 : 80)) === String(port))
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/';
    // tünel (cloudflared/ngrok vb.): portsuz alan adı ya da https/wss adresi -> güvenli bağlantı
    if (secure || (!hasPort && !isIp) || (location.protocol === 'https:' && !isIp)) return `wss://${host}${hasPort && port !== 443 ? ':' + port : ''}/`;
    return `ws://${host}:${port}/`;
  }
  lobbyStart() {
    this.room = this.room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (!this.room) { this.msg = 'Oda kodu gerekli'; return; }
    this.saveCfg(); this.msg = '';
    this.net = new NetClient(); this.net.connect(this.wsUrl(), this.room, this.name);
    this.slot = null; this.hiMe = this.hiOpp = null; this.matchOn = false; this.lobbyMsg = 'Bağlanıyor...'; this.netPing = 0;
    this.state = 'lobby'; this.snd.unlock();
  }
  netFail(msg) {
    if (this.net) this.net.close();
    this.net = null; this.matchOn = false; this.mode = 'solo';
    this.state = this.pendingMode ? 'connect' : 'online'; this.msg = msg;
  }
  leaveNet() { if (this.net) this.net.close(); this.net = null; this.mode = 'solo'; this.reset(); this.state = 'online'; }
  tryBegin() {
    if (this.matchOn || !this.hiMe || !this.hiOpp || this.slot === null) return;
    const [a, b] = this.slot === 0 ? [this.hiMe, this.hiOpp] : [this.hiOpp, this.hiMe];
    const mode = a.mode || b.mode;
    if (mode !== 'duel' && mode !== 'race') { this.netFail('Odayı kuran yok: biri ODA KUR demeli'); return; }
    this.beginNetMatch(mode, parseInt(a.seed || 1, 10));
  }
  beginNetMatch(mode, seed) {
    this.reset(); this.mode = mode; this.rng = new SeedRng(seed); this.state = 'play'; this.countdown = 3; this.matchOn = true;
    if (mode === 'duel') { this.player = new Player(0); this.player.weapon = 2; this.player.bombs = 2; }
    this.snd.unlock();
  }
  oppLeft(kind) {
    if (this.matchOn) this.oppGone = true;
    else if (kind === '_closed') this.netFail('Sunucuyla bağlantı kesildi');
    else { this.hiMe = this.hiOpp = null; this.lobbyMsg = 'Rakip ayrıldı, yeni rakip bekleniyor...'; }
  }
  netMsg(m) {
    const t = m.t;
    if (t === 'joined') { this.slot = m.slot | 0; this.lobbyMsg = 'Rakip bekleniyor... (davet linkini gönder)'; }
    else if (t === 'ready') {
      if (this.matchOn) return;
      this.slot = (m.slot !== undefined ? m.slot : this.slot || 0) | 0; this.lobbyMsg = 'Rakip bulundu!';
      const mode = (this.pendingMode === 'duel' || this.pendingMode === 'race') ? this.pendingMode : null;
      this.hiMe = { mode, seed: Math.floor(Math.random() * (1 << 30)), name: this.name };
      this.net.send(Object.assign({ t: 'hi' }, this.hiMe)); this.tryBegin();
    } else if (t === 'hi') { this.hiOpp = m; this.oppName = String(m.name || 'RAKİP').slice(0, 12); this.tryBegin(); }
    else if (t === 'full') this.netFail('Oda dolu (zaten 2 kişi var)');
    else if (t === '_err') this.netFail('Bağlanılamadı: ' + String(m.e || '').slice(0, 60));
    else if (t === '_closed' || t === 'left') this.oppLeft(t);
    else if (t === 'st' && this.matchOn) {
      let o = this.opp; if (!o) o = this.opp = { x: +m.x, y: +m.y };
      o.tx = +m.x; o.ty = +m.y; o.hp = +(m.hp !== undefined ? m.hp : 100); o.sc = m.sc | 0; o.al = m.al !== false; o.sh = +(m.sh || 0);
      if (m.fin) this.oppFin = true;
    } else if (t === 'shot' && this.matchOn && this.mode === 'duel') {
      for (const b of (m.b || []).slice(0, 8)) this.ebullets.push(new Bullet(+b[0], H - +b[1], +b[2], -+b[3], false, 5, [255, 120, 80], 5));
    } else if (t === 'bombhit' && this.matchOn && this.mode === 'duel') this.hurtPlayer(20);
    else if (t === 'pu' && this.matchOn && this.mode === 'duel') this.addStaticPu(m.id | 0, +m.x, H - +m.y, String(m.k).slice(0, 1));
    else if (t === 'pt' && this.matchOn) { for (const pu of this.powerups) if (pu.id === m.id) pu.dead = true; }
    else if (t === 'rm') { this.rematchOpp = true; this.checkRematch(); }
    else if (t === 'rs' && this.matchOn) this.beginNetMatch(this.mode, m.seed | 0 || 1);
  }
  netPump(dt) {
    const n = this.net;
    for (const m of n.poll()) { try { this.netMsg(m); } catch (e) { /* kötü paket */ } if (!this.net) return; }
    if (!n.connected || n.closed) return;
    this.netPing -= dt; if (this.netPing <= 0) { this.netPing = 2; n.send({ t: 'ping' }); }
    if (this.matchOn) {
      this.netTimer -= dt;
      if (this.netTimer <= 0) {
        this.netTimer = 0.05; const p = this.player;
        n.send({ t: 'st', x: +p.x.toFixed(1), y: +p.y.toFixed(1), hp: p.hp | 0, sc: this.score, al: p.alive, sh: +p.shield.toFixed(1), wp: p.weapon, fin: this.myFin });
      }
    }
  }
  requestRematch() { if (this.rematchMe || !this.net) return; this.rematchMe = true; this.net.send({ t: 'rm' }); this.checkRematch(); }
  checkRematch() {
    if (this.rematchMe && this.rematchOpp && this.slot === 0 && this.net) {
      const seed = Math.floor(Math.random() * (1 << 30)); this.net.send({ t: 'rs', seed }); this.beginNetMatch(this.mode, seed);
    }
  }
  finish(res, reason = '') { this.result = res; this.resultReason = reason; this.snd.play(res === 'win' ? 'wave' : 'boss'); this.flash = 0.3; }
  netCheckEnd(dt) {
    if (!this.matchOn || this.result !== null || this.countdown > 0) return;
    const p = this.player, o = this.opp;
    if (this.mode === 'duel') {
      const meDead = !p.alive, oppDead = !!o && o.al === false;
      if (this.oppGone && !meDead) { this.finish('win', 'Rakip oyundan ayrıldı'); return; }
      if (meDead || oppDead) {
        this.endTimer += dt;
        if (this.endTimer > 0.5) {
          if (meDead && oppDead) this.finish('draw', 'İkiniz de düştünüz');
          else if (meDead) this.finish('lose', 'Gemin yok edildi');
          else this.finish('win', 'Rakibin gemisini yok ettin');
        }
      }
    } else {
      if (!this.myFin && (!p.alive || this.raceTime <= 0)) { this.myFin = true; this.pbullets = []; if (p.alive) p.inv = 999; }
      if (this.oppGone) this.oppFin = true;
      if (this.myFin && this.oppFin) {
        const osc = o ? o.sc | 0 : 0, reason = `${this.score}  -  ${osc}`;
        this.finish(this.score > osc ? 'win' : this.score < osc ? 'lose' : 'draw', reason);
      }
    }
  }
  addStaticPu(id, x, y, kind) { const pu = new PowerUp(x, y, kind); pu.id = id; pu.static = true; this.powerups.push(pu); }
  duelLogic(dt) {
    if (this.slot !== 0 || !this.net) return;
    this.puTimer -= dt;
    if (this.puTimer <= 0) {
      this.puTimer = rnd(7, 11); this.puId++;
      const kind = this.weighted('SHWB', [25, 35, 25, 15]), x = rnd(140, W - 140), y = rnd(250, H - 250);
      this.addStaticPu(this.puId, x, y, kind);
      this.net.send({ t: 'pu', id: this.puId, x: +x.toFixed(1), y: +y.toFixed(1), k: kind });
    }
  }
  weighted(s, w) { let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0; while (r >= w[i]) { r -= w[i]; i++; } return s[i]; }

  // ------------------------------------------------------------- yardımcı olaylar
  get mult() { return Math.min(8, 1 + Math.floor(this.chain / 4)); }
  get spd() { return (1 + Math.min(0.35, this.wave * 0.004)) * DIFFS[this.curDiff][2]; }
  bulletDmg() { return this.mode === 'duel' ? 5 : Math.max(1, Math.round(10 * DIFFS[this.curDiff][1])); }
  enemyShot(x, y, ang, speed, color = PINK, r = 6) {
    speed *= this.spd; this.ebullets.push(new Bullet(x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, false, 1, color, r));
  }
  mine(x, y) { const b = new Bullet(x, y, 0, 70, false, 1, [200, 255, 90], 9); b.fuse = 2.4; this.ebullets.push(b); }
  mineBurst(b) {
    this.explode(b.x, b.y, b.color, 10, 160, 3); const off = Math.random();
    for (let i = 0; i < 10; i++) this.enemyShot(b.x, b.y, off + i * TAU / 10, 190, b.color);
  }
  spawnEnemy(kind, x, y) { this.newEnemies.push(new Enemy(kind, x, y, this.wave)); }
  damageEnemy(e, dmg) { e.flash = 0.06; if (e.shield > 0) { e.shield -= dmg; return; } e.hp -= dmg; }
  explode(x, y, color, n = 26, speed = 260, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), s = rnd(0.15, 1) * speed, c = pick([color, WHITE, lc(color, WHITE, 0.5)]);
      this.parts.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.35, 0.9), c, rnd(2, size)));
    }
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    this.rings.push([x, y, 6, 60 + n * 1.5, 0.45, 0.45, color]);
  }
  popup(x, y, msg, color = WHITE) { this.texts.push([x, y, msg, 1, color]); }
  addScore(base, x, y) {
    const pts = Math.floor(base * this.mult * DIFFS[this.curDiff][4]); this.score += pts;
    this.popup(x, y - 10, '+' + pts, this.mult > 1 ? GOLD : WHITE);
  }
  drop(x, y, force = false) {
    if (force || Math.random() < 0.13) this.powerups.push(new PowerUp(x, y, this.weighted('WSHBDT', [30, 22, 26, 12, 10, 10])));
  }
  killEnemy(e) {
    e.dead = true; this.chain++; this.chainTimer = 2.6; this.kills++; this.maxChain = Math.max(this.maxChain, this.chain);
    const big = e.r >= 24;
    this.explode(e.x, e.y, e.color, big ? 44 : e.kind === 'swarm' ? 12 : 24, 280);
    this.snd.play('boom'); this.shake = Math.max(this.shake, big ? 9 : e.kind === 'swarm' ? 2 : 4);
    this.addScore(e.score, e.x, e.y);
    if (e.kind === 'splitter') for (const dx of [-26, 0, 26]) this.spawnEnemy('swarm', e.x + dx, e.y);
    if (e.kind !== 'swarm') this.drop(e.x, e.y, e.maxhp >= 9 && Math.random() < 0.5);
  }
  hurtPlayer(dmg) {
    const p = this.player;
    if (!p.alive || p.inv > 0) return false;
    if (p.shield > 0) { this.shake = Math.max(this.shake, 3); return true; }
    p.hp -= dmg; p.inv = this.mode === 'duel' ? 0.12 : 0.8; this.chain = 0; this.shake = Math.max(this.shake, 14); this.flash = 0.25;
    this.snd.play('hurt'); this.explode(p.x, p.y, CYAN, 16, 200); this.vibrate(60);
    if (p.hp <= 0) {
      p.alive = false; this.explode(p.x, p.y, CYAN, 90, 420, 6); this.explode(p.x, p.y, ORANGE, 60, 300, 5);
      this.snd.play('bigboom'); this.shake = 30; this.overTimer = 2; this.vibrate(300);
    }
    return true;
  }
  vibrate(ms) { try { if (this.touch && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ } }
  useBomb() {
    const p = this.player;
    if (!p.alive || p.bombs <= 0 || this.myFin || this.countdown > 0 || this.result !== null || this.state !== 'play') return;
    p.bombs--; this.snd.play('bomb'); this.shake = 24; this.flash = 0.5;
    for (let i = 0; i < 3; i++) this.rings.push([p.x, p.y, 10, 900, 0.8 + i * 0.12, 0.8 + i * 0.12, [CYAN, WHITE, PINK][i]]);
    for (const b of this.ebullets) { this.explode(b.x, b.y, b.color, 3, 120, 3); this.score += 5; }
    this.ebullets = [];
    for (const e of this.enemies) { e.shield = 0; e.hp -= 20; e.flash = 0.15; if (e.hp <= 0 && !e.dead) this.killEnemy(e); }
    if (this.boss) { this.boss.hp -= 70; this.boss.flash = 0.2; if (this.boss.hp <= 0) this.killBoss(); }
    if (this.mode === 'duel' && this.net) this.net.send({ t: 'bombhit' });
  }
  fire() {
    const p = this.player;
    const shots = { 1: [[0, 0]], 2: [[-9, 0], [9, 0]], 3: [[0, 0], [-14, -9], [14, 9]], 4: [[-8, 0], [8, 0], [-18, -13], [18, 13]],
      5: [[0, 0], [-11, 0], [11, 0], [-21, -15], [21, 15]] }[p.weapon];
    const sent = [];
    for (const [xo, deg] of shots) {
      const a = deg * Math.PI / 180, vx = Math.sin(a) * 760, vy = -Math.cos(a) * 760;
      this.pbullets.push(new Bullet(p.x + xo, p.y - 22, vx, vy, true, 1, p.weapon < 5 ? CYAN : [150, 255, 255], 4));
      sent.push([+(p.x + xo).toFixed(1), +(p.y - 22).toFixed(1), +vx.toFixed(1), +vy.toFixed(1)]);
    }
    if (this.mode === 'duel' && this.net) this.net.send({ t: 'shot', b: sent });
    p.cool = (0.19 - 0.012 * p.weapon) * p.coolMult; this.snd.play('shoot');
  }

  // ------------------------------------------------------------- dalga sistemi
  startWave() {
    this.wave++; const w = this.wave; this.snd.play('wave'); this.bannerSub = '';
    if (w % 5 === 0) {
      this.bossIdx = (Math.floor(w / 5) - 1) % 7; this.bossPending = true;
      this.banner = [`! UYARI !  ${BOSS_NAMES[this.bossIdx]}`, 3.2, RED]; this.snd.play('boss'); this.spawnTimer = 2.5;
    } else {
      const kinds = [], wts = [];
      for (const k of Object.keys(ENEMY_UNLOCK)) if (w >= ENEMY_UNLOCK[k][0]) { kinds.push(k); wts.push(ENEMY_UNLOCK[k][1]); }
      const n = Math.min(5 + w * 2, 44);
      this.queue = this.rng.choices(kinds, wts, n);
      const nw = Object.keys(ENEMY_UNLOCK).filter((k) => ENEMY_UNLOCK[k][0] === w);
      for (const nk of nw) for (let i = 0; i < 2; i++) this.queue[this.rng.randrange(this.queue.length)] = nk;
      this.banner = [`DALGA ${w}`, nw.length ? 3.4 : 2.2, CYAN];
      if (nw.length) this.bannerSub = 'YENİ DÜŞMAN: ' + nw.map((k) => ENEMY_NAMES[k]).join(', ');
      this.spawnTimer = 1.8;
    }
  }
  spawnLogic(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.bossPending) { this.boss = new Boss(this.wave, this.bossIdx); this.bossPending = false; this.spawnTimer = 99; }
      else if (this.queue.length) {
        const kind = this.queue.shift(), x = this.rng.uniform(70, W - 70);
        if (kind === 'swarm') for (const dx of [-60, -30, 0, 30, 60]) this.spawnEnemy('swarm', clamp(x + dx, 20, W - 20), -40 - Math.abs(dx) * 0.6);
        else this.enemies.push(new Enemy(kind, x, -40, this.wave));
        this.spawnTimer = Math.max(0.3, 1 - this.wave * 0.02);
      }
    }
    if (!this.queue.length && !this.enemies.length && !this.newEnemies.length && !this.boss && !this.bossPending) {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer <= 0) {
        this.waveClearTimer = 1.6; this.player.hp = Math.min(this.player.maxhp, this.player.hp + DIFFS[this.curDiff][3]); this.startWave();
      }
    }
  }
  killBoss() {
    const bs = this.boss; this.boss = null;
    for (let i = 0; i < 6; i++) this.explode(bs.x + rnd(-50, 50), bs.y + rnd(-50, 50), pick([CYAN, ORANGE, PINK, GOLD]), 50, 380, 6);
    this.snd.play('bigboom'); this.shake = 34; this.flash = 0.7;
    const bonus = 5000 * Math.floor(this.wave / 5); this.score += bonus; this.popup(bs.x, bs.y, '+' + bonus, GOLD);
    this.ebullets = []; this.bossesK++;
    'WSHBDT'.split('').forEach((kind, k) => this.powerups.push(new PowerUp(bs.x + (k - 2.5) * 40, bs.y, kind)));
    this.banner = ['BOSS YOK EDİLDİ!', 2.5, GOLD]; this.bannerSub = bs.name;
  }
  collect(pu) {
    const p = this.player; this.snd.play('pickup'); this.explode(pu.x, pu.y, PU_TYPES[pu.kind][0], 16, 160);
    switch (pu.kind) {
      case 'W': if (p.weapon < 5) { p.weapon++; this.popup(pu.x, pu.y, 'SİLAH YÜKSELDİ!', GOLD); } else { this.score += 500; this.popup(pu.x, pu.y, '+500', GOLD); } break;
      case 'S': p.shield = 8; this.popup(pu.x, pu.y, 'KALKAN', CYAN); break;
      case 'H': p.hp = Math.min(p.maxhp, p.hp + 35); this.popup(pu.x, pu.y, 'CAN +35', GREEN); break;
      case 'B': p.bombs = Math.min(5, p.bombs + 1); this.popup(pu.x, pu.y, 'BOMBA +1', RED); break;
      case 'D': p.droneT = 18; this.popup(pu.x, pu.y, 'YARDIMCI DRON', [190, 140, 255]); break;
      case 'T': this.slowT = 6; this.popup(pu.x, pu.y, 'ZAMAN YAVAŞLADI', [255, 255, 150]); break;
    }
  }
  endRun() {
    if (this.mode !== 'solo' || this.runSaved || this.score <= 0) return;
    this.runSaved = true;
    if (this.score > this.hi) { this.hi = this.score; this.newHi = true; }
    const entry = { s: this.score, w: this.wave, sh: this.player.ship, d: this.curDiff, n: this.name };
    const board = (this.cfg.scores || []).filter((r) => r && typeof r === 'object'); board.push(entry);
    board.sort((a, b) => b.s - a.s);
    const pos = board.indexOf(entry); this.rank = pos < 8 ? pos + 1 : null; this.cfg.scores = board.slice(0, 8); this.saveCfg();
  }

  // ------------------------------------------------------------- girdi
  keyHeld(a) { return this.down.has(this.keys[a]); }
  readMove() {
    let ax = 0, ay = 0;
    if (this.keyHeld('left') || this.down.has('ArrowLeft')) ax -= 1;
    if (this.keyHeld('right') || this.down.has('ArrowRight')) ax += 1;
    if (this.keyHeld('up') || this.down.has('ArrowUp')) ay -= 1;
    if (this.keyHeld('down') || this.down.has('ArrowDown')) ay += 1;
    if (this.stick) { ax += clamp(this.stick.dx / 55, -1, 1); ay += clamp(this.stick.dy / 55, -1, 1); }
    const pd = this.pad();
    if (pd) { ax += pd.ax; ay += pd.ay; }
    return [ax, ay];
  }
  pad() {
    let gp = null;
    try { for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) if (g && g.connected) { gp = g; break; } } catch (e) { return null; }
    if (!gp) return null;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.abs(ax) < 0.25) ax = 0; if (Math.abs(ay) < 0.25) ay = 0;
    if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
    return { ax, ay, fire: b(0) || b(7), bomb: b(1) || b(2), start: b(9), ok: b(0), back: b(1), up: ay < -0.5, down: ay > 0.5, left: ax < -0.5, right: ax > 0.5 };
  }
  padEvents() {
    const pd = this.pad(); if (!pd) return;
    const prev = this.padPrev; this.padPrev = pd;
    const edge = (k) => pd[k] && !prev[k];
    if (this.state === 'play') {
      if (edge('bomb')) this.useBomb();
      if (edge('start')) { this.state = 'pause'; this.pauseSel = 0; }
      return;
    }
    if (this.state === 'connect' || this.rebind) return;
    for (const [k, a] of [['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right'], ['ok', 'ok'], ['back', 'back'], ['start', 'ok']]) if (edge(k)) this.onAction(a);
  }
  bindEvents() {
    const cv = this.cv;
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.stick = null; this.fireHeld = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play' && this.mode === 'solo') { this.state = 'pause'; this.pauseSel = 0; } });
    window.addEventListener('paste', (e) => { if (this.state === 'connect') { this.pasteText((e.clipboardData || window.clipboardData).getData('text')); e.preventDefault(); } });
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      if (e.pointerType === 'touch') this.touch = true;
      this.snd.unlock(); const [x, y] = pos(e);
      let hit = null;
      for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { hit = h; break; } }
      if (hit) {
        if (hit.hold) { this.pointers.set(e.pointerId, { hold: hit.hold }); if (hit.hold === 'fire') this.fireHeld = true; }
        else hit.fn(x, y);
      } else if (this.state === 'play' && this.countdown <= 0) this.pointers.set(e.pointerId, { stick: true, x0: x, y0: y });
      if (this.pointers.get(e.pointerId) && this.pointers.get(e.pointerId).stick) this.stick = { dx: 0, dy: 0, id: e.pointerId, x0: x, y0: y, x, y };
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e); this.mouse = [x, y];
      if (this.stick && this.stick.id === e.pointerId) { this.stick.dx = x - this.stick.x0; this.stick.dy = y - this.stick.y0; this.stick.x = x; this.stick.y = y; }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p && p.hold === 'fire') this.fireHeld = false;
      if (this.stick && this.stick.id === e.pointerId) this.stick = null;
      this.pointers.delete(e.pointerId);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  hit(x, y, w, h, fn, hold) { this.hits.push({ x, y, w, h, fn, hold }); }
  pasteText(s) {
    const inv = parseInvite(s);
    if (inv) { this.addr = inv[0]; this.room = inv[1]; return; }
    s = String(s || '').trim();
    if (this.field === 0) this.addr = s.slice(0, 60); else if (this.field === 1) this.room = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); else this.name = s.toUpperCase().slice(0, 12);
  }
  fullscreen() {
    try {
      const el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else { (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen && el.webkitRequestFullscreen()); try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* */ } }
    } catch (e) { /* */ }
  }
  toggleBloom() { this.bloomOn = !this.bloomOn; this.saveCfg(); }

  onKey(e) {
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
    this.snd.unlock();
    const first = !this.down.has(c); this.down.add(c);
    if (!first) return;
    if (this.state === 'connect') { this.connectKey(e); return; }
    if (this.rebind) {
      if (c === 'Escape') { this.rebind = null; return; }
      if (RESERVED.includes(c)) { this.toast = ['Bu tuş sisteme ayrılmış, başka bir tuş seç', 2.5]; return; }
      for (const a of Object.keys(this.keys)) if (a !== this.rebind && this.keys[a] === c) this.keys[a] = this.keys[this.rebind];
      this.keys[this.rebind] = c; this.rebind = null; this.saveCfg(); return;
    }
    if (c === 'KeyM') { this.snd.toggleMusic(); return; }
    if (c === 'KeyG') { this.toggleBloom(); return; }
    if (c === 'F11') { e.preventDefault(); this.fullscreen(); return; }
    if (this.state === 'play') {
      if (c === this.keys.bomb) this.useBomb();
      else if (c === 'KeyP' || c === 'Escape' || c === 'Pause') { this.state = 'pause'; this.pauseSel = 0; }
      return;
    }
    const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back' };
    if (this.state === 'pause' && (c === 'KeyP' || c === 'Pause')) { this.state = 'play'; return; }
    if (this.state === 'lobby') {
      if (c === 'KeyC') this.copyInvite('py'); else if (c === 'KeyW') this.copyInvite('web'); else if (c === 'KeyL') this.copyInvite('py', true);
      else if (c === 'KeyS') this.openSteam(); else if (c === 'Escape') this.leaveNet();
      return;
    }
    if (this.state === 'server' && c === 'KeyK') return;
    if (map[c]) this.onAction(map[c]);
  }
  connectKey(e) {
    const c = e.code, k = e.key;
    if (c === 'Escape') { this.state = 'online'; return; }
    if (c === 'Tab') { this.field = (this.field + (e.shiftKey ? 2 : 1)) % 3; return; }
    if (c === 'Enter' || c === 'NumpadEnter') { this.lobbyStart(); return; }
    if (c === 'Backspace') { this.editField((s) => s.slice(0, -1)); return; }
    if (e.ctrlKey || e.metaKey) {
      if (c === 'KeyV' && navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => this.pasteText(t)).catch(() => {});
      return;
    }
    if (k.length === 1) this.editField((s) => s + k);
  }
  editField(f) {
    if (this.field === 0) this.addr = f(this.addr).slice(0, 60);
    else if (this.field === 1) this.room = f(this.room).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    else this.name = f(this.name).toUpperCase().slice(0, 12);
  }
  setField(i) {
    this.field = i;
    const labels = ['Sunucu adresi (ip:port)', 'Oda kodu', 'Oyuncu adı'];
    const cur = [this.addr, this.room, this.name][i];
    let v = null; try { v = window.prompt(labels[i], cur); } catch (e) { /* */ }
    if (v !== null && v !== undefined) { const keep = this.field; this.field = i; this.pasteText(v); this.field = keep; }
  }

  inviteList() {
    const [host, port] = splitAddr(this.addr);
    const own = !this.noSrv && location.protocol.startsWith('http');
    const hp = own ? location.host : `${host}:${port}`;
    let web;
    if (own) web = `${location.origin}/?room=${this.room}`;
    else if (location.protocol.startsWith('http') && !this.app) web = `${location.origin}${location.pathname}?room=${this.room}&srv=${encodeURIComponent(this.addr)}`;
    else web = `http://${hp}/?room=${this.room}`;
    return [
      { label: 'Web / Android (tarayıcıdan aç)', uri: web, kind: 'web' },
      { label: 'Python / Windows oyunu', uri: `neonvoid://${hp}/${this.room}`, kind: 'py' },
    ];
  }
  copyInvite(kind) {
    const inv = this.inviteList().find((i) => i.kind === kind) || this.inviteList()[0];
    const done = (ok) => { this.toast = [ok ? 'Link kopyalandı: Steam sohbetine yapıştır' : 'Kopyalanamadı: ' + inv.uri, 3.5]; };
    try { navigator.clipboard.writeText(inv.uri).then(() => done(true), () => done(false)); } catch (e) { done(false); }
  }
  shareInvite() {
    const inv = this.inviteList()[0];
    if (navigator.share) navigator.share({ title: 'NEON VOID', text: 'Benimle NEON VOID oyna!', url: inv.uri }).catch(() => {});
    else this.copyInvite('web');
  }
  openSteam() { try { window.open('steam://open/friends', '_self'); this.toast = ['Steam açılıyor: davet linkini sohbete yapıştır', 3.5]; } catch (e) { this.toast = ['Steam açılamadı', 3]; } }

  // menü eylemleri (klavye, gamepad ve dokunma hepsi buradan geçer)
  onAction(a) {
    const st = this.state, wrap = (v, n, d) => (v + d + n) % n;
    if (st === 'menu') {
      if (a === 'up') this.menuSel = wrap(this.menuSel, 6, -1); else if (a === 'down') this.menuSel = wrap(this.menuSel, 6, 1);
      else if (a === 'ok') this.menuGo(this.menuSel);
    } else if (st === 'online') {
      if (a === 'up') this.onlineSel = wrap(this.onlineSel, 4, -1); else if (a === 'down') this.onlineSel = wrap(this.onlineSel, 4, 1);
      else if (a === 'back') this.state = 'menu'; else if (a === 'ok') this.onlineGo(this.onlineSel);
    } else if (st === 'prep') {
      if (a === 'left') this.ship = wrap(this.ship, SHIPS.length, -1); else if (a === 'right') this.ship = wrap(this.ship, SHIPS.length, 1);
      else if (a === 'up') this.diff = wrap(this.diff, 3, -1); else if (a === 'down') this.diff = wrap(this.diff, 3, 1);
      else if (a === 'ok') this.start(); else if (a === 'back') this.state = 'menu';
    } else if (st === 'info') {
      if (a === 'left') this.infoPage = wrap(this.infoPage, 3, -1); else if (a === 'right') this.infoPage = wrap(this.infoPage, 3, 1);
      else if (a === 'back' || a === 'ok') this.state = 'menu';
    } else if (st === 'scores' || st === 'server') { if (a === 'back' || a === 'ok') this.state = 'menu'; }
    else if (st === 'lobby') { if (a === 'back') this.leaveNet(); }
    else if (st === 'settings') this.settingsAction(a);
    else if (st === 'pause') {
      if (a === 'up') this.pauseSel = wrap(this.pauseSel, 3, -1); else if (a === 'down') this.pauseSel = wrap(this.pauseSel, 3, 1);
      else if (a === 'back') this.state = 'play'; else if (a === 'ok') this.pauseGo(this.pauseSel);
    } else if (st === 'over') {
      if (this.mode === 'solo') { if (a === 'ok') this.start(); else if (a === 'back') this.toMenu(); }
    }
    if (this.matchOn && this.result !== null) { if (a === 'ok') this.requestRematch(); else if (a === 'back') this.leaveNet(); }
  }
  toMenu() { this.reset(); this.state = 'menu'; }
  menuGo(i) {
    this.menuSel = i;
    if (i === 0) this.state = 'prep';
    else if (i === 1) { this.state = 'online'; this.onlineSel = 0; }
    else if (i === 2) { this.state = 'settings'; this.settingsFrom = 'menu'; this.setSel = 0; this.rebind = null; }
    else if (i === 3) { this.state = 'info'; this.infoPage = 0; }
    else if (i === 4) this.state = 'scores';
    else this.state = 'server';
  }
  onlineGo(i) {
    this.onlineSel = i;
    if (i === 3) { this.state = 'menu'; return; }
    this.pendingMode = ['duel', 'race', 'join'][i]; this.room = i < 2 ? randRoom() : ''; this.field = i < 2 ? 0 : 1; this.msg = ''; this.state = 'connect';
  }
  pauseGo(i) {
    this.pauseSel = i;
    if (i === 0) this.state = 'play';
    else if (i === 1) { this.state = 'settings'; this.settingsFrom = 'pause'; this.setSel = 0; this.rebind = null; }
    else { if (this.matchOn) { this.leaveNet(); return; } this.endRun(); this.reset(); this.state = 'menu'; }
  }
  settingsRows() {
    return [['sfx', 'SES EFEKTLERİ'], ['music', 'MÜZİK'], ['bloom', 'IŞIMA EFEKTİ'], ['shake', 'EKRAN SARSINTISI'], ['autofire', 'OTOMATİK ATEŞ (DOKUNMATİK)'],
      ['fire', 'ATEŞ TUŞU'], ['bomb', 'BOMBA TUŞU'], ['up', 'YUKARI'], ['down', 'AŞAĞI'], ['left', 'SOL'], ['right', 'SAĞ'],
      ['reset', 'VARSAYILANLARA DÖN'], ['back', 'GERİ']];
  }
  changeVol(key, d) {
    if (key === 'sfx') { this.snd.setSfx(Math.round((this.snd.sfxVol + d) * 100) / 100); this.snd.play('pickup'); }
    else this.snd.setMusic(Math.round((this.snd.musicVol + d) * 100) / 100);
    this.saveCfg();
  }
  settingsAction(a, rowIdx) {
    const rows = this.settingsRows(); if (rowIdx !== undefined) this.setSel = rowIdx;
    const key = rows[this.setSel][0];
    if (a === 'up') this.setSel = (this.setSel + rows.length - 1) % rows.length;
    else if (a === 'down') this.setSel = (this.setSel + 1) % rows.length;
    else if (a === 'back') this.leaveSettings();
    else if (a === 'left' || a === 'right') {
      const d = a === 'left' ? -0.1 : 0.1;
      if (key === 'sfx' || key === 'music') this.changeVol(key, d);
      else if (key === 'bloom') this.toggleBloom(); else if (key === 'shake') { this.shakeOn = !this.shakeOn; this.saveCfg(); }
      else if (key === 'autofire') { this.autofire = !this.autofire; this.saveCfg(); }
    } else if (a === 'ok') {
      if (key === 'bloom') this.toggleBloom();
      else if (key === 'shake') { this.shakeOn = !this.shakeOn; this.saveCfg(); }
      else if (key === 'autofire') { this.autofire = !this.autofire; this.saveCfg(); }
      else if (key === 'reset') {
        this.keys = Object.assign({}, DEFAULT_KEYS); this.snd.setSfx(1); this.snd.setMusic(0.7); this.bloomOn = true; this.shakeOn = true;
        this.saveCfg(); this.toast = ['Varsayılan ayarlar yüklendi', 2];
      } else if (key === 'back') this.leaveSettings();
      else if (this.keys[key] !== undefined) this.rebind = key;
    }
  }
  leaveSettings() { this.rebind = null; this.state = this.settingsFrom || 'menu'; this.settingsFrom = 'menu'; this.saveCfg(); }

  // ------------------------------------------------------------- güncelleme
  frame(ts) {
    const dt = Math.min(0.05, Math.max(0.001, (ts - this.last) / 1000)); this.last = ts;
    try { this.update(dt); this.draw(); } catch (e) { console.error(e); window.__nvErr = (window.__nvErr || []).concat(String(e && e.stack || e)); }
    requestAnimationFrame((t) => this.frame(t));
  }
  update(dt) {
    this.t += dt; this.toast[1] = Math.max(0, this.toast[1] - dt);
    this.padEvents();
    let boost = 1;
    if (this.state === 'play') boost = 1 + ((this.player.alive && (this.keyHeld('up') || this.down.has('ArrowUp'))) ? 0.6 : 0);
    for (const s of this.stars) s.update(dt, boost);
    this.nebY = (this.nebY + 18 * dt) % H;
    if (this.net) this.netPump(dt);
    if (this.state !== 'play' && this.state !== 'over') return;
    if (this.countdown > 0) { this.countdown -= dt; return; }
    const o = this.opp;
    if (o && o.tx !== undefined) { const k = Math.min(1, dt * 18); o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; }
    if (this.mode === 'race' && !this.myFin) this.raceTime -= dt;
    const p = this.player;
    if (p.alive && !this.myFin) {
      this.runTime += dt;
      const [ax, ay] = this.readMove(); p.update(dt, ax, ay);
      const pd = this.pad();
      const wantFire = this.down.has(this.keys.fire) || this.fireHeld || (pd && pd.fire) || (this.autofire && this.stick) || (this.autofire && this.touch && this.state === 'play' && this.pointers.size > 0);
      if (wantFire && p.cool <= 0 && this.state === 'play') this.fire();
      if (Math.random() < 0.7) this.parts.push(new Particle(p.x + rnd(-4, 4), p.y + 22, rnd(-25, 25), rnd(90, 190), 0.35, [255, 160, 60], 3, 0.5));
    }
    if (p.alive && !this.myFin && p.droneT > 0) {
      p.droneT -= dt; p.dcool -= dt;
      if (p.dcool <= 0) { p.dcool = 0.32; for (const sx of [-1, 1]) this.pbullets.push(new Bullet(p.x + sx * 40, p.y - 4, 0, -700, true, 1, [190, 140, 255], 3)); }
    }
    if (this.mode === 'duel') this.duelLogic(dt); else this.spawnLogic(dt);
    this.chainTimer -= dt; if (this.chainTimer <= 0) this.chain = 0;
    const edt = this.slowT > 0 ? dt * 0.55 : dt; this.slowT = Math.max(0, this.slowT - dt);
    for (const b of this.pbullets) b.update(dt);
    for (const b of this.ebullets) b.update(edt);
    for (const e of this.enemies) e.update(this, edt);
    if (this.boss) this.boss.update(this, edt);
    if (this.newEnemies.length) { this.enemies.push(...this.newEnemies); this.newEnemies = []; }
    for (const b of this.ebullets) if (b.fuse !== null && !b.dead) { b.fuse -= edt; if (b.fuse <= 0) { b.dead = true; this.mineBurst(b); } }
    for (const pu of this.powerups) pu.update(dt, p);
    for (const pt of this.parts) pt.update(dt);

    for (const b of this.pbullets) {
      if (b.dead) continue;
      let hitE = false;
      for (const e of this.enemies) {
        if (!e.dead && !e.intang && hyp(b.x - e.x, b.y - e.y) < e.r + 5) {
          b.dead = true; this.damageEnemy(e, b.dmg); this.snd.play('hit');
          this.parts.push(new Particle(b.x, b.y, rnd(-90, 90), rnd(-90, 90), 0.25, WHITE, 3));
          if (e.hp <= 0) this.killEnemy(e);
          hitE = true; break;
        }
      }
      if (!hitE) {
        const bs = this.boss;
        if (bs && !bs.entering && !bs.intang && hyp(b.x - bs.x, b.y - bs.y) < bs.r + 6) {
          b.dead = true; bs.hp -= b.dmg; bs.flash = 0.05; this.score += 2;
          this.parts.push(new Particle(b.x, b.y, rnd(-120, 120), rnd(-120, 60), 0.3, WHITE, 3));
          if (bs.hp <= 0) this.killBoss();
        }
      }
    }
    if (this.mode === 'duel' && this.opp && this.opp.al) {
      const ox = this.opp.x, oy = H - this.opp.y;
      for (const b of this.pbullets) if (!b.dead && hyp(b.x - ox, b.y - oy) < 22) {
        b.dead = true; for (let i = 0; i < 4; i++) this.parts.push(new Particle(b.x, b.y, rnd(-140, 140), rnd(-140, 140), 0.3, PINK, 3));
      }
    }
    if (p.alive && !this.myFin) {
      for (const b of this.ebullets) {
        if (b.dead) continue;
        const d = hyp(b.x - p.x, b.y - p.y);
        if (d < p.r + b.r - 1) { if (this.hurtPlayer(this.bulletDmg())) b.dead = true; }
        else if (!b.grazed && b.fuse === null && d < p.r + b.r + 15 && this.mode !== 'duel') {
          b.grazed = true; this.grazeN++; this.score += 10;
          if (this.chain > 0) this.chainTimer = Math.min(2.6, this.chainTimer + 0.25);
          this.parts.push(new Particle((b.x + p.x) / 2, (b.y + p.y) / 2, rnd(-60, 60), rnd(-60, 60), 0.25, GOLD, 3));
        }
      }
      for (const e of this.enemies) {
        if (!e.dead && !e.intang && hyp(e.x - p.x, e.y - p.y) < e.r + p.r) {
          if (this.hurtPlayer(25)) { if (e.maxhp >= 6) { e.hp -= 5; if (e.hp <= 0) this.killEnemy(e); } else this.killEnemy(e); }
        }
      }
      if (this.boss && !this.boss.entering && !this.boss.intang && hyp(this.boss.x - p.x, this.boss.y - p.y) < this.boss.r + p.r - 8) this.hurtPlayer(30);
      for (const pu of this.powerups) {
        if (!pu.dead && hyp(pu.x - p.x, pu.y - p.y) < pu.r + p.r + 6) {
          pu.dead = true; this.collect(pu);
          if (this.mode === 'duel' && this.net && pu.id !== null) this.net.send({ t: 'pt', id: pu.id });
        }
      }
    }
    this.pbullets = this.pbullets.filter((b) => !b.dead); this.ebullets = this.ebullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead); this.powerups = this.powerups.filter((x) => !x.dead);
    this.parts = this.parts.filter((x) => x.life > 0);
    for (const r of this.rings) r[4] -= dt; this.rings = this.rings.filter((r) => r[4] > 0);
    for (const t of this.texts) { t[1] -= 40 * dt; t[3] -= dt; } this.texts = this.texts.filter((t) => t[3] > 0);
    this.shake = Math.max(0, this.shake - dt * 40); this.flash = Math.max(0, this.flash - dt);
    this.banner[1] = Math.max(0, this.banner[1] - dt);
    if (this.mode === 'solo') {
      if (!p.alive && this.state === 'play') { this.overTimer -= dt; if (this.overTimer <= 0) { this.state = 'over'; this.endRun(); } }
    } else this.netCheckEnd(dt);
  }

  // ------------------------------------------------------------- çizim
  text(msg, size, color, x, y, anchor = 'center', glow = true, maxW = W - 12) {
    const c = this.ctx; size = Math.round(size * 0.92);
    c.font = `600 ${size}px ${FONT}`;
    let w = c.measureText(msg).width;
    if (w > maxW) { size = Math.max(10, Math.floor(size * maxW / w)); c.font = `600 ${size}px ${FONT}`; }
    const al = anchor.includes('left') ? 'left' : anchor.includes('right') ? 'right' : 'center';
    const bl = anchor.startsWith('top') ? 'top' : anchor.startsWith('bottom') ? 'bottom' : 'middle';
    c.textAlign = al; c.textBaseline = bl;
    c.fillStyle = 'rgba(0,0,0,0.8)'; c.fillText(msg, x + 2, y + 2);
    if (glow) { c.shadowColor = css(color); c.shadowBlur = 14; }
    c.fillStyle = css(color); c.fillText(msg, x, y); c.shadowBlur = 0;
  }
  bar(x, y, w, h, fill, rad = 3, stroke) { rrect(this.ctx, x, y, w, h, fill, stroke || null, 1, rad); }
  drawItems(items, sel, y0, gap, onPick) {
    items.forEach((label, i) => {
      const y = y0 + i * gap;
      if (i === sel) this.text(`> ${label} <`, 46, WHITE, W / 2, y); else this.text(label, 38, [110, 130, 185], W / 2, y, 'center', false);
      this.hit(W / 2 - 300, y - gap / 2 + 2, 600, gap - 4, () => onPick(i));
    });
  }
  backButton(fn) {
    this.text('◀ GERİ', 24, [150, 200, 255], 18, H - 24, 'midleft', false);
    this.hit(0, H - 52, 150, 52, fn);
  }
  menuShip(cx, cy, s) {
    const c = this.ctx, fl = 24 + Math.random() * 14, S = (pts) => pts.map((p) => [p[0] * s, p[1] * s]);
    poly(c, S([[-14, 12], [0, 12 + fl * 2], [14, 12]]), cx, cy, [255, 150, 40]);
    addGlow(c, cx, cy + 30 * s, 70 * s, [255, 120, 40]);
    poly(c, S([[0, -54], [16, -12], [50, 34], [22, 24], [0, 38], [-22, 24], [-50, 34], [-16, -12]]), cx, cy, [18, 40, 78], CYAN, 3);
    poly(c, S([[0, -34], [8, -4], [0, 12], [-8, -4]]), cx, cy, [120, 240, 255]);
    addGlow(c, cx, cy, 120 * s, [20, 90, 130]);
  }
  drawWorld() {
    const c = this.ctx, y = this.nebY | 0;
    c.drawImage(this.nebula, 0, y - H); c.drawImage(this.nebula, 0, y);
    for (const s of this.stars) s.draw(c);
    for (const [x, y_, r, mr, life, mx, col] of this.rings) {
      const t = 1 - life / mx, rad = lerp(r, mr, 1 - (1 - t) * (1 - t));
      circ(c, x, y_, rad, null, sc(col, 1 - t), Math.max(1, 5 * (1 - t)));
      if (rad > 4) circ(c, x, y_, Math.max(1, rad - 6), null, sc(col, (1 - t) * 0.4), 2);
    }
    for (const pu of this.powerups) pu.draw(c);
    for (const e of this.enemies) e.draw(c);
    if (this.boss) this.boss.draw(c);
    for (const b of this.pbullets) b.draw(c);
    if (['play', 'over', 'pause'].includes(this.state)) { this.drawOpp(); if (this.player.alive) this.player.draw(c); }
    for (const b of this.ebullets) b.draw(c);
    for (const pt of this.parts) pt.draw(c);
  }
  drawOpp() {
    const o = this.opp; if (!this.matchOn || !o || !o.al) return;
    const c = this.ctx, duel = this.mode === 'duel', x = o.x, y = duel ? H - o.y : o.y;
    const col = duel ? PINK : [255, 200, 90], k = duel ? 1 : 0.5, ang = duel ? Math.PI : 0, fl = 14 + Math.random() * 8;
    poly(c, [[-6, 12], [0, 12 + fl], [6, 12]], x, y, sc([255, 150, 40], k), null, 1, ang);
    poly(c, SHIP_SHAPES[0], x, y, sc(col, 0.22 * k), sc(col, k), 2, ang);
    poly(c, [[0, -17], [4, -2], [0, 6], [-4, -2]], x, y, sc(col, 0.9 * k), null, 1, ang);
    addGlow(c, x, y, duel ? 40 : 28, sc(col, 0.4 * k));
    if (o.sh > 0) circ(c, x, y, 34, null, sc(CYAN, k), 2);
    this.text(this.oppName, 20, sc(col, k), x, duel ? y + 46 : y - 42, 'center', false);
  }
  drawHud() {
    const p = this.player, c = this.ctx;
    this.text(String(this.score).padStart(8, '0'), 44, WHITE, 20, 12, 'topleft');
    if (this.mode === 'solo') this.text('REKOR ' + String(this.hi).padStart(8, '0'), 26, DIM, W - 20, 18, 'topright', false);
    if (this.mode !== 'duel' && this.grazeN) this.text('SIYIRMA ' + this.grazeN, 22, [255, 220, 120], W - 20, 44, 'topright', false);
    if (this.chain >= 4 && this.mode !== 'duel') {
      const col = lc(GOLD, RED, (this.mult - 1) / 7);
      this.text(`x${this.mult}  KOMBO ${this.chain}`, 32, col, 20, 56, 'topleft');
      c.fillStyle = css(col); c.fillRect(20, 84, 160 * clamp(this.chainTimer / 2.6, 0, 1), 4);
    }
    if (this.mode !== 'duel') {
      let label = 'DALGA ' + this.wave;
      if (this.mode === 'race') { const s = Math.max(0, this.raceTime | 0); label += `    ${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`; }
      this.text(label, 30, CYAN, W / 2, 24, 'center', false);
    }
    const bx = 20, by = H - 38, bw = 260, bh = 16;
    this.bar(bx - 2, by - 2, bw + 4, bh + 4, [25, 30, 45], 4);
    const ratio = clamp(p.hp / p.maxhp, 0, 1);
    this.bar(bx, by, bw * ratio, bh, lc(RED, GREEN, ratio), 3);
    this.bar(bx - 2, by - 2, bw + 4, bh + 4, null, 4, [90, 110, 150]);
    this.text('CAN ' + Math.max(0, p.hp | 0), 22, WHITE, bx + 6, by + 1, 'topleft', false);
    if (p.shield > 0) this.bar(bx, by - 10, bw * p.shield / 8, 5, CYAN, 2);
    let yy = by - 20;
    for (const [val, full, name, bcol] of [[p.droneT, 18, 'DRON', [190, 140, 255]], [this.slowT, 6, 'ZAMAN', [255, 255, 150]]]) {
      if (val > 0) { this.bar(bx, yy, bw * clamp(val / full, 0, 1), 5, bcol, 2); this.text(name, 16, bcol, bx + bw + 8, yy - 4, 'topleft', false); yy -= 10; }
    }
    for (let i = 0; i < p.bombs; i++) { const cx = 300 + i * 28, cy = H - 30; circ(c, cx, cy, 10, sc(RED, 0.4), RED, 2); addGlow(c, cx, cy, 18, sc(RED, 0.6)); }
    this.text('SİLAH', 20, DIM, W - 20, H - 52, 'bottomright', false);
    for (let i = 0; i < 5; i++) this.bar(W - 120 + i * 20, H - 36, 14, 14, i < p.weapon ? GOLD : [40, 45, 65], 3);
    if (this.boss) {
      const bs = this.boss, bw2 = 520, x0 = W / 2 - bw2 / 2;
      this.bar(x0 - 2, 44, bw2 + 4, 14, [40, 20, 30], 4); this.bar(x0, 46, bw2 * clamp(bs.hp / bs.maxhp, 0, 1), 10, bs.cols[bs.phase], 3);
      this.text(bs.name, 22, bs.cols[bs.phase], W / 2, 72, 'center', false); this.bar(x0 - 2, 44, bw2 + 4, 14, null, 4, [140, 140, 170]);
    }
    const [txt, tm, col] = this.banner;
    if (tm > 0 && this.state !== 'over') {
      const a = clamp(tm > 1 ? 1 : tm, 0, 1);
      this.text(txt, 64, sc(col, a), W / 2, H / 2 - 120);
      if (this.bannerSub) this.text(this.bannerSub, 34, sc(GOLD, a), W / 2, H / 2 - 66);
    }
    if (this.matchOn && (this.mode === 'duel' || this.mode === 'race')) {
      const o = this.opp || {};
      if (this.mode === 'duel') {
        const bw3 = 420, x0 = W / 2 - bw3 / 2, r = clamp((o.hp !== undefined ? o.hp : 100) / 100, 0, 1);
        this.bar(x0 - 2, 14, bw3 + 4, 18, [40, 20, 30], 4); this.bar(x0, 16, bw3 * r, 14, PINK, 3); this.bar(x0 - 2, 14, bw3 + 4, 18, null, 4, [140, 140, 170]);
        this.text(`${this.oppName}  ${o.hp !== undefined ? o.hp | 0 : 100}`, 22, WHITE, W / 2, 23, 'center', false);
      } else {
        this.text(this.oppName, 22, [255, 200, 90], W - 20, 14, 'topright', false);
        this.text(String(o.sc | 0).padStart(8, '0'), 34, [255, 200, 90], W - 20, 34, 'topright', false);
      }
    }
    for (const [x, y, msg, life, col] of this.texts) this.text(msg, 26, sc(col, clamp(life * 1.5, 0, 1)), x, y, 'center', false);
    if (this.touch && this.state === 'play') this.drawTouch();
  }
  drawTouch() {
    const c = this.ctx;
    if (this.stick) {
      const s = this.stick, k = clamp(hyp(s.dx, s.dy), 0, 70), a = Math.atan2(s.dy, s.dx);
      circ(c, s.x0, s.y0, 64, null, [90, 140, 200], 2); c.globalAlpha = 0.35; circ(c, s.x0 + Math.cos(a) * k, s.y0 + Math.sin(a) * k, 30, [90, 160, 230]); c.globalAlpha = 1;
    } else this.text('sürükle: hareket', 20, [90, 120, 170], 120, H - 90, 'center', false);
    const bx = W - 90, by = H - 130;
    c.globalAlpha = 0.8; circ(c, bx, by, 46, sc(RED, 0.25), RED, 3); c.globalAlpha = 1;
    this.text('BOMBA', 18, WHITE, bx, by, 'center', false);
    this.hit(bx - 52, by - 52, 104, 104, () => this.useBomb());
    if (!this.autofire) {
      const fx = W - 210, fy = H - 70; c.globalAlpha = this.fireHeld ? 1 : 0.7; circ(c, fx, fy, 50, sc(CYAN, 0.25), CYAN, 3); c.globalAlpha = 1;
      this.text('ATEŞ', 20, WHITE, fx, fy, 'center', false); this.hit(fx - 56, fy - 56, 112, 112, null, 'fire');
    }
    this.text('II', 26, [150, 200, 255], W - 34, 100, 'center', false);
    this.hit(W - 64, 74, 60, 54, () => { this.state = 'pause'; this.pauseSel = 0; });
  }
  drawInfo() {
    const c = this.ctx, t = this.t, pg = this.infoPage;
    this.text(['NASIL OYNANIR', 'DÜŞMANLAR', 'BOSSLAR'][pg], 56, CYAN, W / 2, 44);
    if (pg === 0) {
      const k = (a) => kname(this.keys[a]);
      const lines = [
        `Hareket: ${k('up')} ${k('left')} ${k('down')} ${k('right')} veya OK TUŞLARI      Ateş: ${k('fire')}      Bomba: ${k('bomb')}`,
        'Duraklat: P veya ESC      Müzik: M      Işıma: G      Tam ekran: F11',
        'DOKUNMATİK: ekrana basılı tutup sürükle = hareket (ateş otomatik), BOMBA düğmesi sağ altta.',
        'Art arda düşman öldürdükçe kombo çarpanı artar (en fazla x8). Hasar alırsan kombo biter.',
        'Düşman mermisine çok yaklaşıp çarpmadan geçersen SIYIRMA puanı kazanırsın.',
        'Her 5. dalgada bir BOSS çıkar. Yenince 6 güçlendirme düşürür. Dalgalar sonsuz.',
        'Online: düelloda rakibi yok et; puan yarışında 3 dakikada en çok puanı topla.',
        'Web, Android ve Windows (Python) oyuncuları aynı odada birlikte oynar.',
      ];
      lines.forEach((ln, i) => this.text(ln, 22, WHITE, 40, 108 + i * 34, 'midleft', false, W - 60));
      this.text('GÜÇLENDİRMELER', 28, GOLD, W / 2, 408, 'center', false);
      const legend = [['W', 'Silah seviyesi +1 (en fazla 5)'], ['S', 'Kalkan 8 sn'], ['H', 'Can +35'], ['B', 'Bomba +1 (en fazla 5)'], ['D', 'Yardımcı dron 18 sn'], ['T', 'Zaman yavaşlar 6 sn']];
      legend.forEach(([kd, desc], i) => {
        const x = 90 + (i % 2) * 440, y = 458 + (i / 2 | 0) * 58, pu = new PowerUp(x, y, kd); pu.t = t; pu.draw(c);
        this.text(desc, 26, WHITE, x + 36, y, 'midleft', false, 380);
      });
    } else if (pg === 1) {
      if (!this.infoCache) this.infoCache = { e: Object.fromEntries(Object.keys(ENEMY_STATS).map((k) => [k, new Enemy(k, 0, 0, 10)])), b: [0, 1, 2, 3, 4, 5, 6].map((i) => new Boss(30, i)) };
      Object.keys(ENEMY_STATS).forEach((k, i) => {
        const cx = 100 + (i % 5) * 190, cy = 130 + (i / 5 | 0) * 190, e = this.infoCache.e[k];
        e.x = cx; e.y = cy; e.t = t; e.intang = k === 'phantom' && (t | 0) % 2 === 0; e.draw(c);
        this.text(ENEMY_NAMES[k], 22, WHITE, cx, cy + 54, 'center', false, 180); this.text(`dalga ${ENEMY_UNLOCK[k][0]}+`, 20, DIM, cx, cy + 76, 'center', false);
      });
    } else {
      if (!this.infoCache) this.infoCache = { e: Object.fromEntries(Object.keys(ENEMY_STATS).map((k) => [k, new Enemy(k, 0, 0, 10)])), b: [0, 1, 2, 3, 4, 5, 6].map((i) => new Boss(30, i)) };
      this.infoCache.b.forEach((bs, i) => {
        const x0 = (i % 4) * 240, y0 = 84 + (i / 4 | 0) * 300;
        bs.entering = false; bs.x = x0 + 120; bs.y = y0 + 125; bs.t = t; bs.hp = bs.maxhp * (i % 3 === 0 ? 0.9 : i % 3 === 1 ? 0.5 : 0.2); bs.beams = [];
        c.save(); c.beginPath(); c.rect(x0 + 2, y0, 236, 250); c.clip(); bs.draw(c); c.restore();
        this.text(`${i + 1}. ${BOSS_NAMES[i]}`, 22, WHITE, x0 + 120, y0 + 264, 'center', false, 230);
        this.text(`dalga ${5 * (i + 1)}, ${5 * (i + 1) + 35}...`, 18, DIM, x0 + 120, y0 + 284, 'center', false);
      });
    }
    this.text(`◀ ▶  sayfa ${pg + 1}/3`, 24, [150, 200, 255], W / 2, 696, 'center', false);
    this.hit(0, 90, 120, 540, () => this.onAction('left')); this.hit(W - 120, 90, 120, 540, () => this.onAction('right'));
    this.hit(W / 2 - 120, 670, 240, 50, () => this.onAction('right'));
  }
  drawUi() {
    const c = this.ctx, t = this.t, st = this.state;
    if (st === 'menu' || st === 'online') {
      const wob = Math.sin(t * 2) * 4;
      this.text('NEON', 120, CYAN, W / 2, 90 + wob); this.text('VOID', 120, PINK, W / 2, 185 - wob);
      this.menuShip(W / 2, 322 + Math.sin(t * 1.5) * 6, 0.5);
      if (st === 'menu') {
        this.drawItems(this.menuItems(), this.menuSel, 398, 44, (i) => this.menuGo(i));
        this.text('REKOR  ' + this.hi, 26, GOLD, W / 2, 662, 'center', false);
      } else {
        this.drawItems(ONLINE_ITEMS, this.onlineSel, 430, 54, (i) => this.onlineGo(i));
        this.text('Davet: oda kurunca linki kopyala, Steam sohbetinde arkadaşına yapıştır', 22, DIM, W / 2, 654, 'center', false);
      }
      if (!this.touch) this.text(`YUKARI/AŞAĞI seç   ENTER onayla   |   ATEŞ: ${kname(this.keys.fire)}   BOMBA: ${kname(this.keys.bomb)}   (AYARLAR'dan değişir)`, 20, DIM2, W / 2, 690, 'center', false);
      this.text('TAM EKRAN', 18, [150, 200, 255], W - 12, 14, 'topright', false); this.hit(W - 130, 0, 130, 36, () => this.fullscreen());
    } else if (st === 'prep') {
      const sh = SHIPS[this.ship];
      this.text('GEMİ & ZORLUK', 62, CYAN, W / 2, 56);
      drawShip(c, this.ship, W / 2, 218 + Math.sin(t * 2) * 6, 1, 24 + Math.random() * 10, 2.2);
      this.text('<', 90, DIM, W / 2 - 230, 215, 'center', false); this.text('>', 90, DIM, W / 2 + 230, 215, 'center', false);
      this.hit(W / 2 - 300, 130, 130, 180, () => this.onAction('left')); this.hit(W / 2 + 170, 130, 130, 180, () => this.onAction('right'));
      this.text(sh.name, 56, sh.col, W / 2, 345); this.text(sh.desc, 26, DIM, W / 2, 387, 'center', false);
      [['HIZ', sh.speed / 480], ['ATEŞ HIZI', (1 / sh.cool) / 1.3], ['BOMBA', sh.bombs / 4], ['KÜÇÜKLÜK', (17 - sh.r) / 7]].forEach(([lab, v], i) => {
        const y = 435 + i * 30; this.text(lab, 22, DIM, 330, y, 'midleft', false);
        this.bar(480, y - 6, 190, 12, [30, 36, 70], 6); this.bar(480, y - 6, 190 * clamp(v, 0.08, 1), 12, sh.col, 6);
      });
      const [dn, dmg, spd, , scm] = DIFFS[this.diff], dcol = [GREEN, GOLD, RED][this.diff];
      this.text(`ZORLUK     <  ${dn}  >`, 44, dcol, W / 2, 590);
      this.hit(W / 2 - 300, 560, 150, 60, () => this.onAction('up')); this.hit(W / 2 + 150, 560, 150, 60, () => this.onAction('down'));
      this.text(`Düşman hasarı x${dmg}    Mermi hızı x${spd}    Skor x${scm}`, 24, DIM, W / 2, 632, 'center', false);
      this.text('Online düelloda herkes DENGE gemisi ve NORMAL zorlukla oynar.', 20, [110, 130, 180], W / 2, 662, 'center', false);
      this.text('BAŞLA', 40, WHITE, W - 120, H - 40, 'center'); this.hit(W - 240, H - 76, 240, 70, () => this.start());
      this.backButton(() => { this.state = 'menu'; });
      if (!this.touch) this.text('SOL/SAĞ gemi   YUKARI/AŞAĞI zorluk   ENTER başla   ESC geri', 22, DIM2, W / 2, 694, 'center', false);
    } else if (st === 'info') { this.drawInfo(); this.backButton(() => { this.state = 'menu'; }); }
    else if (st === 'scores') {
      this.text('SKOR TABLOSU', 62, CYAN, W / 2, 62);
      const rows = (this.cfg.scores || []).filter((r) => r && typeof r === 'object');
      if (!rows.length) this.text('Henüz skor yok. Oyna ve listeye gir!', 34, DIM, W / 2, 300, 'center', false);
      else {
        [[110, '#'], [180, 'SKOR'], [370, 'DALGA'], [480, 'GEMİ'], [620, 'ZORLUK'], [760, 'OYUNCU']].forEach(([x, l]) => this.text(l, 22, DIM, x, 130, 'midleft', false));
        rows.slice(0, 8).forEach((r, i) => {
          const y = 176 + i * 50, col = i === 0 ? GOLD : WHITE;
          const shn = (SHIPS[(r.sh | 0) % SHIPS.length] || {}).name || '?', dfn = (DIFFS[(r.d | 0) % 3] || [])[0] || '?';
          [[110, String(i + 1)], [180, String(r.s || 0)], [370, String(r.w || 0)], [480, shn], [620, dfn], [760, String(r.n || '').slice(0, 10)]].forEach(([x, s]) => this.text(s, 32, col, x, y, 'midleft', false));
        });
      }
      this.backButton(() => { this.state = 'menu'; });
    } else if (st === 'settings') this.drawSettings();
    else if (st === 'connect') this.drawConnect();
    else if (st === 'lobby') this.drawLobby();
    else if (st === 'server') this.drawServer();
  }
  drawSettings() {
    const c = this.ctx;
    this.text('AYARLAR', 66, CYAN, W / 2, 56);
    this.settingsRows().forEach(([key, label], i) => {
      const y = 126 + i * 42, sel = i === this.setSel, colr = sel ? WHITE : DIM2;
      if (sel) { rrect(c, 150, y - 19, 660, 38, [20, 30, 70], CYAN, 2, 8); }
      this.text(label, 28, colr, 180, y, 'midleft', false, 330);
      if (key === 'sfx' || key === 'music') {
        const v = key === 'sfx' ? this.snd.sfxVol : this.snd.musicVol;
        this.bar(520, y - 7, 200, 14, [30, 36, 70], 7); if (v > 0) this.bar(520, y - 7, 200 * v, 14, sel ? CYAN : [80, 120, 170], 7);
        this.text(Math.round(v * 100) + '%', 28, colr, 790, y, 'midright', false);
        this.hit(500, y - 19, 250, 38, (mx) => {
          const nv = clamp(Math.round((mx - 520) / 200 * 10) / 10, 0, 1); this.setSel = i;
          if (key === 'sfx') { this.snd.setSfx(nv); this.snd.play('pickup'); } else this.snd.setMusic(nv); this.saveCfg();
        });
      } else if (key === 'bloom' || key === 'shake' || key === 'autofire') {
        const on = key === 'bloom' ? this.bloomOn : key === 'shake' ? this.shakeOn : this.autofire;
        this.text(on ? 'AÇIK' : 'KAPALI', 28, on ? GREEN : RED, 790, y, 'midright', false);
        this.hit(150, y - 19, 660, 38, () => this.settingsAction('ok', i));
      } else if (this.keys[key] !== undefined) {
        this.text(this.rebind === key ? 'TUŞA BAS...' : kname(this.keys[key]), 28, this.rebind === key ? GOLD : colr, 790, y, 'midright', false);
        this.hit(150, y - 19, 660, 38, () => this.settingsAction('ok', i));
      } else this.hit(150, y - 19, 660, 38, () => this.settingsAction('ok', i));
    });
    this.text(this.rebind ? 'Yeni tuşa bas      ESC iptal' : 'YUKARI/AŞAĞI seç    SOL/SAĞ ayarla    ENTER değiştir    ESC geri', 22, DIM2, W / 2, 698, 'center', false);
    this.backButton(() => this.leaveSettings());
  }
  drawConnect() {
    const c = this.ctx, t = this.t;
    const title = { duel: '1v1 DÜELLO - ODA KUR', race: 'PUAN YARIŞI - ODA KUR', join: 'ODAYA KATIL' }[this.pendingMode] || 'ONLINE';
    this.text(title, 62, CYAN, W / 2, 70);
    [['SUNUCU ADRESİ  (ip:port)', this.addr], ['ODA KODU', this.room], ['OYUNCU ADI', this.name]].forEach(([label, val], i) => {
      const y = 160 + i * 100;
      this.text(label, 22, DIM, 180, y - 20, 'midleft', false);
      rrect(c, 180, y, 600, 50, [14, 18, 40], this.field === i ? CYAN : [70, 80, 120], 2, 8);
      this.text(val + (this.field === i && ((t * 2) | 0) % 2 === 0 ? '_' : ''), 34, WHITE, 194, y + 26, 'midleft', false, 570);
      this.hit(180, y - 30, 600, 82, () => this.setField(i));
    });
    ['Kendi sunucun için: bu sayfayı açan bilgisayar zaten sunucudur, adresi değiştirme.', 'Arkadaşın ODAYA KATIL deyip aynı adres ve oda koduyla girer.',
      'Davet linkin varsa yapıştır (CTRL+V ya da alana dokun): adres ve kod kendiliğinden dolar.'].forEach((h, i) => this.text(h, 22, DIM, W / 2, 470 + i * 30, 'center', false, W - 40));
    if (this.msg) this.text(this.msg, 30, RED, W / 2, 596, 'center', false);
    this.text('BAĞLAN', 44, WHITE, W / 2, 660); this.hit(W / 2 - 150, 626, 300, 62, () => this.lobbyStart());
    this.backButton(() => { this.state = 'online'; });
  }
  drawLobby() {
    const c = this.ctx;
    this.text('ODA', 44, CYAN, W / 2, 60); this.text(this.room, 110, WHITE, W / 2, 140);
    this.text({ duel: '1v1 DÜELLO', race: 'PUAN YARIŞI' }[this.pendingMode] || 'ODAYA KATILDIN', 34, PINK, W / 2, 215, 'center', false);
    this.text(this.lobbyMsg, 34, GOLD, W / 2, 268, 'center', false);
    let y = 316;
    for (const inv of this.inviteList()) {
      this.text(inv.label, 19, DIM, W / 2, y, 'center', false); this.text(inv.uri, 24, WHITE, W / 2, y + 26, 'center', false, W - 40); y += 66;
    }
    if (/^(localhost|127\.)/.test(location.hostname)) this.text('Not: linkteki "localhost" yerine bilgisayarının LAN/İnternet IP adresini yaz (Python penceresindeki SUNUCU ekranında yazar).', 17, [255, 180, 120], W / 2, 452, 'center', false, W - 40);
    const btns = [['WEB LİNKİ KOPYALA', () => this.copyInvite('web')], ['PYTHON LİNKİ', () => this.copyInvite('py')], ['PAYLAŞ', () => this.shareInvite()], ['STEAM', () => this.openSteam()]];
    btns.forEach(([l, fn], i) => {
      const x = 60 + i * 215, w = 200; rrect(c, x, 500, w, 54, [14, 24, 52], [90, 150, 220], 2, 10);
      this.text(l, 19, WHITE, x + w / 2, 527, 'center', false, w - 12); this.hit(x, 500, w, 54, fn);
    });
    this.text('Linki Steam sohbetinde arkadaşına yapıştır: web linki telefonda/bilgisayarda tıklayınca açılır.', 19, DIM, W / 2, 590, 'center', false, W - 40);
    this.text('İPTAL', 30, [150, 200, 255], W / 2, 664); this.hit(W / 2 - 100, 636, 200, 56, () => this.leaveNet());
  }
  drawServer() {
    const lh = location.protocol.startsWith('http');
    this.text('SUNUCU', 70, CYAN, W / 2, 70);
    const rows = lh ? [[GREEN, 'BU SAYFA BİR SUNUCUDAN AÇILDI'], [WHITE, 'Sunucu adresi:  ' + location.host], [WHITE, 'Web / Android linki:  ' + location.origin + '/'], [DIM, 'Python (Windows) adresi:  ' + location.host]]
      : [[RED, 'Bu sayfa dosyadan açıldı: sunucu yok'], [WHITE, "neon_void.py'yi çalıştırıp ana menüde SUNUCU AÇ de"]];
    rows.forEach(([col, tx], i) => this.text(tx, 30, col, W / 2, 160 + i * 46, 'center', false, W - 40));
    ['Sunucu = oyunu Python ile (neon_void.py) çalıştıran bilgisayar.', "Orada ana menüde SUNUCU AÇ de; ekranda yazan Web adresini telefonda/tarayıcıda aç.",
      'Web, Android ve Windows oyuncuları aynı odada birlikte oynar.', 'İnternetten bağlanmak için modemde portu (TCP) yönlendir;',
      'olmuyorsa Radmin VPN / ZeroTier / Tailscale / Hamachi kullan.'].forEach((n, i) => this.text(n, 23, DIM, W / 2, 400 + i * 32, 'center', false, W - 40));
    this.backButton(() => { this.state = 'menu'; });
  }
  drawNetOverlay() {
    const c = this.ctx;
    if (this.countdown > 0) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H);
      this.text(this.mode === 'duel' ? '1v1 DÜELLO' : 'PUAN YARIŞI', 60, CYAN, W / 2, H / 2 - 150);
      this.text(String(Math.ceil(this.countdown)), 220, WHITE, W / 2, H / 2 - 10);
      this.text(`${this.name}   vs   ${this.oppName}`, 34, GOLD, W / 2, H / 2 + 130, 'center', false);
      return;
    }
    if (this.result !== null) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
      const [col, txt] = { win: [GOLD, 'KAZANDIN!'], lose: [RED, 'KAYBETTİN'], draw: [CYAN, 'BERABERE'] }[this.result];
      this.text(txt, 110, col, W / 2, 200);
      if (this.resultReason && this.mode === 'duel') this.text(this.resultReason, 34, WHITE, W / 2, 280, 'center', false);
      if (this.mode === 'race') { this.text(`${this.name}   ${this.score}`, 44, CYAN, W / 2, 330); this.text(`${this.oppName}   ${this.opp ? this.opp.sc | 0 : 0}`, 44, PINK, W / 2, 390); }
      const prompt = this.oppGone ? 'Rakip ayrıldı' : this.rematchMe ? 'Rakibin onayı bekleniyor...' : this.rematchOpp ? 'Rakip rövanş istiyor!' : '';
      if (prompt) this.text(prompt, 34, WHITE, W / 2, 470, 'center', false);
      if (!this.oppGone && !this.rematchMe) { this.text('RÖVANŞ', 42, GREEN, W / 2 - 150, 560); this.hit(W / 2 - 280, 526, 260, 64, () => this.requestRematch()); }
      this.text('MENÜ', 42, WHITE, W / 2 + 150, 560); this.hit(W / 2 + 20, 526, 260, 64, () => this.leaveNet());
    } else if (this.myFin && this.mode === 'race') {
      this.text(this.player.alive ? 'SÜRE BİTTİ' : 'GEMİN YOK EDİLDİ', 56, GOLD, W / 2, H / 2 - 60);
      this.text('Rakibin bitirmesi bekleniyor...', 30, WHITE, W / 2, H / 2, 'center', false);
    }
  }
  draw() {
    const c = this.ctx; this.hits = [];
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (this.shake > 0 && this.shakeOn) c.translate(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
    this.drawWorld();
    const inGame = ['play', 'over', 'pause'].includes(this.state);
    if (inGame) this.drawHud(); else this.drawUi();
    if (this.state === 'pause') {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
      this.text('DURAKLATILDI', 80, WHITE, W / 2, 210);
      this.drawItems(['DEVAM', 'AYARLAR', this.matchOn ? 'MAÇTAN ÇIK' : 'MENÜYE DÖN'], this.pauseSel, 340, 66, (i) => this.pauseGo(i));
    }
    if (this.state === 'over') {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
      this.text('OYUN BİTTİ', 110, RED, W / 2, 180); this.text('SKOR  ' + this.score, 56, WHITE, W / 2, 280);
      if (this.newHi) this.text('YENİ REKOR!', 48, GOLD, W / 2, 345); else this.text('REKOR  ' + this.hi, 36, GOLD, W / 2, 345, 'center', false);
      if (this.rank) this.text('SKOR TABLOSUNDA  #' + this.rank, 32, GREEN, W / 2, 392, 'center', false);
      this.text(`Dalga ${this.wave}   |   ${SHIPS[this.player.ship].name}   |   ${DIFFS[this.curDiff][0]}`, 30, CYAN, W / 2, 440, 'center', false);
      const s = this.runTime | 0;
      this.text(`Öldürme ${this.kills}     Sıyırma ${this.grazeN}     En iyi kombo ${this.maxChain}     Boss ${this.bossesK}     Süre ${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`, 24, [180, 200, 240], W / 2, 490, 'center', false, W - 30);
      this.text('TEKRAR', 42, WHITE, W / 2 - 150, 580); this.hit(W / 2 - 290, 546, 280, 64, () => this.start());
      this.text('MENÜ', 42, WHITE, W / 2 + 150, 580); this.hit(W / 2 + 10, 546, 280, 64, () => this.toMenu());
    }
    if (this.slowT > 0 && inGame) { c.fillStyle = `rgba(30,60,130,${0.18 * clamp(this.slowT, 0, 1)})`; c.fillRect(0, 0, W, H); }
    if (this.matchOn && this.net) this.drawNetOverlay();
    if (this.toast[1] > 0) this.text(this.toast[0], 28, WHITE, W / 2, H - 78, 'center', false);
    if (this.touch && this.state === 'play') { /* dokunma düğmeleri HUD içinde çizildi */ }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.bloomOn) {
      this.tctx.imageSmoothingEnabled = true; this.tctx.clearRect(0, 0, this.tiny.width, this.tiny.height);
      this.tctx.drawImage(this.cv, 0, 0, this.tiny.width, this.tiny.height);
      c.globalCompositeOperation = 'lighter'; c.imageSmoothingEnabled = true; c.globalAlpha = 0.9;
      c.drawImage(this.tiny, 0, 0, W, H); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${clamp(this.flash, 0, 1) * 0.78})`; c.fillRect(0, 0, W, H); }
    c.drawImage(this.vignette, 0, 0);
  }
}
