import { angleTo, clamp, dist, rand, TAU } from '../engine/math';
import { sfx } from '../engine/audio';
import { freeAt, lineOfSight, Mask, moveBox } from './collision';
import { TILE } from './dungeon';
import type { Game } from './game';
import type { BulletKind } from './projectiles';

export interface ShotDef {
  pattern: 'aim' | 'spread' | 'ring' | 'burst' | 'spiral' | 'lob' | 'homing';
  cd: number;
  speed: number;
  dmg: number;
  count?: number;
  spread?: number;
  windup?: number;
  range?: number;
  kind?: BulletKind;
  r?: number;
}

export type AI = 'chase' | 'erratic' | 'hop' | 'shooter' | 'charger' | 'leaper' | 'ghost' | 'summoner' | 'turret' | 'bomber' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  ai: AI;
  xp: number;
  cost: number;
  mask?: Mask;
  scale?: number;
  shot?: ShotDef;
  split?: [string, number];
  summon?: string;
  /** colour of the hit / death particles */
  blood?: string;
  /** keeps this distance band when it is a shooter / summoner */
  keep?: [number, number];
  /** light emitted (rgb string) */
  glow?: string;
}

const RED = '#a01818';
const GREEN = '#5fbf3a';
const BONE = '#d8d0b8';
const ICE = '#9fe6ff';
const FIRE = '#ff9a3c';
const ECTO = '#b9a7ff';

export const ENEMIES: Record<string, EnemyDef> = {
  rat: { id: 'rat', name: 'Rat', sprite: 'rat', hp: 14, speed: 78, dmg: 8, r: 8, ai: 'chase', xp: 2, cost: 1, blood: RED },
  bat: { id: 'bat', name: 'Bat', sprite: 'bat', hp: 10, speed: 92, dmg: 6, r: 8, ai: 'erratic', xp: 2, cost: 1, mask: Mask.Flyer, blood: RED },
  slime: { id: 'slime', name: 'Slime', sprite: 'slime', hp: 26, speed: 120, dmg: 10, r: 10, ai: 'hop', xp: 3, cost: 2, blood: GREEN },
  skeleton: { id: 'skeleton', name: 'Skeleton', sprite: 'skeleton', hp: 34, speed: 60, dmg: 12, r: 10, ai: 'chase', xp: 4, cost: 2, blood: BONE },
  goblin: {
    id: 'goblin',
    name: 'Goblin Archer',
    sprite: 'goblin',
    hp: 20,
    speed: 58,
    dmg: 8,
    r: 9,
    ai: 'shooter',
    xp: 4,
    cost: 2,
    blood: RED,
    keep: [90, 170],
    shot: { pattern: 'aim', cd: 2.1, speed: 170, dmg: 10, windup: 0.5, kind: 'arrow', r: 3 },
  },
  spider: { id: 'spider', name: 'Wolf Spider', sprite: 'spider', hp: 22, speed: 66, dmg: 10, r: 10, ai: 'leaper', xp: 3, cost: 2, blood: GREEN },
  jelly: { id: 'jelly', name: 'Acid Jelly', sprite: 'jelly', hp: 44, speed: 110, dmg: 12, r: 12, ai: 'hop', xp: 5, cost: 3, blood: '#ff4a3a', split: ['jelly_mini', 2] },
  jelly_mini: { id: 'jelly_mini', name: 'Jellyling', sprite: 'jelly', hp: 14, speed: 130, dmg: 7, r: 7, ai: 'hop', xp: 1, cost: 1, blood: '#ff4a3a', scale: 0.65 },
  snake: { id: 'snake', name: 'Moccasin', sprite: 'snake', hp: 22, speed: 86, dmg: 10, r: 9, ai: 'chase', xp: 3, cost: 2, blood: RED },
  kobold: {
    id: 'kobold',
    name: 'Kobold Slinger',
    sprite: 'kobold',
    hp: 26,
    speed: 62,
    dmg: 8,
    r: 9,
    ai: 'shooter',
    xp: 4,
    cost: 3,
    blood: RED,
    keep: [80, 160],
    shot: { pattern: 'spread', cd: 2.4, speed: 150, dmg: 9, count: 3, spread: 0.5, windup: 0.5 },
  },
  eye: {
    id: 'eye',
    name: 'Eye of Devastation',
    sprite: 'eye',
    hp: 32,
    speed: 34,
    dmg: 8,
    r: 10,
    ai: 'shooter',
    xp: 5,
    cost: 3,
    mask: Mask.Flyer,
    blood: GREEN,
    keep: [70, 200],
    glow: '160,255,120',
    shot: { pattern: 'ring', cd: 3, speed: 105, dmg: 9, count: 8, windup: 0.6 },
  },
  orc: { id: 'orc', name: 'Orc Brute', sprite: 'orc', hp: 70, speed: 52, dmg: 18, r: 12, ai: 'charger', xp: 7, cost: 4, blood: RED },
  zombie: { id: 'zombie', name: 'Zombie', sprite: 'zombie', hp: 60, speed: 38, dmg: 14, r: 10, ai: 'chase', xp: 4, cost: 2, blood: '#6a8a3a' },
  ghost: { id: 'ghost', name: 'Ghost', sprite: 'ghost', hp: 30, speed: 46, dmg: 12, r: 9, ai: 'ghost', xp: 4, cost: 3, mask: Mask.Ghost, blood: ECTO, glow: '200,200,255' },
  mummy: { id: 'mummy', name: 'Mummy', sprite: 'mummy', hp: 84, speed: 44, dmg: 16, r: 11, ai: 'chase', xp: 6, cost: 3, blood: BONE },
  skull: {
    id: 'skull',
    name: 'Curse Skull',
    sprite: 'skull',
    hp: 30,
    speed: 40,
    dmg: 10,
    r: 9,
    ai: 'shooter',
    xp: 5,
    cost: 3,
    mask: Mask.Flyer,
    blood: ECTO,
    keep: [80, 190],
    glow: '120,220,255',
    shot: { pattern: 'homing', cd: 2.6, speed: 95, dmg: 11, windup: 0.5, kind: 'skull', r: 4 },
  },
  necro: {
    id: 'necro',
    name: 'Necromancer',
    sprite: 'necro',
    hp: 46,
    speed: 50,
    dmg: 10,
    r: 10,
    ai: 'summoner',
    xp: 8,
    cost: 5,
    blood: RED,
    summon: 'skeleton',
    keep: [120, 220],
    shot: { pattern: 'aim', cd: 2.5, speed: 150, dmg: 10, windup: 0.3 },
  },
  vbat: { id: 'vbat', name: 'Vampire Bat', sprite: 'vbat', hp: 16, speed: 108, dmg: 8, r: 8, ai: 'erratic', xp: 2, cost: 1, mask: Mask.Flyer, blood: RED },
  phantom: { id: 'phantom', name: 'Phantom', sprite: 'phantom', hp: 36, speed: 62, dmg: 13, r: 9, ai: 'ghost', xp: 5, cost: 3, mask: Mask.Ghost, blood: ICE, glow: '150,230,255' },
  ice_beast: { id: 'ice_beast', name: 'Ice Beast', sprite: 'ice_beast', hp: 74, speed: 56, dmg: 18, r: 12, ai: 'charger', xp: 7, cost: 4, blood: ICE },
  white_imp: {
    id: 'white_imp',
    name: 'White Imp',
    sprite: 'white_imp',
    hp: 22,
    speed: 82,
    dmg: 8,
    r: 8,
    ai: 'erratic',
    xp: 3,
    cost: 2,
    mask: Mask.Flyer,
    blood: ICE,
    shot: { pattern: 'aim', cd: 2.4, speed: 160, dmg: 9, kind: 'shard' },
  },
  winter_orb: {
    id: 'winter_orb',
    name: 'Orb of Winter',
    sprite: 'winter_orb',
    hp: 44,
    speed: 30,
    dmg: 10,
    r: 10,
    ai: 'shooter',
    xp: 6,
    cost: 4,
    mask: Mask.Flyer,
    blood: ICE,
    keep: [60, 220],
    glow: '150,220,255',
    shot: { pattern: 'spiral', cd: 0.35, speed: 95, dmg: 9, count: 3, kind: 'shard', windup: 0 },
  },
  wolf: { id: 'wolf', name: 'Wolf', sprite: 'wolf', hp: 38, speed: 88, dmg: 12, r: 10, ai: 'charger', xp: 4, cost: 3, blood: RED },
  azure: { id: 'azure', name: 'Azure Jelly', sprite: 'azure', hp: 50, speed: 110, dmg: 12, r: 12, ai: 'hop', xp: 5, cost: 3, blood: ICE, split: ['azure_mini', 2] },
  azure_mini: { id: 'azure_mini', name: 'Azure Jellyling', sprite: 'azure', hp: 16, speed: 130, dmg: 7, r: 7, ai: 'hop', xp: 1, cost: 1, blood: ICE, scale: 0.65 },
  ice_devil: {
    id: 'ice_devil',
    name: 'Ice Devil',
    sprite: 'ice_devil',
    hp: 64,
    speed: 58,
    dmg: 14,
    r: 11,
    ai: 'shooter',
    xp: 7,
    cost: 4,
    blood: ICE,
    keep: [40, 140],
    shot: { pattern: 'burst', cd: 2.6, speed: 190, dmg: 10, count: 3, windup: 0.45, kind: 'shard' },
  },
  frost_cannon: {
    id: 'frost_cannon',
    name: 'Hoarfrost Cannon',
    sprite: 'frost_cannon',
    hp: 70,
    speed: 0,
    dmg: 10,
    r: 12,
    ai: 'turret',
    xp: 6,
    cost: 4,
    blood: ICE,
    shot: { pattern: 'spread', cd: 2.2, speed: 140, dmg: 10, count: 5, spread: 0.9, windup: 0.5, kind: 'shard' },
  },
  crimson_imp: { id: 'crimson_imp', name: 'Crimson Imp', sprite: 'crimson_imp', hp: 20, speed: 112, dmg: 10, r: 8, ai: 'bomber', xp: 3, cost: 2, mask: Mask.Flyer, blood: FIRE, glow: '255,120,60' },
  hell_hound: { id: 'hell_hound', name: 'Hell Hound', sprite: 'hell_hound', hp: 52, speed: 86, dmg: 16, r: 10, ai: 'charger', xp: 5, cost: 3, blood: FIRE },
  fire_elem: {
    id: 'fire_elem',
    name: 'Fire Elemental',
    sprite: 'fire_elem',
    hp: 46,
    speed: 64,
    dmg: 12,
    r: 10,
    ai: 'erratic',
    xp: 5,
    cost: 4,
    mask: Mask.Flyer,
    blood: FIRE,
    glow: '255,150,60',
    shot: { pattern: 'spread', cd: 2.6, speed: 140, dmg: 10, count: 5, spread: 0.8, kind: 'fire' },
  },
  red_devil: { id: 'red_devil', name: 'Red Devil', sprite: 'red_devil', hp: 76, speed: 70, dmg: 18, r: 11, ai: 'chase', xp: 6, cost: 3, blood: RED },
  fiend: {
    id: 'fiend',
    name: 'Brimstone Fiend',
    sprite: 'fiend',
    hp: 130,
    speed: 46,
    dmg: 20,
    r: 13,
    ai: 'shooter',
    xp: 12,
    cost: 6,
    blood: FIRE,
    keep: [70, 180],
    glow: '255,100,40',
    scale: 1.2,
    shot: { pattern: 'ring', cd: 2.6, speed: 120, dmg: 12, count: 14, windup: 0.7, kind: 'fire' },
  },
  mortar: {
    id: 'mortar',
    name: 'Hellfire Mortar',
    sprite: 'mortar',
    hp: 64,
    speed: 0,
    dmg: 10,
    r: 12,
    ai: 'turret',
    xp: 6,
    cost: 4,
    blood: FIRE,
    shot: { pattern: 'lob', cd: 2.4, speed: 0, dmg: 18, windup: 0.4 },
  },
  wisp: {
    id: 'wisp',
    name: 'Will-o-the-Wisp',
    sprite: 'wisp',
    hp: 24,
    speed: 74,
    dmg: 8,
    r: 8,
    ai: 'erratic',
    xp: 3,
    cost: 2,
    mask: Mask.Flyer,
    blood: '#c6ff6a',
    glow: '190,255,120',
    shot: { pattern: 'homing', cd: 2.2, speed: 90, dmg: 8, r: 3 },
  },
};

export type MoveMode = 'chase' | 'keep' | 'erratic' | 'hold' | 'drift' | 'charge' | 'hop' | 'flee';

export class Enemy {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  scale: number;
  mask: Mask;
  elite = false;
  boss = false;
  dead = false;
  // motion
  kx = 0; // knockback velocity
  ky = 0;
  vx = 0;
  vy = 0;
  z = 0; // height (hops/leaps)
  facing = 1;
  move: MoveMode = 'chase';
  moveMul = 1;
  chargeX = 0;
  chargeY = 0;
  chargeT = 0;
  bonked = false;
  hopT = 0;
  hopDur = 0;
  hopH = 0;
  wander = Math.random() * TAU;
  // status
  flash = 0;
  slowT = 0;
  slowAmt = 0;
  burnT = 0;
  burnDps = 0;
  burnTick = 0;
  tell = 0; // wind-up glow timer
  fade = 1; // ghost alpha
  spawnT = 0.6; // spawn-in animation
  contactCd = 0;
  spin = 0;
  age = Math.random() * 10;
  /** time the boss has been in its current phase etc. */
  phase = 0;
  name: string;
  private brain: Generator<number, void, unknown> | null = null;
  private wait = 0;

  constructor(
    public def: EnemyDef,
    x: number,
    y: number,
    floorScale: { hp: number; dmg: number },
    elite = false,
  ) {
    this.x = x;
    this.y = y;
    this.name = def.name;
    this.elite = elite;
    this.r = def.r * (elite ? 1.2 : 1);
    this.maxHp = this.hp = Math.round(def.hp * floorScale.hp * (elite ? 2.6 : 1));
    this.dmg = Math.round(def.dmg * floorScale.dmg * (elite ? 1.3 : 1));
    this.speed = def.speed * (elite ? 1.08 : 1);
    this.scale = (def.scale ?? 1) * (elite ? 1.25 : 1);
    this.mask = def.mask ?? Mask.Walker;
    this.boss = def.ai === 'boss';
    if (elite) this.name = `Elite ${def.name}`;
  }

  get targetable() {
    return !this.dead && this.spawnT <= 0 && this.fade > 0.5 && this.z < 6;
  }

  get flying() {
    return this.mask !== Mask.Walker;
  }

  update(g: Game, dt: number): void {
    this.age += dt;
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      return;
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    this.tell = Math.max(0, this.tell - dt);
    this.contactCd = Math.max(0, this.contactCd - dt);
    if (this.slowT > 0) this.slowT -= dt;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.33;
        g.damageEnemy(this, this.burnDps * 0.33, { color: FIRE, silent: true, noKnock: true });
        g.fx.burst(this.x, this.y - 4, FIRE, 2, 30, 1.5, 0.4, true);
      }
    }

    if (!this.brain) this.brain = this.makeBrain(g);
    this.wait -= dt;
    let guard = 0;
    while (this.wait <= 0 && this.brain && guard++ < 8) {
      const r = this.brain.next();
      if (r.done) this.brain = null;
      else this.wait += r.value;
    }

    this.locomote(g, dt);
  }

  // ------------------------------------------------------------ movement
  private locomote(g: Game, dt: number): void {
    const p = g.player;
    const slow = this.slowT > 0 ? 1 - this.slowAmt : 1;
    let sp = this.speed * this.moveMul * slow;
    let dx = 0;
    let dy = 0;
    const d = dist(this.x, this.y, p.x, p.y);
    const toP = angleTo(this.x, this.y, p.x, p.y);

    switch (this.move) {
      case 'chase': {
        if (this.mask !== Mask.Walker || (d < TILE * 3 && lineOfSight(g.room, this.x, this.y, p.x, p.y))) {
          dx = Math.cos(toP);
          dy = Math.sin(toP);
        } else {
          const f = g.flow.dir(this.x, this.y);
          if (f) [dx, dy] = f;
          else {
            dx = Math.cos(toP);
            dy = Math.sin(toP);
          }
        }
        break;
      }
      case 'keep': {
        const [lo, hi] = this.def.keep ?? [80, 160];
        this.wander += dt * 0.8;
        const strafe = toP + Math.PI / 2 * (Math.sin(this.wander) > 0 ? 1 : -1);
        let a = strafe;
        if (d > hi || !lineOfSight(g.room, this.x, this.y, p.x, p.y)) {
          const f = this.mask === Mask.Walker ? g.flow.dir(this.x, this.y) : null;
          a = f ? Math.atan2(f[1], f[0]) : toP;
        } else if (d < lo) a = toP + Math.PI + Math.sin(this.wander) * 0.6;
        dx = Math.cos(a);
        dy = Math.sin(a);
        sp *= d < lo || d > hi ? 1 : 0.5;
        break;
      }
      case 'erratic': {
        this.wander += rand(-6, 6) * dt;
        const a = toP + Math.sin(this.age * 3 + this.wander) * 1.1;
        dx = Math.cos(a);
        dy = Math.sin(a);
        if (this.def.shot && d < 70) {
          dx = -dx;
          dy = -dy;
        }
        break;
      }
      case 'drift':
        dx = Math.cos(toP);
        dy = Math.sin(toP);
        break;
      case 'flee':
        dx = -Math.cos(toP);
        dy = -Math.sin(toP);
        break;
      case 'charge':
        dx = this.chargeX;
        dy = this.chargeY;
        sp = this.speed * 4.2 * slow;
        this.chargeT -= dt;
        if (Math.random() < 0.5) g.fx.dust(this.x, this.y + this.r);
        break;
      case 'hop': {
        this.hopT += dt;
        const t = clamp(this.hopT / this.hopDur, 0, 1);
        this.z = Math.sin(t * Math.PI) * this.hopH;
        dx = this.chargeX;
        dy = this.chargeY;
        sp = this.speedOverride * slow;
        break;
      }
      case 'hold':
        break;
    }

    if (dx || dy) this.facing = dx < 0 ? -1 : 1;
    if (this.move !== 'charge' && this.move !== 'hop' && d < 200 && Math.abs(Math.cos(toP)) > 0.2) this.facing = Math.cos(toP) < 0 ? -1 : 1;

    // separation from other enemies so groups don't stack into one blob
    let sx = 0;
    let sy = 0;
    if (this.move !== 'charge') {
      for (const o of g.enemies) {
        if (o === this || o.dead || o.spawnT > 0) continue;
        const ox = this.x - o.x;
        const oy = this.y - o.y;
        const min = this.r + o.r;
        const dd = ox * ox + oy * oy;
        if (dd < min * min && dd > 0.01) {
          const k = (min - Math.sqrt(dd)) / min;
          sx += (ox / Math.sqrt(dd)) * k;
          sy += (oy / Math.sqrt(dd)) * k;
        }
      }
    }

    // knockback decays quickly; bosses barely budge
    const kRes = this.boss ? 0.15 : this.elite ? 0.6 : 1;
    const decay = Math.exp(-9 * dt);
    this.kx *= decay;
    this.ky *= decay;
    const mx = (dx * sp + sx * 60 + this.kx * kRes) * dt;
    const my = (dy * sp + sy * 60 + this.ky * kRes) * dt;
    if (mx || my) {
      const res = moveBox(g.room, this.x, this.y, this.r * 0.8, mx, my, this.mask);
      if (this.move === 'charge' && (res.hitX || res.hitY)) {
        this.chargeT = 0;
        this.bonked = true;
        g.shake(3);
        g.fx.dust(this.x, this.y, 8);
        sfx('stomp', 1, 0.1);
      }
      if (this.move === 'erratic' && (res.hitX || res.hitY)) this.wander += Math.PI;
      this.x = res.x;
      this.y = res.y;
    }
  }

  // ------------------------------------------------------------ helpers used by brains
  canSee(g: Game): boolean {
    return lineOfSight(g.room, this.x, this.y, g.player.x, g.player.y);
  }

  distToPlayer(g: Game): number {
    return dist(this.x, this.y, g.player.x, g.player.y);
  }

  aim(g: Game, lead = 0): number {
    const p = g.player;
    return angleTo(this.x, this.y, p.x + p.vx * lead, p.y + p.vy * lead);
  }

  startHop(g: Game, tx: number, ty: number, dur: number, height: number): void {
    const a = angleTo(this.x, this.y, tx, ty);
    const d = Math.min(dist(this.x, this.y, tx, ty), this.speed * dur);
    this.chargeX = Math.cos(a);
    this.chargeY = Math.sin(a);
    this.hopT = 0;
    this.hopDur = dur;
    this.hopH = height;
    this.move = 'hop';
    this.moveMul = 1;
    // hop speed so that the hop covers distance d
    this.speedOverride = d / dur;
    g.fx.dust(this.x, this.y + this.r * 0.6, 2);
  }

  speedOverride = 0;

  /** Fire the enemy's shot pattern (or a custom one) toward the player. */
  *fire(g: Game, shot: ShotDef, angle?: number): Generator<number, void, unknown> {
    const a = angle ?? this.aim(g, 0.15);
    const n = shot.count ?? 1;
    switch (shot.pattern) {
      case 'aim':
        g.enemyShot(this, a, shot);
        break;
      case 'homing':
        g.enemyShot(this, a, shot).homing = 1.6;
        break;
      case 'spread': {
        const s = shot.spread ?? 0.6;
        for (let i = 0; i < n; i++) g.enemyShot(this, a - s / 2 + (s * i) / Math.max(1, n - 1), shot);
        break;
      }
      case 'ring': {
        const off = Math.random() * TAU;
        for (let i = 0; i < n; i++) g.enemyShot(this, off + (TAU * i) / n, shot);
        break;
      }
      case 'spiral':
        this.spin += 0.37;
        for (let i = 0; i < n; i++) g.enemyShot(this, this.spin + (TAU * i) / n, shot);
        break;
      case 'burst':
        for (let i = 0; i < n; i++) {
          g.enemyShot(this, this.aim(g, 0.2), shot);
          yield 0.13;
        }
        break;
      case 'lob': {
        const p = g.player;
        for (let i = 0; i < n; i++) {
          const tx = p.x + p.vx * 0.6 + rand(-14, 14) * i;
          const ty = p.y + p.vy * 0.6 + rand(-14, 14) * i;
          g.lob(this.x, this.y, tx, ty, 26, shot.dmg, 1.0);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ brains
  private makeBrain(g: Game): Generator<number, void, unknown> {
    switch (this.def.ai) {
      case 'chase':
        return this.chaseBrain();
      case 'erratic':
        return this.erraticBrain(g);
      case 'hop':
        return this.hopBrain(g);
      case 'shooter':
        return this.shooterBrain(g);
      case 'charger':
        return this.chargerBrain(g);
      case 'leaper':
        return this.leaperBrain(g);
      case 'ghost':
        return this.ghostBrain(g);
      case 'summoner':
        return this.summonerBrain(g);
      case 'turret':
        return this.turretBrain(g);
      case 'bomber':
        return this.bomberBrain(g);
      case 'boss':
        return g.bossBrain(this);
    }
  }

  private *chaseBrain(): Generator<number, void, unknown> {
    this.move = 'chase';
    for (;;) yield 1;
  }

  private *erraticBrain(g: Game): Generator<number, void, unknown> {
    this.move = 'erratic';
    yield rand(0.5, 1.5);
    for (;;) {
      const shot = this.def.shot;
      if (!shot) {
        yield 1;
        continue;
      }
      yield shot.cd * rand(0.8, 1.2);
      if (this.distToPlayer(g) < 260 && this.canSee(g)) {
        this.tell = 0.35;
        yield 0.35;
        yield* this.fire(g, shot);
        sfx('enemyShoot', rand(0.9, 1.1), 0.08);
      }
    }
  }

  private *hopBrain(g: Game): Generator<number, void, unknown> {
    for (;;) {
      this.move = 'hold';
      this.z = 0;
      yield rand(0.45, 0.85);
      const p = g.player;
      this.startHop(g, p.x + rand(-20, 20), p.y + rand(-20, 20), 0.5, 10 + this.r);
      yield 0.5;
      this.z = 0;
      this.move = 'hold';
      g.fx.dust(this.x, this.y + this.r * 0.6, 4);
    }
  }

  private *shooterBrain(g: Game): Generator<number, void, unknown> {
    const shot = this.def.shot!;
    this.move = 'keep';
    yield rand(0.4, 1.4);
    for (;;) {
      if (shot.pattern === 'spiral') {
        // continuous spinner: spray while it can see the player
        if (this.canSee(g) && this.distToPlayer(g) < 260) {
          yield* this.fire(g, shot);
          sfx('enemyShoot', 1.4, 0.15);
        }
        yield shot.cd;
        continue;
      }
      yield shot.cd * rand(0.75, 1.15);
      if (!this.canSee(g) || this.distToPlayer(g) > (shot.range ?? 280)) continue;
      const w = shot.windup ?? 0.4;
      this.move = 'hold';
      this.tell = w;
      yield w;
      yield* this.fire(g, shot);
      sfx('enemyShoot', rand(0.85, 1.15), 0.06);
      yield 0.25;
      this.move = 'keep';
    }
  }

  private *chargerBrain(g: Game): Generator<number, void, unknown> {
    yield rand(0.3, 1);
    for (;;) {
      this.move = 'chase';
      this.moveMul = 1;
      while (!(this.distToPlayer(g) < 150 && this.canSee(g))) yield 0.2;
      this.move = 'hold';
      this.tell = 0.6;
      yield 0.55;
      const a = this.aim(g, 0.1);
      this.chargeX = Math.cos(a);
      this.chargeY = Math.sin(a);
      this.chargeT = 0.55;
      this.bonked = false;
      this.move = 'charge';
      sfx('dash', 0.7, 0.1);
      while (this.chargeT > 0) yield 0.03;
      this.move = 'hold';
      yield this.bonked ? 1.1 : 0.5;
    }
  }

  private *leaperBrain(g: Game): Generator<number, void, unknown> {
    for (;;) {
      this.move = 'chase';
      yield rand(1.2, 2.2);
      if (this.distToPlayer(g) < 160 && this.canSee(g)) {
        this.move = 'hold';
        this.tell = 0.35;
        yield 0.35;
        const p = g.player;
        this.startHop(g, p.x, p.y, 0.4, 20);
        this.speedOverride *= 1.15;
        yield 0.4;
        this.z = 0;
        this.move = 'hold';
        yield 0.35;
      }
    }
  }

  private *ghostBrain(g: Game): Generator<number, void, unknown> {
    for (;;) {
      this.move = 'drift';
      yield rand(2.5, 4);
      // fade out, reappear near the player
      this.move = 'hold';
      for (let i = 0; i < 8; i++) {
        this.fade = 1 - (i + 1) / 8;
        yield 0.04;
      }
      const p = g.player;
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU;
        const r = rand(55, 85);
        const nx = p.x + Math.cos(a) * r;
        const ny = p.y + Math.sin(a) * r;
        if (nx > TILE && ny > TILE && nx < g.room.pw - TILE && ny < g.room.ph - TILE) {
          this.x = nx;
          this.y = ny;
          break;
        }
      }
      for (let i = 0; i < 8; i++) {
        this.fade = (i + 1) / 8;
        yield 0.05;
      }
      this.tell = 0.3;
      yield 0.3;
    }
  }

  private *summonerBrain(g: Game): Generator<number, void, unknown> {
    this.move = 'keep';
    yield rand(1, 2);
    for (;;) {
      const minions = g.enemies.filter((e) => !e.dead && e.def.id === this.def.summon).length;
      if (minions < 3) {
        this.move = 'hold';
        this.tell = 0.7;
        yield 0.7;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU;
          const sx = this.x + Math.cos(a) * 30;
          const sy = this.y + Math.sin(a) * 30;
          if (freeAt(g.room, sx, sy, 10, Mask.Walker)) g.spawnEnemy(this.def.summon!, sx, sy, { noDrops: true });
        }
        sfx('spawn', 0.8);
        this.move = 'keep';
        yield 1.5;
      }
      if (this.def.shot && this.canSee(g)) {
        this.tell = 0.3;
        yield 0.3;
        yield* this.fire(g, this.def.shot);
        sfx('enemyShoot', 0.8, 0.06);
      }
      yield 2.2;
    }
  }

  private *turretBrain(g: Game): Generator<number, void, unknown> {
    const shot = this.def.shot!;
    this.move = 'hold';
    yield rand(0.5, 1.5);
    for (;;) {
      yield shot.cd * rand(0.85, 1.15);
      if (shot.pattern !== 'lob' && !this.canSee(g)) continue;
      this.tell = shot.windup ?? 0.4;
      yield this.tell;
      yield* this.fire(g, shot);
      sfx(shot.pattern === 'lob' ? 'stomp' : 'enemyShoot', 0.7, 0.06);
    }
  }

  private *bomberBrain(g: Game): Generator<number, void, unknown> {
    this.move = 'chase';
    this.moveMul = 1;
    yield rand(0.2, 0.6);
    for (;;) {
      while (this.distToPlayer(g) > 30) yield 0.08;
      this.move = 'hold';
      this.tell = 0.55;
      sfx('zap', 0.6, 0.1);
      yield 0.55;
      g.explode(this.x, this.y, 46, this.dmg * 2.2, 'enemy', '#ff7a2a');
      this.hp = 0;
      g.killEnemy(this, true);
      return;
    }
  }
}
