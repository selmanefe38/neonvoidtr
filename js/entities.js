'use strict';
// NEON VOID - web sürümü: gemiler, mermiler, 15 düşman, 7 boss

const DIFFS = [['KOLAY', 0.6, 0.85, 12, 0.7], ['NORMAL', 1.0, 1.0, 8, 1.0], ['ZOR', 1.4, 1.12, 5, 1.4]];
const SHIPS = [
  { name: 'DENGE', desc: 'Her işe yarayan dengeli gemi.', speed: 410, cool: 1.0, bombs: 3, r: 13, col: CYAN },
  { name: 'AVCI', desc: 'Küçük ve çevik, ama yavaş ateş eder.', speed: 480, cool: 1.25, bombs: 2, r: 10, col: [255, 205, 70] },
  { name: 'KALE', desc: 'Yavaş ve iri, ama seri ateş eder.', speed: 340, cool: 0.8, bombs: 4, r: 15, col: [200, 110, 255] },
];
const SHIP_SHAPES = [
  [[0, -27], [8, -6], [25, 17], [11, 12], [0, 19], [-11, 12], [-25, 17], [-8, -6]],
  [[0, -32], [6, -8], [19, 19], [8, 10], [0, 21], [-8, 10], [-19, 19], [-6, -8]],
  [[0, -24], [12, -8], [30, 12], [26, 21], [11, 14], [0, 20], [-11, 14], [-26, 21], [-30, 12], [-12, -8]],
];
function drawShip(ctx, idx, x, y, wx = 1, fl = 20, scale = 1) {
  const col = SHIPS[idx].col;
  const S = (pts) => pts.map((p) => [p[0] * wx * scale, p[1] * scale]);
  poly(ctx, S([[-7, 12], [0, 12 + fl], [7, 12]]), x, y, [255, 150, 40]);
  poly(ctx, S([[-4, 12], [0, 12 + fl * 0.6], [4, 12]]), x, y, [255, 245, 190]);
  addGlow(ctx, x, y + 18 * scale, 34 * scale, [255, 120, 40]);
  poly(ctx, S(SHIP_SHAPES[idx]), x, y, sc(col, 0.2), col, scale < 1.5 ? 2 : 3);
  poly(ctx, S([[0, -17], [4, -2], [0, 6], [-4, -2]]), x, y, lc(col, WHITE, 0.6));
  line(ctx, x - 18 * wx * scale, y + 12 * scale, x - 9 * wx * scale, y - scale, col, 1);
  line(ctx, x + 18 * wx * scale, y + 12 * scale, x + 9 * wx * scale, y - scale, col, 1);
  addGlow(ctx, x, y, 40 * scale, sc(col, 0.35));
}

class Particle {
  constructor(x, y, vx, vy, life, color, size, drag = 1.5) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.life = this.max = life;
    this.color = color; this.size = size; this.drag = drag;
  }
  update(dt) {
    this.life -= dt;
    const k = Math.max(0, 1 - this.drag * dt);
    this.vx *= k; this.vy *= k; this.x += this.vx * dt; this.y += this.vy * dt;
  }
  draw(ctx) {
    const t = this.life / this.max;
    circ(ctx, this.x, this.y, Math.max(1, this.size * (0.4 + 0.6 * t)), sc(this.color, t * 1.2));
  }
}

class Star {
  constructor(layer) {
    this.layer = layer; this.x = Math.random() * W; this.y = Math.random() * H;
    this.speed = [25, 60, 130][layer]; this.size = [1, 1, 2][layer]; this.base = [90, 150, 230][layer];
    this.tw = Math.random() * 6.28;
  }
  update(dt, boost = 1) {
    this.y += this.speed * dt * boost; this.tw += dt * rnd(2, 4);
    if (this.y > H) { this.y -= H; this.x = Math.random() * W; }
  }
  draw(ctx) {
    const b = this.base * (0.7 + 0.3 * Math.sin(this.tw)) | 0;
    ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 25)})`;
    ctx.fillRect(this.x | 0, this.y | 0, this.size, this.size);
  }
}

class Bullet {
  constructor(x, y, vx, vy, friendly, dmg = 1, color = CYAN, r = 4) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.friendly = friendly; this.dmg = dmg;
    this.color = color; this.r = r; this.dead = false; this.fuse = null; this.grazed = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y < -30 || this.y > H + 30 || this.x < -30 || this.x > W + 30) this.dead = true;
  }
  draw(ctx) {
    if (this.friendly) {
      const tx = this.x - this.vx * 0.022, ty = this.y - this.vy * 0.022;
      line(ctx, this.x, this.y, tx, ty, this.color, 4);
      line(ctx, this.x, this.y, tx, ty, WHITE, 2);
      addGlow(ctx, this.x, this.y, 15, this.color);
    } else if (this.fuse !== null) {
      const hot = Math.floor(this.fuse * (3 + (2.4 - this.fuse) * 5)) % 2 === 0;
      const c = hot ? this.color : sc(this.color, 0.45);
      for (let j = 0; j < 8; j++) {
        const a = j * TAU / 8 + this.fuse;
        line(ctx, this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r,
          this.x + Math.cos(a) * (this.r + 6), this.y + Math.sin(a) * (this.r + 6), c, 2);
      }
      circ(ctx, this.x, this.y, this.r, sc(this.color, 0.25), c, 2);
      circ(ctx, this.x, this.y, 3, hot ? WHITE : c);
      addGlow(ctx, this.x, this.y, 26, sc(this.color, hot ? 0.7 : 0.3));
    } else {
      circ(ctx, this.x, this.y, this.r, this.color);
      circ(ctx, this.x, this.y, Math.max(1, this.r - 3), WHITE);
      addGlow(ctx, this.x, this.y, 17, this.color);
    }
  }
}

const PU_TYPES = {
  W: [GOLD, 'W'], S: [CYAN, 'S'], H: [GREEN, '+'], B: [RED, 'B'], D: [[190, 140, 255], 'D'], T: [[255, 255, 150], 'T'],
};
class PowerUp {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind; this.t = Math.random() * 6; this.dead = false; this.r = 15;
    this.id = null; this.static = false; this.life = 14;
  }
  update(dt, player) {
    this.t += dt;
    if (this.static) { this.life -= dt; if (this.life <= 0) this.dead = true; return; }
    this.y += 90 * dt; this.x += Math.sin(this.t * 3) * 30 * dt;
    if (player.alive) {
      const d = hyp(player.x - this.x, player.y - this.y);
      if (d < 150) {
        const k = (1 - d / 150) * 380 * dt;
        this.x += (player.x - this.x) / (d + 1) * k; this.y += (player.y - this.y) / (d + 1) * k;
      }
    }
    if (this.y > H + 30) this.dead = true;
  }
  draw(ctx) {
    if (this.static && this.life < 3 && Math.floor(this.t * 8) % 2 === 0) return;
    const [col, ch] = PU_TYPES[this.kind] || PU_TYPES.H;
    const r = this.r * (1 + 0.15 * Math.sin(this.t * 6));
    addGlow(ctx, this.x, this.y, 34, col);
    circ(ctx, this.x, this.y, r, sc(col, 0.25), col, 2);
    ctx.font = `bold 20px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(ch, this.x, this.y + 1);
  }
}

class Player {
  constructor(ship = 0) {
    this.ship = ship % SHIPS.length;
    const sd = SHIPS[this.ship];
    this.x = W / 2; this.y = H - 110; this.vx = this.vy = 0;
    this.r = sd.r; this.speed = sd.speed; this.coolMult = sd.cool;
    this.hp = this.maxhp = 100; this.shield = 0; this.weapon = 1; this.bombs = sd.bombs;
    this.cool = 0; this.inv = 0; this.alive = true; this.t = 0; this.droneT = 0; this.dcool = 0;
  }
  update(dt, ax, ay) {
    this.t += dt;
    const m = hyp(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    const k = Math.min(1, dt * 11);
    this.vx += (ax * this.speed - this.vx) * k; this.vy += (ay * this.speed - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 24, W - 24); this.y = clamp(this.y + this.vy * dt, 60, H - 30);
    this.cool -= dt; this.inv -= dt; this.shield = Math.max(0, this.shield - dt);
  }
  draw(ctx) {
    if (this.inv > 0 && Math.floor(this.t * 20) % 2 === 0) return;
    const x = this.x, y = this.y;
    const wx = 1 - Math.abs(clamp(this.vx / this.speed, -1, 1)) * 0.18;
    drawShip(ctx, this.ship, x, y, wx, 16 + Math.random() * 10 + Math.max(0, -this.vy) / 30);
    if (this.droneT > 0 && (this.droneT > 3 || Math.floor(this.t * 8) % 2 === 0)) {
      for (const sx of [-1, 1]) {
        const dx = x + sx * 40, dy = y + 6 + Math.sin(this.t * 5 + sx) * 3;
        poly(ctx, [[0, -8], [6, 0], [0, 8], [-6, 0]], dx, dy, [50, 30, 90], [190, 140, 255], 2);
        addGlow(ctx, dx, dy, 22, [90, 60, 150]);
      }
    }
    if (this.shield > 0) {
      const a = this.shield > 2 ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(this.t * 14));
      const rad = 34 + Math.sin(this.t * 8) * 2;
      circ(ctx, x, y, rad, null, sc(CYAN, a), 2);
      addGlow(ctx, x, y, rad * 1.5, sc([30, 120, 200], a));
    }
  }
}

// ----------------------------------------------------------------- düşmanlar
const ENEMY_STATS = {
  // hp, hız, skor, yarıçap, renk, ateş aralığı (99 = kendi mantığı)
  drone: [2, 95, 100, 18, PINK, 2.4], zig: [3, 80, 150, 18, ORANGE, 2.0], tank: [10, 48, 400, 29, PURPLE, 2.2],
  kami: [2, 150, 200, 16, GOLD, 99], sniper: [3, 60, 250, 17, [255, 90, 90], 99],
  splitter: [6, 55, 300, 24, GREEN, 2.8], swarm: [1, 140, 60, 11, [120, 255, 220], 99],
  orbiter: [5, 40, 350, 20, [100, 160, 255], 2.6], minelayer: [6, 70, 350, 22, [200, 255, 90], 99],
  spinner: [9, 40, 500, 25, [255, 100, 255], 99], charger: [4, 0, 300, 20, [255, 120, 40], 99],
  phantom: [5, 60, 400, 19, [190, 190, 255], 99], laser: [7, 45, 550, 23, [255, 50, 90], 99],
  guardian: [8, 40, 600, 28, [80, 230, 255], 2.4], carrier: [16, 30, 800, 34, [240, 240, 120], 99],
};
const ENEMY_NAMES = {
  drone: 'DRON', zig: 'ZİGZAG', tank: 'TANK', kami: 'KAMİKAZE', sniper: 'KESKİN NİŞANCI', splitter: 'BÖLÜCÜ',
  swarm: 'SÜRÜ', orbiter: 'YÖRÜNGE', minelayer: 'MAYINCI', spinner: 'SPİRAL', charger: 'SALDIRGAN',
  phantom: 'HAYALET', laser: 'LAZER', guardian: 'KORUYUCU', carrier: 'TAŞIYICI',
};
// tür: [açıldığı dalga, çıkma ağırlığı]  (sıra Python ile aynı olmalı: online dalgalar eşleşsin)
const ENEMY_UNLOCK = {
  drone: [1, 5], zig: [2, 4], kami: [3, 3], tank: [4, 2], sniper: [6, 3], splitter: [7, 3], swarm: [8, 3],
  orbiter: [9, 3], minelayer: [11, 2], spinner: [12, 2], charger: [13, 3], phantom: [14, 3], laser: [16, 2],
  guardian: [17, 2], carrier: [19, 1],
};
const BASIC = ['drone', 'zig', 'tank', 'kami'];

class Enemy {
  constructor(kind, x, y, wave) {
    const [hp, vy, score, r, col, fr] = ENEMY_STATS[kind];
    this.kind = kind; this.x = this.x0 = x; this.y = y;
    this.hp = this.maxhp = hp + (kind !== 'swarm' ? Math.floor(wave / 4) : 0);
    this.vy = vy; this.score = score; this.r = r; this.color = col;
    this.fireRate = fr < 90 ? fr * Math.max(0.55, 1 - wave * 0.012) : fr;
    this.cool = fr < 90 ? rnd(0.6, this.fireRate) : 99;
    this.cool2 = 2; this.t = Math.random() * 6; this.age = 0; this.dir = Math.random() < 0.5 ? -1 : 1;
    this.vx = 0; this.vyy = 0; this.flash = 0; this.dead = false; this.ang = 0; this.ph = 0; this.pt = 0;
    this.ty = rnd(90, 170); this.off = rnd(0, 6.28); this.lx = x; this.aim = Math.PI / 2;
    this.shield = this.maxshield = kind === 'guardian' ? 5 + Math.floor(wave / 6) : 0;
    this.intang = false; this.spawned = 0; this.dashes = 0; this.spin = 0;
  }
  update(g, dt) {
    this.t += dt; this.age += dt; this.flash = Math.max(0, this.flash - dt);
    const p = g.player, k = this.kind;
    if (this.age > 45 && k !== 'kami' && k !== 'swarm') {
      this.intang = false; this.y += 240 * dt;
      if (this.y > H + 50) this.dead = true;
      return;
    }
    if (BASIC.includes(k)) this.basic(g, dt, p); else this['ai_' + k](g, dt, p);
    this.x = clamp(this.x, 10, W - 10);
    if (this.y > H + 50) this.dead = true;
  }
  basic(g, dt, p) {
    const k = this.kind;
    if (k === 'drone') { this.y += this.vy * dt; this.x = this.x0 + Math.sin(this.t * 2) * 70; }
    else if (k === 'zig') {
      this.y += this.vy * dt; this.x += this.dir * 170 * dt;
      if (this.x < 40 || this.x > W - 40 || Math.random() < dt * 0.6) this.dir *= -1;
    } else if (k === 'tank') {
      this.y += this.vy * (this.y < 130 ? 1.5 : 0.25) * dt; this.x = this.x0 + Math.sin(this.t * 0.8) * 120;
    } else if (k === 'kami') {
      if (this.y < 110) { this.y += 170 * dt; this.ang = Math.PI / 2; }
      else {
        const tx = p.x - this.x, ty = p.y - this.y, d = hyp(tx, ty) + 1e-6;
        this.vx += (tx / d * 300 - this.vx) * Math.min(1, dt * 2.2);
        this.vyy += (ty / d * 300 - this.vyy) * Math.min(1, dt * 2.2);
        this.x += this.vx * dt; this.y += this.vyy * dt; this.ang = Math.atan2(this.vyy, this.vx);
      }
    }
    this.x = clamp(this.x, 10, W - 10);
    this.cool -= dt;
    if (this.cool <= 0 && this.y > 0 && this.y < H - 120 && p.alive) {
      this.cool = this.fireRate * rnd(0.8, 1.2);
      if (k === 'drone') g.enemyShot(this.x, this.y + 10, Math.PI / 2, 270);
      else if (k === 'zig') g.enemyShot(this.x, this.y + 10, Math.atan2(p.y - this.y, p.x - this.x), 250);
      else if (k === 'tank') {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        for (const i of [-1, 0, 1]) g.enemyShot(this.x, this.y + 12, a + i * 0.22, 230);
      }
    }
  }
  ai_sniper(g, dt, p) {
    if (this.ph === 0) { this.y += 150 * dt; if (this.y >= this.ty) { this.ph = 1; this.pt = 0; } return; }
    this.pt += dt;
    if (this.ph === 1) {
      this.x += this.dir * 45 * dt;
      if (this.x < 50 || this.x > W - 50) this.dir *= -1;
      if (this.pt < 1 && p.alive) this.aim = Math.atan2(p.y - this.y, p.x - this.x);
      if (this.pt >= 1.5) {
        if (p.alive) g.enemyShot(this.x, this.y + 14, this.aim, 540, [255, 90, 90], 5);
        this.ph = 2; this.pt = 0;
      }
    } else if (this.pt > 1.2) { this.ph = 1; this.pt = 0; }
  }
  ai_splitter(g, dt, p) {
    this.y += this.vy * dt; this.x = this.x0 + Math.sin(this.t * 1.4) * 90; this.cool -= dt;
    if (this.cool <= 0 && this.y > 0 && this.y < H - 120 && p.alive) {
      this.cool = this.fireRate * rnd(0.8, 1.2);
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      for (const i of [-1, 1]) g.enemyShot(this.x, this.y + 10, a + i * 0.12, 240, this.color);
    }
  }
  ai_swarm(g, dt) { this.y += this.vy * dt; this.x = this.x0 + Math.sin(this.t * 4 + this.off) * 40; }
  ai_orbiter(g, dt, p) {
    if (this.ph === 0) { this.y += 130 * dt; if (this.y >= this.ty) { this.ph = 1; this.pt = this.t; } return; }
    this.ty += 5 * dt;
    const a = (this.t - this.pt) * 1.5;
    this.x = this.x0 + Math.sin(a) * 110; this.y = this.ty + (1 - Math.cos(a)) * 30; this.cool -= dt;
    if (this.cool <= 0 && p.alive && this.y < H - 120) {
      this.cool = this.fireRate * rnd(0.8, 1.2);
      for (let i = 0; i < 6; i++) g.enemyShot(this.x, this.y, this.t + i * TAU / 6, 200, this.color);
    }
  }
  ai_minelayer(g, dt, p) {
    if (this.ph === 0) { this.y += 140 * dt; if (this.y >= Math.min(this.ty, 130)) this.ph = 1; return; }
    this.x += this.dir * 120 * dt;
    if (this.x < 60 || this.x > W - 60) this.dir *= -1;
    this.pt += dt;
    if (this.pt >= 1.5 && p.alive) { this.pt = 0; g.mine(this.x, this.y + 16); }
  }
  ai_spinner(g, dt, p) {
    if (this.ph === 0) { this.y += 130 * dt; if (this.y >= this.ty) this.ph = 1; return; }
    this.x = this.x0 + Math.sin(this.t * 0.6) * 50; this.pt += dt;
    if ((this.pt % 4.2) < 2.6 && p.alive) {
      this.cool -= dt;
      if (this.cool <= 0) {
        this.cool = 0.15; this.spin += 0.42;
        for (let arm = 0; arm < 2; arm++) g.enemyShot(this.x, this.y, this.spin + arm * Math.PI, 190, this.color);
      }
    }
  }
  ai_charger(g, dt, p) {
    if (this.ph === 0) { this.y += 220 * dt; if (this.y >= this.ty) { this.ph = 1; this.pt = 0; } }
    else if (this.ph === 1) {
      this.pt += dt; this.x += clamp(p.x - this.x, -260 * dt, 260 * dt);
      if (this.pt > 1.4) { this.ph = 2; this.pt = 0; this.lx = this.x; }
    } else if (this.ph === 2) {
      this.pt += dt; this.x = this.lx + rnd(-2, 2);
      if (this.pt > 0.55) { this.ph = 3; this.x = this.lx; }
    } else {
      this.y += 760 * dt;
      if (this.y > H + 30) {
        this.dashes++;
        if (this.dashes >= 2) this.dead = true; else { this.y = -40; this.ph = 0; }
      }
    }
  }
  ai_phantom(g, dt, p) {
    this.y += 38 * dt; this.x = this.x0 + Math.sin(this.t * 1.1) * 60; this.pt += dt;
    if (this.ph === 0) {
      if (this.pt > 2) { this.ph = 1; this.pt = 0; this.intang = true; }
      else {
        this.cool -= dt;
        if (this.cool <= 0 && p.alive && this.y > 0 && this.y < H - 120) {
          this.cool = 0.9;
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          for (const i of [-1, 0, 1]) g.enemyShot(this.x, this.y + 10, a + i * 0.2, 250, this.color);
        }
      }
    } else if (this.pt > 0.9) { this.ph = 0; this.pt = 0; this.intang = false; this.x0 = rnd(80, W - 80); }
  }
  ai_laser(g, dt, p) {
    if (this.ph === 0) { this.y += 140 * dt; if (this.y >= this.ty) { this.ph = 1; this.pt = 0; } return; }
    this.pt += dt;
    if (this.ph === 1) {
      this.x += clamp(p.x - this.x, -120 * dt, 120 * dt);
      if (this.pt > 1.6) { this.ph = 2; this.pt = 0; this.lx = this.x; }
    } else if (this.ph === 2) { this.x = this.lx; if (this.pt > 1.1) { this.ph = 3; this.pt = 0; } }
    else {
      this.x = this.lx;
      if (p.alive && Math.abs(p.x - this.lx) < 17 && p.y > this.y) g.hurtPlayer(15);
      if (this.pt > 0.7) { this.ph = 1; this.pt = 0; }
    }
  }
  ai_guardian(g, dt, p) {
    if (this.ph === 0) { this.y += 90 * dt; if (this.y >= this.ty) this.ph = 1; }
    this.x += this.dir * 55 * dt;
    if (this.x < 60 || this.x > W - 60) this.dir *= -1;
    this.cool -= dt;
    if (this.cool <= 0 && p.alive && this.y > 0 && this.y < H - 120) {
      this.cool = this.fireRate * rnd(0.8, 1.2);
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      for (let i = -2; i <= 2; i++) g.enemyShot(this.x, this.y + 14, a + i * 0.22, 210, this.color);
    }
  }
  ai_carrier(g, dt, p) {
    if (this.ph === 0) { this.y += 80 * dt; if (this.y >= Math.min(this.ty, 120)) this.ph = 1; return; }
    this.x = this.x0 + Math.sin(this.t * 0.5) * 100; this.pt += dt;
    if (this.pt > 3.6 && this.spawned < 3) {
      this.pt = 0; this.spawned++;
      for (const dx of [-22, 22]) g.spawnEnemy('swarm', this.x + dx, this.y + 22);
    }
    this.cool2 -= dt;
    if (this.cool2 <= 0 && p.alive) {
      this.cool2 = 3;
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      for (const i of [-1, 0, 1]) g.enemyShot(this.x, this.y + 20, a + i * 0.2, 230, this.color);
    }
  }

  draw(ctx) {
    const x = this.x, y = this.y, k = this.kind;
    const dim = this.intang ? 0.3 : 1;
    const col = this.flash > 0 ? WHITE : sc(this.color, dim);
    const fill = this.flash > 0 ? sc(WHITE, 0.9) : sc(this.color, 0.22 * dim);
    addGlow(ctx, x, y, this.r * 2.3, sc(this.color, 0.55 * dim));
    if (k === 'sniper' && this.ph === 1 && this.pt > 0.15) {
      const br = clamp(this.pt / 1.5, 0.15, 1);
      line(ctx, x, y + 14, x + Math.cos(this.aim) * 1100, y + Math.sin(this.aim) * 1100, sc([255, 60, 60], br), this.pt > 1 ? 2 : 1);
    } else if (k === 'charger' && this.ph === 2) {
      line(ctx, this.lx, y, this.lx, H, sc(RED, 0.5 + 0.5 * Math.sin(this.t * 40)), 2);
    } else if (k === 'laser' && this.ph === 2) {
      const br = 0.25 + 0.75 * clamp(this.pt / 1.1, 0, 1);
      if (Math.floor(this.pt * 16) % 2 === 0) line(ctx, this.lx, y, this.lx, H, sc(this.color, br), 1);
    } else if (k === 'laser' && this.ph === 3) {
      ctx.fillStyle = css(sc(this.color, 0.9)); ctx.fillRect(this.lx - 15, y, 30, H - y);
      ctx.fillStyle = '#fff'; ctx.fillRect(this.lx - 5, y, 10, H - y);
      for (let yy = y | 0; yy < H; yy += 100) addGlow(ctx, this.lx, yy, 46, sc(this.color, 0.7));
    }
    if (k === 'drone') {
      poly(ctx, [[0, 20], [18, -10], [8, -16], [0, -6], [-8, -16], [-18, -10]], x, y, fill, col);
      circ(ctx, x, y - 2, 4, col);
    } else if (k === 'zig') {
      poly(ctx, [[0, -20], [16, 0], [0, 20], [-16, 0]], x, y, fill, col);
      line(ctx, x - 10, y, x + 10, y, col, 2); line(ctx, x, y - 11, x, y + 11, col, 2);
    } else if (k === 'tank') {
      const pts = []; for (let i = 0; i < 6; i++) pts.push([Math.cos(i * Math.PI / 3) * 29, Math.sin(i * Math.PI / 3) * 29]);
      poly(ctx, pts, x, y, fill, col, 3, this.t * 0.3);
      circ(ctx, x, y, 11, null, col, 2); circ(ctx, x, y, 5, this.flash > 0 ? WHITE : sc(col, 0.9));
    } else if (k === 'kami') {
      poly(ctx, [[20, 0], [-12, 12], [-5, 0], [-12, -12]], x, y, fill, col, 2, this.ang);
      addGlow(ctx, x - Math.cos(this.ang) * 14, y - Math.sin(this.ang) * 14, 20, [255, 120, 30]);
    } else if (k === 'sniper') {
      poly(ctx, [[0, -18], [7, -4], [4, 16], [0, 20], [-4, 16], [-7, -4]], x, y, fill, col);
      line(ctx, x, y + 16, x, y + 32, col, 3); circ(ctx, x, y - 4, 4, col);
    } else if (k === 'splitter') {
      circ(ctx, x, y, 22, fill, col, 3); line(ctx, x, y - 22, x, y + 22, col, 2);
      for (const sx of [-9, 9]) circ(ctx, x + sx, y, 5, col);
    } else if (k === 'swarm') {
      poly(ctx, [[0, 11], [8, -8], [0, -3], [-8, -8]], x, y, fill, col, 2);
    } else if (k === 'orbiter') {
      circ(ctx, x, y, 14, fill, col, 2); circ(ctx, x, y, 6, col);
      for (let i = 0; i < 3; i++) { const a = this.t * 3 + i * TAU / 3; circ(ctx, x + Math.cos(a) * 24, y + Math.sin(a) * 24, 4, col); }
    } else if (k === 'minelayer') {
      poly(ctx, [[-24, -8], [24, -8], [16, 12], [-16, 12]], x, y, fill, col);
      for (const sx of [-12, 0, 12]) circ(ctx, x + sx, y + 14, 4, null, col, 2);
      line(ctx, x - 24, y - 8, x - 30, y - 16, col, 2); line(ctx, x + 24, y - 8, x + 30, y - 16, col, 2);
    } else if (k === 'spinner') {
      const pts = []; for (let i = 0; i < 16; i++) { const rr = i % 2 === 0 ? 27 : 13; pts.push([Math.cos(i * Math.PI / 8) * rr, Math.sin(i * Math.PI / 8) * rr]); }
      poly(ctx, pts, x, y, fill, col, 2, this.t * 2); circ(ctx, x, y, 5, col);
    } else if (k === 'charger') {
      const c2 = this.ph >= 2 && Math.floor(this.t * 20) % 2 === 0 ? WHITE : col;
      poly(ctx, [[0, 24], [14, -10], [0, -2], [-14, -10]], x, y, fill, c2, 2);
      poly(ctx, [[0, -2], [10, -16], [-10, -16]], x, y, fill, c2, 2);
      if (this.ph === 3) { line(ctx, x, y - 20, x, y - 120, col, 4); addGlow(ctx, x, y - 30, 40, [255, 120, 40]); }
    } else if (k === 'phantom') {
      poly(ctx, [[-16, 16], [-16, -4], [-10, -16], [0, -20], [10, -16], [16, -4], [16, 16], [8, 10], [0, 16], [-8, 10]],
        x, y, this.intang ? null : fill, col, 2);
      for (const sx of [-6, 6]) circ(ctx, x + sx, y - 5, 3, col);
    } else if (k === 'laser') {
      poly(ctx, [[0, -24], [16, -10], [16, 14], [0, 24], [-16, 14], [-16, -10]], x, y, fill, col, 3);
      circ(ctx, x, y + 2, 8, sc(this.color, this.ph >= 2 ? 1 : 0.4)); circ(ctx, x, y + 2, 3, WHITE);
      ctx.fillStyle = css(col); ctx.fillRect(x - 3, y + 20, 6, 10);
    } else if (k === 'guardian') {
      const pts = []; for (let i = 0; i < 6; i++) pts.push([Math.cos(i * Math.PI / 3) * 24, Math.sin(i * Math.PI / 3) * 24]);
      poly(ctx, pts, x, y, fill, col, 3, 0.5); circ(ctx, x, y, 7, null, col, 2);
      if (this.shield > 0) {
        const br = 0.4 + 0.6 * this.shield / Math.max(1, this.maxshield);
        circ(ctx, x, y, 38, null, sc([120, 255, 255], br), 3); addGlow(ctx, x, y, 50, sc([40, 130, 160], br));
      }
    } else if (k === 'carrier') {
      poly(ctx, [[-34, -12], [-20, -24], [20, -24], [34, -12], [28, 16], [0, 26], [-28, 16]], x, y, fill, col, 3);
      for (const sx of [-14, 14]) circ(ctx, x + sx, y + 6, 7, null, col, 2);
      line(ctx, x - 20, y - 24, x - 20, y - 34, col, 3); line(ctx, x + 20, y - 24, x + 20, y - 34, col, 3);
    }
    if (this.maxhp > 4 && this.hp < this.maxhp) {
      ctx.fillStyle = 'rgb(40,20,30)'; ctx.fillRect(x - 19, y - this.r - 12, 38, 4);
      ctx.fillStyle = css(this.color); ctx.fillRect(x - 19, y - this.r - 12, 38 * Math.max(0, this.hp) / this.maxhp, 4);
    }
  }
}

// ----------------------------------------------------------------- bosslar
const BOSS_NAMES = ['NEON ÇEKİRDEK', 'SPİRAL EFENDİ', 'LAZER ŞÖVALYESİ', 'SÜRÜ KRALİÇESİ', 'MAYIN USTASI', 'HAYALET AMİRAL', 'VOID TİTANI'];
const BOSS_COLS = [
  [CYAN, ORANGE, RED], [[255, 100, 255], PINK, RED], [[255, 60, 90], [255, 150, 60], [255, 240, 200]],
  [GREEN, GOLD, ORANGE], [[200, 255, 90], ORANGE, RED], [[190, 190, 255], PURPLE, PINK],
  [[130, 90, 255], PINK, [255, 255, 255]],
];
class Boss {
  constructor(wave, idx = 0) {
    this.idx = idx % 7; this.cols = BOSS_COLS[this.idx]; this.name = BOSS_NAMES[this.idx];
    this.x = W / 2; this.y = -140; this.hp = this.maxhp = 110 + wave * 30; this.r = this.idx === 6 ? 80 : 66;
    this.t = 0; this.entering = true; this.flash = 0; this.dead = false; this.timers = {}; this.beams = [];
    this.spin = 0; this.count = 0; this.mode = 0; this.pt = 0; this.intang = false; this.tx = W / 2; this.ty = 150;
  }
  get phase() { const r = this.hp / this.maxhp; return r > 0.66 ? 0 : r > 0.33 ? 1 : 2; }
  every(name, dt, interval) {
    const t = (name in this.timers ? this.timers[name] : interval) - dt;
    if (t <= 0) { this.timers[name] = interval; return true; }
    this.timers[name] = t; return false;
  }
  shot(g, ang, speed, color = PINK, oy = 0) { g.enemyShot(this.x, this.y + oy, ang, speed, color); }
  fan(g, p, n, step, speed, color) {
    const base = Math.atan2(p.y - this.y, p.x - this.x);
    for (let i = 0; i < n; i++) this.shot(g, base + (i - (n - 1) / 2) * step, speed, color, 36);
  }
  ring(g, n, speed, color, off = 0) { for (let i = 0; i < n; i++) this.shot(g, off + i * TAU / n, speed, color); }
  addBeams(n, p) {
    const xs = [p.x]; for (let i = 1; i < n; i++) xs.push(rnd(60, W - 60));
    for (const bx of xs) this.beams.push([bx, 0]);
  }
  updateBeams(g, dt, p) {
    for (const b of this.beams) {
      b[1] += dt;
      if (p.alive && b[1] > 1 && b[1] < 1.6 && Math.abs(p.x - b[0]) < 19 && p.y > this.y) g.hurtPlayer(15);
    }
    this.beams = this.beams.filter((b) => b[1] < 1.6);
  }
  update(g, dt) {
    this.t += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.entering) { this.y += 95 * dt; if (this.y >= 150) this.entering = false; return; }
    const p = g.player;
    this.updateBeams(g, dt, p);
    this['ai' + this.idx](g, dt, p, this.phase);
  }
  ai0(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 0.7) * 290; this.y = 150 + Math.sin(this.t * 1.3) * 30;
    if (!p.alive) return;
    if (ph === 0) { if (this.every('a', dt, 1.1)) this.fan(g, p, 5, 0.2, 290, PINK); }
    else if (ph === 1) {
      if (this.every('a', dt, 1.35)) { this.ring(g, 18, 210, PINK, this.spin); this.spin += 0.17; this.fan(g, p, 3, 0.15, 320, ORANGE); }
    } else if (this.every('a', dt, 0.07)) {
      for (let k = 0; k < 2; k++) this.shot(g, this.spin + k * Math.PI, 260, RED);
      this.spin += 0.33; this.count++;
      if (this.count % 40 === 0) this.ring(g, 24, 200, PINK);
    }
  }
  ai1(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 0.5) * 140; this.y = 140 + Math.sin(this.t * 0.9) * 20;
    if (!p.alive) return;
    const c = this.cols[ph];
    if (ph === 0) {
      if (this.every('s', dt, 0.13)) { this.spin += 0.3; for (let k = 0; k < 2; k++) this.shot(g, this.spin + k * Math.PI, 200, c); }
      if (this.every('r', dt, 3.2)) this.ring(g, 20, 170, PINK, Math.random());
    } else if (ph === 1) {
      if (this.every('s', dt, 0.15)) { this.spin += 0.26; for (let k = 0; k < 4; k++) this.shot(g, this.spin + k * Math.PI / 2, 210, c); }
      if (this.every('f', dt, 2.0)) this.fan(g, p, 5, 0.18, 300, ORANGE);
    } else {
      if (this.every('s', dt, 0.2)) { this.spin -= 0.31; for (let k = 0; k < 6; k++) this.shot(g, this.spin + k * TAU / 6, 220, c); }
      if (this.every('f', dt, 1.5)) this.fan(g, p, 3, 0.14, 330, WHITE);
      if (this.every('r', dt, 3.0)) this.ring(g, 24, 160, PINK);
    }
  }
  ai2(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 0.6) * 300; this.y = 130 + Math.sin(this.t * 1.1) * 20;
    if (!p.alive) return;
    const c = this.cols[ph];
    if (this.every('b', dt, 4.2 - ph * 0.6)) this.addBeams(2 + ph, p);
    if (this.every('f', dt, 1.5 - ph * 0.2)) this.fan(g, p, 3, 0.2, 300, c);
    if (ph === 2 && this.every('r', dt, 3.0)) this.ring(g, 14, 170, c, Math.random());
  }
  ai3(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 0.4) * 250; this.y = 140 + Math.sin(this.t * 1.0) * 40;
    if (!p.alive) return;
    if (this.every('w', dt, 3.8 - ph * 0.7)) {
      if (g.enemies.filter((e) => e.kind === 'swarm').length < 10) {
        const n = 2 + ph;
        for (let i = 0; i < n; i++) g.spawnEnemy('swarm', this.x + (i - (n - 1) / 2) * 34, this.y + 40);
      }
    }
    if (this.every('f', dt, 1.4)) this.fan(g, p, 3, 0.2, 280, GREEN);
    if (ph >= 1 && this.every('r', dt, 2.8)) this.ring(g, 12, 190, GOLD, Math.random());
    if (ph === 2 && this.every('s', dt, 0.25)) { this.spin += 0.4; for (let k = 0; k < 2; k++) this.shot(g, this.spin + k * Math.PI, 220, ORANGE); }
  }
  ai4(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 1.0) * 320; this.y = 130 + Math.sin(this.t * 1.7) * 25;
    if (!p.alive) return;
    const c = this.cols[ph];
    if (this.every('m', dt, 1.3 - ph * 0.25)) g.mine(this.x, this.y + 50);
    if (this.every('f', dt, 1.6)) this.fan(g, p, ph ? 5 : 3, 0.22, 270, c);
    if (ph === 2 && this.every('r', dt, 2.4)) { this.spin += 0.2; this.ring(g, 16, 200, c, this.spin); }
  }
  ai5(g, dt, p, ph) {
    this.pt += dt;
    const c = this.cols[ph];
    if (this.mode === 0) {
      const k = Math.min(1, dt * 1.5);
      this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k;
      if (p.alive) {
        if (this.every('f', dt, 0.9 - ph * 0.12)) this.fan(g, p, 5, 0.2, 280 + ph * 20, c);
        if (ph >= 1 && this.every('r', dt, 2.0)) { this.spin += 0.2; this.ring(g, 14, 190, PINK, this.spin); }
        if (ph === 2 && this.every('c', dt, 1.1)) this.fan(g, p, 9, 0.12, 330, WHITE);
      }
      if (this.pt > 3.0 - ph * 0.4) { this.mode = 1; this.pt = 0; this.intang = true; }
    } else if (this.pt > 0.8) {
      this.mode = 0; this.pt = 0; this.intang = false;
      this.tx = rnd(150, W - 150); this.ty = rnd(110, 230); this.x = this.tx; this.y = this.ty;
      if (p.alive) this.fan(g, p, 7, 0.15, 320, PINK);
    }
  }
  ai6(g, dt, p, ph) {
    this.x = W / 2 + Math.sin(this.t * 0.35) * 200; this.y = 150 + Math.sin(this.t * 0.8) * 25;
    if (!p.alive) return;
    const c = this.cols[ph];
    if (ph === 0) {
      if (this.every('a', dt, 1.2)) { this.ring(g, 16, 200, c, this.spin); this.spin += 0.2; }
      if (this.every('f', dt, 1.7)) this.fan(g, p, 5, 0.18, 300, PINK);
      if (this.every('b', dt, 5.0)) this.addBeams(2, p);
    } else if (ph === 1) {
      if (this.every('s', dt, 0.16)) { this.spin += 0.28; for (let k = 0; k < 3; k++) this.shot(g, this.spin + k * TAU / 3, 220, c); }
      if (this.every('f', dt, 1.5)) this.fan(g, p, 5, 0.16, 320, ORANGE);
      if (this.every('b', dt, 4.2)) this.addBeams(3, p);
      if (this.every('m', dt, 2.2)) g.mine(this.x + rnd(-80, 80), this.y + 60);
    } else {
      if (this.every('s', dt, 0.17)) { this.spin -= 0.3; for (let k = 0; k < 5; k++) this.shot(g, this.spin + k * TAU / 5, 230, c); }
      if (this.every('f', dt, 1.2)) this.fan(g, p, 7, 0.14, 340, WHITE);
      if (this.every('b', dt, 3.5)) this.addBeams(4, p);
      if (this.every('w', dt, 4.5) && g.enemies.filter((e) => e.kind === 'swarm').length < 8) {
        for (let i = 0; i < 4; i++) g.spawnEnemy('swarm', this.x + (i - 1.5) * 36, this.y + 50);
      }
      if (this.every('m', dt, 1.8)) g.mine(this.x + rnd(-100, 100), this.y + 60);
    }
  }
  drawBeams(ctx) {
    const core = this.cols[this.phase];
    for (const [bx, bt] of this.beams) {
      if (bt < 1) {
        if (Math.floor(bt * 14) % 2 === 0) line(ctx, bx, this.y, bx, H, sc([255, 80, 100], 0.25 + 0.75 * bt), 1);
      } else {
        ctx.fillStyle = css(sc(core, 0.9)); ctx.fillRect(bx - 17, this.y, 34, H - this.y);
        ctx.fillStyle = '#fff'; ctx.fillRect(bx - 6, this.y, 12, H - this.y);
        for (let yy = this.y | 0; yy < H; yy += 90) addGlow(ctx, bx, yy, 50, sc(core, 0.7));
      }
    }
  }
  draw(ctx) {
    const x = this.x, y = this.y, ph = this.phase, core = this.cols[ph], i = this.idx;
    const dim = this.intang ? 0.3 : 1;
    const col = this.flash > 0 ? WHITE : sc(core, dim);
    const dark = sc(core, 0.22 * dim);
    const bodyFill = this.flash > 0 ? [230, 230, 255] : dark;
    addGlow(ctx, x, y, 190, sc(core, 0.45 * dim));
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 6 * (1 + ph * 0.6));
    if (i === 0) {
      for (let j = 0; j < 8; j++) {
        const a = this.t * 0.8 + j * TAU / 8;
        poly(ctx, [[10, 0], [-8, 8], [-8, -8]], x + Math.cos(a) * 82, y + Math.sin(a) * 82, sc(core, 0.25), col, 2, a + Math.PI / 2);
      }
      poly(ctx, [[0, 62], [48, 24], [62, -26], [30, -52], [0, -40], [-30, -52], [-62, -26], [-48, 24]], x, y,
        this.flash > 0 ? [230, 230, 255] : [50, 40, 80], col, 3);
      poly(ctx, [[0, 40], [28, 10], [0, -26], [-28, 10]], x, y, sc(core, 0.25), col, 2);
    } else if (i === 1) {
      for (let j = 0; j < 6; j++) {
        const a = this.t * 0.9 + j * TAU / 6, ex = x + Math.cos(a) * 80, ey = y + Math.sin(a) * 80;
        line(ctx, x, y, ex, ey, sc(core, 0.6 * dim), 3); circ(ctx, ex, ey, 10, dark, col, 2);
      }
      circ(ctx, x, y, 48, bodyFill, col, 3);
      const pts = []; for (let j = 0; j < 8; j++) pts.push([Math.cos(j * TAU / 8) * 30, Math.sin(j * TAU / 8) * 30]);
      poly(ctx, pts, x, y, sc(core, 0.3), col, 2, -this.t);
    } else if (i === 2) {
      poly(ctx, [[0, -62], [36, -42], [58, -6], [40, 46], [0, 64], [-40, 46], [-58, -6], [-36, -42]], x, y,
        this.flash > 0 ? [230, 230, 255] : [45, 30, 50], col, 3);
      for (const sx of [-1, 1]) {
        rrect(ctx, x + sx * 66 - 8, y - 22, 16, 76, dark, col, 2, 2);
        const lens = this.beams.length ? 1 : 0.5;
        circ(ctx, x + sx * 66, y + 54, 7, sc(core, lens)); addGlow(ctx, x + sx * 66, y + 54, 24, sc(core, 0.5 * lens));
      }
      ctx.fillStyle = css(sc(core, pulse)); ctx.fillRect(x - 5, y - 34, 10, 62);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 30, 4, 54);
    } else if (i === 3) {
      const fl = Math.sin(this.t * 18) * 10;
      for (const sx of [-1, 1]) poly(ctx, [[0, -6], [sx * 72, -32 + fl], [sx * 84, 10 + fl], [sx * 22, 24]], x, y, sc(core, 0.15), col, 2);
      ctx.beginPath(); ctx.ellipse(x, y + 4, 28, 50, 0, 0, TAU); ctx.fillStyle = css(bodyFill); ctx.fill();
      ctx.strokeStyle = css(col); ctx.lineWidth = 3; ctx.stroke();
      for (let j = 0; j < 4; j++) line(ctx, x - 24, y - 20 + j * 18, x + 24, y - 20 + j * 18, col, 2);
      circ(ctx, x, y - 56, 16, bodyFill, col, 3);
      for (const sx of [-6, 6]) circ(ctx, x + sx, y - 58, 4, sc(core, pulse));
    } else if (i === 4) {
      for (let j = 0; j < 12; j++) poly(ctx, [[46, -9], [74, 0], [46, 9]], x, y, dark, col, 2, this.t * 0.6 + j * TAU / 12);
      circ(ctx, x, y, 48, bodyFill, col, 3);
      for (let j = 0; j < 6; j++) { const a = -this.t + j * TAU / 6; circ(ctx, x + Math.cos(a) * 30, y + Math.sin(a) * 30, 4, col); }
    } else if (i === 5) {
      poly(ctx, [[0, -50], [70, -10], [92, 42], [50, 24], [0, 56], [-50, 24], [-92, 42], [-70, -10]], x, y,
        this.intang ? null : (this.flash > 0 ? [230, 230, 255] : [36, 34, 66]), col, 3);
      for (const sx of [-18, 18]) { circ(ctx, x + sx, y - 6, 9, sc(core, pulse * dim)); circ(ctx, x + sx, y - 6, 3, this.intang ? col : WHITE); }
      ctx.beginPath(); ctx.moveTo(x - 20, y + 22); ctx.lineTo(x - 10, y + 30); ctx.lineTo(x, y + 22); ctx.lineTo(x + 10, y + 30); ctx.lineTo(x + 20, y + 22);
      ctx.strokeStyle = css(col); ctx.lineWidth = 2; ctx.stroke();
      for (let j = 0; j < 3; j++) { const a = this.t * 1.5 + j * TAU / 3; circ(ctx, x + Math.cos(a) * 110, y + Math.sin(a) * 40, 6, null, col, 2); }
    } else {
      for (let j = 0; j < 3; j++) {
        const rad = 112 - j * 18;
        for (let s = 0; s < 3; s++) {
          const a0 = this.t * (1 + j * 0.4) * (j % 2 ? -1 : 1) + s * TAU / 3;
          arc(ctx, x, y, rad, a0, a0 + 1.2, sc(core, 0.9 - j * 0.15), 4);
        }
      }
      const pts = []; for (let j = 0; j < 6; j++) pts.push([Math.cos(j * Math.PI / 3) * 60, Math.sin(j * Math.PI / 3) * 60]);
      poly(ctx, pts, x, y, this.flash > 0 ? [230, 230, 255] : [30, 24, 60], col, 4, this.t * 0.2);
      for (let j = 0; j < 3; j++) { const a = this.t * 2 + j * TAU / 3; circ(ctx, x + Math.cos(a) * 26, y + Math.sin(a) * 26, 8, sc(core, pulse)); }
    }
    circ(ctx, x, y + 4, 16, sc(core, pulse * dim)); circ(ctx, x, y + 4, 7, this.intang ? col : WHITE);
    addGlow(ctx, x, y + 4, 60, sc(core, dim));
    this.drawBeams(ctx);
  }
}
