import { sfx } from '../engine/audio';
import type { Input } from '../engine/input';
import { angleDiff, angleTo, dist, TAU } from '../engine/math';
import { lineOfSight, Mask, moveBox } from './collision';
import type { Enemy } from './enemies';
import type { Game } from './game';
import { computeStats, Hero, HEROES, PlayerStats } from './upgrades';

export class Player {
  x = 0;
  y = 0;
  r = 8;
  vx = 0;
  vy = 0;
  hp: number;
  stats: PlayerStats;
  hero: Hero;
  upgrades: string[] = [];
  facing = 1;
  aimAngle = 0;
  moving = false;
  walkT = 0;
  stepT = 0;
  invuln = 0;
  hurtFlash = 0;
  dead = false;
  // abilities
  boltCd = 0;
  slashCd = 0;
  novaCd = 0;
  dashCharges: number;
  dashRecharge = 0;
  dashT = 0;
  dashX = 0;
  dashY = 0;
  dashHit = new Set<Enemy>();
  slashT = 0; // visual sweep timer
  slashAngle = 0;
  novaT = 0;
  novaTick = 0;
  afterimages: { x: number; y: number; life: number; flip: boolean }[] = [];
  orbitAngle = 0;
  orbitHits = new Map<Enemy, number>();
  sphereCd: number[] = [];
  regenAcc = 0;

  constructor(heroId: string, upgrades: string[] = []) {
    this.hero = HEROES.find((h) => h.id === heroId) ?? HEROES[0];
    this.upgrades = [...upgrades];
    this.stats = computeStats(this.hero.id, this.upgrades);
    this.hp = this.stats.maxHp;
    this.dashCharges = this.stats.dashCharges;
  }

  recompute(): void {
    const oldMax = this.stats.maxHp;
    this.stats = computeStats(this.hero.id, this.upgrades);
    if (this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    this.dashCharges = Math.min(this.dashCharges + 1, this.stats.dashCharges);
  }

  heal(n: number): number {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    return this.hp - before;
  }

  /** Ability readiness 0..1 for the HUD. */
  cdFrac(which: 'slash' | 'nova' | 'dash'): number {
    const s = this.stats;
    if (which === 'slash') return 1 - this.slashCd / s.slashCd;
    if (which === 'nova') return 1 - this.novaCd / s.novaCd;
    if (this.dashCharges >= s.dashCharges) return 1;
    return 1 - this.dashRecharge / s.dashCd;
  }

  update(g: Game, input: Input, dt: number): void {
    const s = this.stats;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.boltCd -= dt;
    this.slashCd = Math.max(0, this.slashCd - dt);
    this.novaCd = Math.max(0, this.novaCd - dt);
    this.slashT = Math.max(0, this.slashT - dt);
    if (this.dashCharges < s.dashCharges) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) {
        this.dashCharges++;
        this.dashRecharge = this.dashCharges < s.dashCharges ? s.dashCd : 0;
      }
    }
    if (s.regen > 0 && this.hp < s.maxHp) {
      this.regenAcc += s.regen * dt;
      if (this.regenAcc >= 1) {
        this.hp = Math.min(s.maxHp, this.hp + Math.floor(this.regenAcc));
        this.regenAcc %= 1;
      }
    }
    for (const a of this.afterimages) a.life -= dt;
    this.afterimages = this.afterimages.filter((a) => a.life > 0);

    // ---- abilities (pressed this frame)
    if (input.pressed('dash')) this.tryDash(g, input);
    if (input.pressed('slash') || (input.isHeld('slash') && this.slashCd <= 0)) this.trySlash(g);
    if (input.pressed('nova')) this.tryNova(g);

    // ---- movement
    let mx = input.moveX;
    let my = input.moveY;
    let speed = s.speed;
    if (this.dashT > 0) {
      this.dashT -= dt;
      mx = this.dashX;
      my = this.dashY;
      speed = s.dashDist / 0.16;
      if (Math.random() < 0.7) this.afterimages.push({ x: this.x, y: this.y, life: 0.25, flip: this.facing < 0 });
      if (s.dashBurst > 0) {
        for (const e of g.enemies) {
          if (!e.targetable || this.dashHit.has(e)) continue;
          if (dist(e.x, e.y, this.x, this.y) < e.r + 14) {
            this.dashHit.add(e);
            g.damageEnemy(e, s.dashBurst * s.dmgMult, { color: '#9ff', kx: this.dashX * 120, ky: this.dashY * 120 });
            g.fx.sparks(e.x, e.y, Math.random() * TAU, '#bff', 6);
            sfx('zap', 1.2);
          }
        }
      }
    }
    this.moving = Math.hypot(mx, my) > 0.05;
    this.vx = mx * speed;
    this.vy = my * speed;
    if (this.moving) {
      const res = moveBox(g.room, this.x, this.y, this.r, this.vx * dt, this.vy * dt, Mask.Player, true);
      this.x = res.x;
      this.y = res.y;
      this.walkT += dt * (speed / 60);
      this.stepT -= dt;
      if (this.stepT <= 0 && this.dashT <= 0) {
        this.stepT = 0.28;
        g.fx.dust(this.x, this.y + 9, 1);
      }
      if (Math.abs(mx) > 0.1) this.facing = mx < 0 ? -1 : 1;
    } else this.walkT = 0;

    // ---- auto-fire at the nearest visible enemy
    const target = this.findTarget(g, s.boltRange * 1.1);
    if (target) {
      this.aimAngle = angleTo(this.x, this.y, target.x, target.y);
      if (Math.abs(Math.cos(this.aimAngle)) > 0.25) this.facing = Math.cos(this.aimAngle) < 0 ? -1 : 1;
      if (this.boltCd <= 0) {
        this.boltCd = 1 / s.boltRate;
        this.fireBolt(g, this.aimAngle);
      }
    } else if (this.moving) this.aimAngle = Math.atan2(my, mx);
    if (this.boltCd < -0.1) this.boltCd = -0.1;

    this.updateNova(g, dt);
    this.updateOrbits(g, dt);
    this.updateSpheres(g, dt);
  }

  findTarget(g: Game, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const d = dist(this.x, this.y, e.x, e.y) - e.r;
      if (d < bestD && lineOfSight(g.room, this.x, this.y, e.x, e.y)) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private fireBolt(g: Game, angle: number): void {
    const s = this.stats;
    const n = s.boltCount;
    const spread = 0.16;
    for (let i = 0; i < n; i++) {
      const a = angle + (i - (n - 1) / 2) * spread;
      g.playerBolt(this.x + Math.cos(a) * 8, this.y - 2 + Math.sin(a) * 8, a, s.boltDmg);
    }
    sfx('shoot', 0.9 + Math.random() * 0.2, 0.05);
  }

  private trySlash(g: Game): void {
    const s = this.stats;
    if (this.slashCd > 0) return;
    this.slashCd = s.slashCd;
    // aim at a nearby enemy if there is one, otherwise where we're facing
    const near = this.findTarget(g, s.slashRange * 2.2);
    const a = near ? angleTo(this.x, this.y, near.x, near.y) : this.moving ? Math.atan2(this.vy, this.vx) : this.facing < 0 ? Math.PI : 0;
    this.slashAngle = a;
    this.slashT = 0.22;
    if (Math.abs(Math.cos(a)) > 0.2) this.facing = Math.cos(a) < 0 ? -1 : 1;
    sfx('slash');
    let hits = 0;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > s.slashRange + e.r) continue;
      if (d > e.r + 6 && Math.abs(angleDiff(a, angleTo(this.x, this.y, e.x, e.y))) > s.slashArc / 2) continue;
      const ka = angleTo(this.x, this.y, e.x, e.y);
      g.damageEnemy(e, s.slashDmg * s.dmgMult, { kx: Math.cos(ka) * 260, ky: Math.sin(ka) * 260, crit: Math.random() < s.crit, big: true });
      hits++;
    }
    // the blade deflects enemy bullets
    for (const b of g.bullets) {
      if (b.team !== 'enemy' || b.dead) continue;
      const d = dist(this.x, this.y, b.x, b.y);
      if (d < s.slashRange + 6 && Math.abs(angleDiff(a, angleTo(this.x, this.y, b.x, b.y))) < s.slashArc / 2 + 0.2) {
        b.dead = true;
        g.fx.sparks(b.x, b.y, angleTo(this.x, this.y, b.x, b.y), '#fff', 4);
      }
    }
    if (hits) {
      g.hitstop(0.05);
      g.shake(2.5);
    }
    if (s.slashWave > 0) g.playerWave(this.x, this.y, a, s.slashDmg * s.slashWave);
  }

  private tryNova(g: Game): void {
    const s = this.stats;
    if (this.novaCd > 0) return;
    this.novaCd = s.novaCd;
    this.novaT = s.novaDur;
    this.novaTick = 0;
    sfx('nova');
    g.fx.ring(this.x, this.y, 6, s.novaRadius, '#d9a0ff', 0.4, 4);
    g.shake(3);
    // the initial pulse wipes nearby bullets
    for (const b of g.bullets) if (b.team === 'enemy' && dist(this.x, this.y, b.x, b.y) < s.novaRadius) b.dead = true;
  }

  private updateNova(g: Game, dt: number): void {
    if (this.novaT <= 0) return;
    const s = this.stats;
    this.novaT -= dt;
    this.novaTick -= dt;
    if (this.novaTick > 0) return;
    this.novaTick = 0.25;
    let dealt = 0;
    for (const e of g.enemies) {
      if (!e.targetable) continue;
      if (dist(this.x, this.y, e.x, e.y) > s.novaRadius + e.r) continue;
      const dmg = s.novaDps * 0.25 * s.dmgMult;
      g.damageEnemy(e, dmg, { color: '#d9a0ff', noKnock: true, silent: true });
      e.slowT = 0.5;
      e.slowAmt = Math.max(e.slowAmt, 0.35);
      dealt += dmg;
      g.fx.burst(e.x, e.y, '#c58cff', 2, 40, 1.5, 0.4, true);
    }
    if (dealt > 0 && s.novaDrain > 0) {
      const healed = this.heal(dealt * s.novaDrain);
      if (healed >= 1) g.fx.text(this.x, this.y - 16, `+${Math.round(healed)}`, '#7dff8a', 7);
    }
  }

  private tryDash(g: Game, input: Input): void {
    if (this.dashCharges <= 0 || this.dashT > 0) return;
    if (this.dashCharges === this.stats.dashCharges) this.dashRecharge = this.stats.dashCd;
    this.dashCharges--;
    let dx = input.moveX;
    let dy = input.moveY;
    const m = Math.hypot(dx, dy);
    if (m < 0.1) {
      dx = this.facing;
      dy = 0;
    } else {
      dx /= m;
      dy /= m;
    }
    this.dashX = dx;
    this.dashY = dy;
    this.dashT = 0.16;
    this.invuln = Math.max(this.invuln, 0.3);
    this.dashHit.clear();
    sfx('dash');
    g.fx.dust(this.x, this.y + 8, 5);
  }

  private updateOrbits(g: Game, dt: number): void {
    const n = this.stats.orbits;
    if (!n) return;
    this.orbitAngle += dt * 3.2;
    for (const [e, t] of this.orbitHits) {
      if (t - dt <= 0) this.orbitHits.delete(e);
      else this.orbitHits.set(e, t - dt);
    }
    for (let i = 0; i < n; i++) {
      const [ox, oy] = this.orbitPos(i);
      for (const e of g.enemies) {
        if (!e.targetable || this.orbitHits.has(e)) continue;
        if (dist(ox, oy, e.x, e.y) < e.r + 6) {
          this.orbitHits.set(e, 0.45);
          const a = angleTo(this.x, this.y, e.x, e.y);
          g.damageEnemy(e, this.stats.boltDmg * 0.9 * this.stats.dmgMult, { kx: Math.cos(a) * 120, ky: Math.sin(a) * 120, color: '#ffd27a' });
        }
      }
      // orbs also eat bullets
      for (const b of g.bullets) if (b.team === 'enemy' && !b.dead && dist(ox, oy, b.x, b.y) < b.r + 5) b.dead = true;
    }
  }

  orbitPos(i: number): [number, number] {
    const a = this.orbitAngle + (TAU * i) / Math.max(1, this.stats.orbits);
    return [this.x + Math.cos(a) * 30, this.y + Math.sin(a) * 30];
  }

  spherePos(i: number, time: number): [number, number] {
    const side = i % 2 === 0 ? -1 : 1;
    return [this.x + side * 18 - this.facing * 4, this.y - 18 + Math.sin(time * 3 + i) * 3];
  }

  private updateSpheres(g: Game, dt: number): void {
    const n = this.stats.spheres;
    while (this.sphereCd.length < n) this.sphereCd.push(Math.random());
    for (let i = 0; i < n; i++) {
      this.sphereCd[i] -= dt;
      if (this.sphereCd[i] > 0) continue;
      const [sx, sy] = this.spherePos(i, g.time);
      const t = this.findTarget(g, 220);
      if (!t) continue;
      this.sphereCd[i] = 1.0;
      g.playerBolt(sx, sy, angleTo(sx, sy, t.x, t.y), this.stats.boltDmg * 0.9, '#ffe9a8');
    }
  }
}
