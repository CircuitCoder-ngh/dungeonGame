import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { setMusic, sfx } from '../engine/audio';
import type { Input } from '../engine/input';
import { angleTo, clamp, damp, dist, rand, Rng, TAU } from '../engine/math';
import { BOSSES, bossBrain } from './bosses';
import { FlowField, freeAt, Mask } from './collision';
import { DOOR, Feature, Floor, opposite, Room, TILE } from './dungeon';
import { Effects, Hazard } from './effects';
import { Enemy, ENEMIES, ShotDef } from './enemies';
import { Player } from './player';
import { clearRun, meta, metaLevel, RunSave, saveMeta, saveRun, saveStats, settings, stats } from './profile';
import { Bullet } from './projectiles';
import { BOSS_STORY, ENDLESS_LINE, FLOOR_STORY, HERO_STORY, HINTS, Line, maren } from './story';
import { FLOORS_TO_WIN } from './themes';
import { rollUpgrades, Upgrade, UPGRADE_BY_ID } from './upgrades';

export type GameState = 'menu' | 'play' | 'paused' | 'modal' | 'dead' | 'victory';

export interface Pickup {
  kind: 'xp' | 'gold' | 'potion';
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  age: number;
  pulled: boolean;
}

export interface ShopItem {
  kind: 'potion' | 'upgrade' | 'vitality';
  upgrade?: string;
  price: number;
  sold: boolean;
}

export interface RunSummary {
  hero: string;
  floor: number;
  kills: number;
  level: number;
  time: number;
  souls: number;
  victory: boolean;
  bossKills: number;
}

/** Callbacks into the DOM menu layer. */
export interface UIHooks {
  levelUp(options: Upgrade[], title: string, onPick: (u: Upgrade | null) => void, canSkip?: boolean): void;
  shop(items: ShopItem[], buy: (i: number) => boolean): void;
  pause(): void;
  dead(summary: RunSummary, canRevive: boolean): void;
  victory(summary: RunSummary): void;
  banner(title: string, sub?: string): void;
  bossBar(e: Enemy | null): void;
  say(line: Line, delay?: number, urgent?: boolean): void;
  ending(heroId: string, done: () => void): void;
}

interface Lob {
  x0: number;
  y0: number;
  hz: Hazard;
}

export class Game {
  state: GameState = 'menu';
  time = 0; // run time (s)
  rng = new Rng(Date.now());
  player!: Player;
  floor!: Floor;
  room!: Room;
  flow!: FlowField;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  hazards: Hazard[] = [];
  lobs: Lob[] = [];
  pickups: Pickup[] = [];
  fx = new Effects();

  floorNum = 1;
  seed = 0;
  gold = 0;
  xp = 0;
  level = 1;
  kills = 0;
  bossKills = 0;
  revived = false;
  endless = false;
  soulsBanked = 0;
  pendingLevels = 0;
  wave = 0;
  boss: Enemy | null = null;

  // camera / presentation
  camX = 0;
  camY = 0;
  viewW = 640;
  viewH = 360;
  shakeAmt = 0;
  freeze = 0;
  slowmo = 1;
  fade = 0; // 0 = clear, 1 = black
  private fadeDir = 0;
  private fadeAction: (() => void) | null = null;
  private featureLock = false;
  private clearDelay = 0;
  private spawnDelay = 0;
  combo = 0;
  comboT = 0;
  /** Maren's spirit: a wisp that floats by the hero and leads the way */
  wisp = { x: 0, y: 0, guiding: false };

  constructor(
    public input: Input,
    public ui: UIHooks,
  ) {}

  // ================================================================ run lifecycle
  newRun(heroId: string): void {
    this.endless = false;
    this.seed = (Math.random() * 2 ** 31) | 0;
    this.player = new Player(heroId);
    this.gold = metaLevel('greed') * 15;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.bossKills = 0;
    this.time = 0;
    this.revived = false;
    this.soulsBanked = 0;
    stats.runs++;
    saveStats();
    this.enterFloor(1);
  }

  continueRun(s: RunSave): void {
    this.seed = s.seed;
    this.player = new Player(s.hero, s.upgrades);
    this.player.hp = Math.min(s.hp, this.player.stats.maxHp);
    this.gold = s.gold;
    this.xp = s.xp;
    this.level = s.level;
    this.kills = s.kills;
    this.bossKills = s.bossKills ?? 0;
    this.time = s.time;
    this.revived = s.revived;
    this.soulsBanked = s.souls;
    this.endless = s.floor > FLOORS_TO_WIN;
    this.enterFloor(s.floor);
  }

  private checkpoint(): void {
    saveRun({
      hero: this.player.hero.id,
      floor: this.floorNum,
      seed: this.seed,
      hp: Math.ceil(this.player.hp),
      gold: this.gold,
      xp: this.xp,
      level: this.level,
      upgrades: this.player.upgrades,
      kills: this.kills,
      time: this.time,
      revived: this.revived,
      souls: this.soulsBanked,
      bossKills: this.bossKills,
    });
  }

  get floorScale() {
    const f = this.floorNum - 1;
    const extra = Math.max(0, this.floorNum - FLOORS_TO_WIN);
    return { hp: 1 + f * 0.42 + extra * extra * 0.08, dmg: 1 + f * 0.14 + extra * 0.06 };
  }

  enterFloor(n: number): void {
    this.floorNum = n;
    this.floor = new Floor(n, this.seed + n * 7919);
    this.rng = new Rng(this.seed + n * 104729);
    this.enterRoom(this.floor.start, -1);
    this.state = 'play';
    this.checkpoint();
    const t = this.floor.theme;
    this.ui.banner(`Floor ${n}`, t.name);
    setMusic(t.id, false);
    if (n > stats.bestFloor) {
      stats.bestFloor = n;
      saveStats();
    }
    this.arrivalDialogue(n);
  }

  /** Maren (and the hero) speak on reaching a floor; the full speech only the first time. */
  private arrivalDialogue(n: number): void {
    const p = this.player;
    const hs = HERO_STORY[p.hero.id];
    const idx = (n - 1) % FLOOR_STORY.length;
    const heroLine: Line = { speaker: p.hero.person, portrait: p.hero.sprite, text: hs.arrive[idx], color: '#ffe2b0' };
    if (n > FLOORS_TO_WIN) {
      this.ui.say(ENDLESS_LINE, 1.6);
      return;
    }
    const first = !stats.storyFloors.includes(n);
    if (first) {
      stats.storyFloors.push(n);
      saveStats();
      FLOOR_STORY[idx].lines.forEach((l, i) => this.ui.say(maren(l), i === 0 ? 1.6 : 0));
      this.ui.say(heroLine);
    } else this.ui.say(heroLine, 1.6);
  }

  /** Show a one-time piece of guidance from Maren. */
  hint(id: string): void {
    if (stats.hints.includes(id) || !HINTS[id]) return;
    stats.hints.push(id);
    saveStats();
    this.ui.say(maren(HINTS[id]), 0, true);
  }

  enterRoom(room: Room, fromDir: number): void {
    if (this.room) {
      // leave loose pickups where they were
      this.room.leftovers = this.pickups;
    }
    this.room = room;
    this.flow = new FlowField(room);
    this.enemies = [];
    this.bullets = [];
    this.hazards = [];
    this.lobs = [];
    this.fx.clear();
    this.pickups = (room.leftovers as Pickup[]) ?? [];
    room.leftovers = [];
    room.visited = room.known = true;
    for (let d = 0; d < 4; d++) {
      const nb = room.doors[d] ? this.floor.neighbor(room, d) : undefined;
      if (nb && (room.cleared || room.kind === 'start')) nb.known = true;
    }
    const p = this.player;
    if (fromDir >= 0) [p.x, p.y] = room.doorEntry(opposite(fromDir));
    else {
      p.x = room.pw / 2;
      p.y = room.ph / 2 + TILE;
    }
    p.dashT = 0;
    this.wisp.x = p.x;
    this.wisp.y = p.y - 24;
    this.featureLock = false;
    this.snapCamera();
    this.boss = null;
    this.ui.bossBar(null);
    this.wave = 0;

    if (room.kind === 'treasure') this.hint('treasure');
    else if (room.kind === 'shop') this.hint('shop');
    else if (room.kind === 'fountain') this.hint('fountain');
    if (room.kind !== 'boss' && !this.floor.boss.cleared && room.doors.some((open, d) => open && this.floor.neighbor(room, d) === this.floor.boss)) this.hint('bossdoor');

    if (!room.cleared) {
      room.locked = true;
      this.spawnDelay = 0.35;
      if (room.kind === 'combat') this.hint('locked');
      if (room.kind === 'boss') {
        const def = BOSSES[this.floor.theme.boss];
        this.ui.banner(def.name, def.title);
        setMusic(this.floor.theme.id, true);
        sfx('roar');
        this.shake(5);
      }
    } else if (room.kind !== 'boss') setMusic(this.floor.theme.id, false);
  }

  // ================================================================ spawning
  private spawnWave(): void {
    const room = this.room;
    this.wave++;
    if (room.kind === 'boss') {
      const def = BOSSES[this.floor.theme.boss];
      const e = this.spawnEnemy(def.id, room.pw / 2, room.ph * 0.36, { noDrops: false });
      e.spawnT = 1.2;
      this.boss = e;
      this.ui.bossBar(e);
      const story = BOSS_STORY[def.id];
      if (story) this.ui.say({ speaker: def.name, portrait: def.sprite, text: story.taunt, color: '#ff9a7a' }, 0.8, true);
      return;
    }
    const theme = this.floor.theme;
    const gridDist = Math.abs(room.gx) + Math.abs(room.gy);
    const loopBonus = Math.floor((this.floorNum - 1) / FLOORS_TO_WIN) * 3;
    let budget = (5 + this.floorNum * 1.6 + (room.w * room.h) / 55 + gridDist * 0.6 + loopBonus) * (room.waves > 1 ? 0.62 : 1);
    // early rooms of floor 1 are gentler
    if (this.floorNum === 1) budget *= gridDist <= 1 ? 0.6 : 0.85;
    const pool = theme.enemies.map((id) => ENEMIES[id]);
    const p = this.player;
    let guard = 0;
    let count = 0;
    while (budget > 0 && guard++ < 60 && count < 14) {
      const def = this.rng.weighted(pool, (d) => (d.cost <= budget ? 1 / Math.sqrt(d.cost) : 0) + 0.0001);
      if (def.cost > budget && count > 0) break;
      const elite = this.rng.chance(0.04 + this.floorNum * 0.025) && def.cost >= 2;
      budget -= def.cost * (elite ? 2.5 : 1);
      const pos = room.randomFloorPos(this.rng, p.x, p.y, 120, 2) ?? room.randomFloorPos(this.rng, p.x, p.y, 60, 1);
      if (!pos) continue;
      const e = this.spawnEnemy(def.id, pos[0], pos[1], { elite });
      e.spawnT = 0.6 + count * 0.06;
      count++;
    }
    sfx('spawn');
  }

  spawnEnemy(id: string, x: number, y: number, opts: { elite?: boolean; noDrops?: boolean } = {}): Enemy {
    const def = ENEMIES[id];
    const e = new Enemy(def, x, y, this.floorScale, !!opts.elite);
    if (opts.elite) this.hint('elite');
    if (opts.noDrops) (e as Enemy & { noDrops?: boolean }).noDrops = true;
    this.enemies.push(e);
    this.fx.ring(x, y, 4, 22, '#b07cff', 0.5, 2);
    return e;
  }

  // ================================================================ combat
  playerBolt(x: number, y: number, a: number, dmg: number, color?: string): Bullet {
    const s = this.player.stats;
    const b = new Bullet(x, y, a, s.boltSpeed);
    b.team = 'player';
    b.kind = 'bolt';
    b.dmg = dmg * s.dmgMult;
    b.r = 3 * s.boltSize;
    b.life = s.boltRange / s.boltSpeed;
    b.pierce = s.boltPierce;
    b.bounce = s.boltBounce;
    b.homing = s.boltHoming;
    b.explode = s.boltExplode;
    b.color = color ?? this.player.hero.color;
    b.crit = Math.random() < s.crit;
    if (b.crit) b.dmg *= s.critMult;
    this.bullets.push(b);
    return b;
  }

  playerWave(x: number, y: number, a: number, dmg: number): void {
    const b = new Bullet(x + Math.cos(a) * 12, y + Math.sin(a) * 12, a, 230);
    b.team = 'player';
    b.kind = 'wave';
    b.dmg = dmg * this.player.stats.dmgMult;
    b.r = 11;
    b.life = 0.55;
    b.pierce = 99;
    b.color = '#ff9a3c';
    b.procs = false;
    this.bullets.push(b);
  }

  enemyShot(e: Enemy, a: number, shot: ShotDef): Bullet {
    const b = new Bullet(e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6, a, shot.speed);
    b.team = 'enemy';
    b.kind = shot.kind ?? 'orb';
    b.dmg = shot.dmg * (e.boss ? 1 : this.floorScale.dmg) * (e.elite ? 1.25 : 1);
    b.r = shot.r ?? 4;
    b.life = 4;
    b.color = shot.kind === 'fire' ? '#ff9a3c' : shot.kind === 'shard' ? '#9fe6ff' : shot.kind === 'skull' ? '#c77dff' : this.floor.theme.bullet;
    if (b.kind === 'skull') b.ghost = false;
    this.bullets.push(b);
    return b;
  }

  addHazard(h: Partial<Hazard> & { x: number; y: number }): Hazard {
    const hz: Hazard = { kind: 'circle', r: 20, angle: 0, len: 0, delay: 1, t: 0, dmg: 10, color: 'rgba(255,60,60,0.4)', fired: false, linger: 0, ...h };
    this.hazards.push(hz);
    return hz;
  }

  /** A lobbed projectile that lands at (tx,ty) after `delay`, telegraphed by a circle. */
  lob(x0: number, y0: number, tx: number, ty: number, r: number, dmg: number, delay: number, color = '#ff7a2a'): void {
    tx = clamp(tx, TILE * 1.2, this.room.pw - TILE * 1.2);
    ty = clamp(ty, TILE * 1.2, this.room.ph - TILE * 1.2);
    const hz = this.addHazard({
      x: tx,
      y: ty,
      r,
      delay,
      dmg,
      color,
      onFire: () => {
        this.fx.burst(tx, ty, color, 14, 110, 2.5, 0.5, true);
        this.fx.ring(tx, ty, 4, r + 6, color, 0.3, 3);
        this.shake(2);
        sfx('explode', 1, 0.08);
      },
    });
    this.lobs.push({ x0, y0, hz });
  }

  explode(x: number, y: number, r: number, dmg: number, team: 'player' | 'enemy', color: string): void {
    this.fx.burst(x, y, color, 18, 140, 2.5, 0.5, true);
    this.fx.ring(x, y, 4, r, color, 0.3, 4);
    sfx('explode', 1, 0.06);
    this.shake(team === 'enemy' ? 5 : 2);
    if (team === 'player') {
      for (const e of this.enemies)
        if (e.targetable && dist(x, y, e.x, e.y) < r + e.r) {
          const a = angleTo(x, y, e.x, e.y);
          this.damageEnemy(e, dmg, { kx: Math.cos(a) * 150, ky: Math.sin(a) * 150, silent: true, color });
        }
    } else if (dist(x, y, this.player.x, this.player.y) < r + this.player.r) this.hurtPlayer(dmg, x, y);
  }

  damageEnemy(
    e: Enemy,
    dmg: number,
    o: { kx?: number; ky?: number; crit?: boolean; color?: string; silent?: boolean; noKnock?: boolean; big?: boolean } = {},
  ): void {
    if (e.dead) return;
    let amount = dmg;
    if (o.crit) amount *= this.player.stats.critMult;
    amount = Math.max(1, Math.round(amount));
    e.hp -= amount;
    e.flash = 1;
    if (!o.noKnock) {
      e.kx += o.kx ?? 0;
      e.ky += o.ky ?? 0;
    }
    if (settings.damageNumbers && !(o.silent && amount < 6)) this.fx.text(e.x, e.y - e.r - 4, String(amount), o.crit ? '#ffd23a' : o.color && o.silent ? o.color : '#fff', o.crit || o.big ? 9 : 7);
    if (!o.silent) {
      sfx(o.crit ? 'crit' : 'hit', 1, 0.04);
      this.fx.burst(e.x, e.y, e.def.blood ?? '#a01818', o.big ? 7 : 3, 70, 2, 0.4);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e: Enemy, silent = false): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    stats.kills++;
    this.combo++;
    this.comboT = 2.5;
    if (!silent) sfx('kill', e.boss ? 0.5 : rand(0.85, 1.15), 0.03);
    this.fx.gore(e.x, e.y, e.def.blood ?? '#a01818', e.boss ? 60 : e.elite ? 20 : 10);
    this.fx.burst(e.x, e.y, '#fff', 4, 60, 1.5, 0.3, true);
    if (e.def.split) {
      const [id, n] = e.def.split;
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n + rand(-0.3, 0.3);
        const nx = e.x + Math.cos(a) * 10;
        const ny = e.y + Math.sin(a) * 10;
        if (freeAt(this.room, nx, ny, 6, Mask.Walker)) {
          const m = this.spawnEnemy(id, nx, ny, {});
          m.spawnT = 0;
          m.kx = Math.cos(a) * 160;
          m.ky = Math.sin(a) * 160;
        }
      }
    }
    const s = this.player.stats;
    if (s.killHeal) this.player.heal(s.killHeal);
    if (!(e as Enemy & { noDrops?: boolean }).noDrops) this.dropLoot(e);
    if (e.boss) this.onBossDefeated(e);
  }

  private dropLoot(e: Enemy): void {
    const xpTotal = Math.round(e.def.xp * (1 + (this.floorNum - 1) * 0.3) * (e.elite ? 3 : 1));
    // split XP into a few orbs for a satisfying shower
    let left = xpTotal;
    while (left > 0) {
      const v = Math.min(left, left > 20 ? 10 : left > 6 ? 3 : 1);
      left -= v;
      this.addPickup('xp', e.x, e.y, v);
    }
    const goldChance = e.boss ? 1 : e.elite ? 1 : 0.28;
    if (Math.random() < goldChance) {
      const amount = Math.round((e.boss ? 40 : e.elite ? 8 : rand(1, 3)) * (1 + this.floorNum * 0.15));
      const coins = e.boss ? 10 : e.elite ? 3 : 1;
      for (let i = 0; i < coins; i++) this.addPickup('gold', e.x, e.y, Math.max(1, Math.round(amount / coins)));
    }
    const potionChance = e.boss ? 1 : e.elite ? 0.35 : 0.025;
    if (Math.random() < potionChance) this.addPickup('potion', e.x, e.y, 0.3);
  }

  addPickup(kind: Pickup['kind'], x: number, y: number, value: number): void {
    const a = Math.random() * TAU;
    const s = rand(30, 110);
    this.pickups.push({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, value, age: 0, pulled: false });
  }

  hurtPlayer(dmg: number, sx: number, sy: number): void {
    const p = this.player;
    if (p.invuln > 0 || p.dead || this.state !== 'play') return;
    const amount = Math.max(1, Math.round(dmg * (1 - p.stats.armor)));
    p.hp -= amount;
    p.invuln = 0.75;
    p.hurtFlash = 1;
    this.fx.text(p.x, p.y - 14, `-${amount}`, '#ff5050', 8);
    this.fx.burst(p.x, p.y, '#c02020', 8, 90, 2, 0.4);
    this.shake(6);
    this.hitstop(0.06);
    sfx('hurt');
    vibrate(45);
    // brief knock away from the source
    const a = angleTo(sx, sy, p.x, p.y);
    const res = this.moveSafe(p.x, p.y, Math.cos(a) * 10, Math.sin(a) * 10);
    p.x = res[0];
    p.y = res[1];
    if (p.hp <= 0) this.onPlayerDeath();
    else if (p.hp < p.stats.maxHp * 0.3) this.hint('lowhp');
  }

  private moveSafe(x: number, y: number, dx: number, dy: number): [number, number] {
    if (freeAt(this.room, x + dx, y + dy, this.player.r, Mask.Player)) return [x + dx, y + dy];
    return [x, y];
  }

  hitstop(t: number): void {
    this.freeze = Math.max(this.freeze, t);
  }

  shake(n: number): void {
    if (settings.shake) this.shakeAmt = Math.max(this.shakeAmt, n);
  }

  bossBrain(e: Enemy) {
    return bossBrain(e, this);
  }

  bossEnrage(e: Enemy): void {
    sfx('roar', 1.3);
    this.shake(8);
    this.fx.ring(e.x, e.y, 10, 120, '#ff3030', 0.6, 5);
    this.ui.banner('', `${e.def.name} is enraged!`);
    const story = BOSS_STORY[e.def.id];
    if (story) this.ui.say({ speaker: e.def.name, portrait: e.def.sprite, text: story.enrage, color: '#ff9a7a' }, 0, true);
    for (const b of this.bullets) if (b.team === 'enemy') b.dead = true;
  }

  private onBossDefeated(e: Enemy): void {
    this.bossKills++;
    stats.bossKills++;
    saveStats();
    this.boss = null;
    this.ui.bossBar(null);
    const story = BOSS_STORY[e.def.id];
    if (story) this.ui.say(maren(story.defeat), 1.2, true);
    this.slowmo = 0.25;
    this.shake(12);
    sfx('explode');
    for (let i = 0; i < 6; i++) this.fx.ring(e.x, e.y, 10, 60 + i * 30, e.def.blood ?? '#fff', 0.4 + i * 0.12, 4);
    for (const m of this.enemies) if (!m.dead && m !== e) this.killEnemy(m, true);
    for (const b of this.bullets) if (b.team === 'enemy') b.dead = true;
    this.hazards = [];
    this.lobs = [];
  }

  private onPlayerDeath(): void {
    const p = this.player;
    p.hp = 0;
    if (!this.revived && metaLevel('revive') > 0) {
      this.revived = true;
      p.hp = Math.round(p.stats.maxHp * 0.5);
      p.invuln = 2.5;
      this.ui.banner('', 'Second Wind!');
      sfx('levelup');
      this.fx.ring(p.x, p.y, 6, 120, '#7dff8a', 0.6, 5);
      for (const e of this.enemies) {
        const a = angleTo(p.x, p.y, e.x, e.y);
        e.kx += Math.cos(a) * 400;
        e.ky += Math.sin(a) * 400;
      }
      for (const b of this.bullets) if (b.team === 'enemy') b.dead = true;
      return;
    }
    p.dead = true;
    this.state = 'dead';
    this.slowmo = 0.3;
    sfx('death');
    vibrate([60, 40, 120]);
    this.fx.gore(p.x, p.y, '#c02020', 40);
    setTimeout(() => this.finishRun(false), 1300);
  }

  /** End of run: bank souls and show the summary. */
  finishRun(victory: boolean): void {
    // souls may already have been banked for this run (victory, then endless)
    const souls = Math.max(0, this.soulsEarned(victory) - this.soulsBanked);
    this.soulsBanked += souls;
    meta.souls += souls;
    saveMeta();
    clearRun();
    if (victory) {
      stats.wins++;
      if (!stats.bestTime || this.time < stats.bestTime) stats.bestTime = Math.round(this.time);
    }
    saveStats();
    const summary: RunSummary = {
      hero: this.player.hero.id,
      floor: this.floorNum,
      kills: this.kills,
      level: this.level,
      time: this.time,
      souls,
      victory,
      bossKills: this.bossKills,
    };
    if (victory) this.ui.victory(summary);
    else this.ui.dead(summary, false);
  }

  continueEndless(): void {
    this.endless = true;
    this.player.dead = false;
    this.enterFloor(this.floorNum + 1);
  }

  soulsEarned(victory: boolean): number {
    return Math.round(this.kills * 0.2 + (this.floorNum - 1) * 10 + this.bossKills * 15 + (victory ? 60 : 0));
  }

  // ================================================================ progression
  xpNeeded(level = this.level): number {
    const l = level - 1;
    return Math.round(10 + l * 9 + l * l * 1.6);
  }

  private gainXp(v: number): void {
    this.xp += v * this.player.stats.xpMult;
    while (this.xp >= this.xpNeeded()) {
      this.xp -= this.xpNeeded();
      this.level++;
      this.pendingLevels++;
    }
  }

  private openLevelUp(): void {
    if (this.pendingLevels <= 0 || this.state !== 'play') return;
    this.pendingLevels--;
    sfx('levelup');
    vibrate(20);
    this.fx.ring(this.player.x, this.player.y, 6, 60, '#ffe066', 0.5, 3);
    const n = metaLevel('choice') > 0 ? 4 : 3;
    const opts = rollUpgrades(this.player.upgrades, n, () => this.rng.next());
    if (!opts.length) return;
    this.state = 'modal';
    this.ui.levelUp(opts, `Level ${this.level - this.pendingLevels}`, (u) => {
      if (u) this.takeUpgrade(u);
      this.hint('levelup');
      this.state = 'play';
      this.input.reset();
    });
  }

  takeUpgrade(u: Upgrade): void {
    this.player.upgrades.push(u.id);
    this.player.recompute();
  }

  // ================================================================ features
  private useFeature(f: Feature): void {
    const p = this.player;
    switch (f.kind) {
      case 'stairs':
        sfx('stairs');
        this.transition(() => {
          if (this.floorNum === FLOORS_TO_WIN && !this.endless) {
            this.state = 'victory';
            this.ui.ending(this.player.hero.id, () => this.finishRun(true));
          } else this.enterFloor(this.floorNum + 1);
        });
        break;
      case 'fountain':
        if (f.used) return;
        f.used = true;
        p.heal(p.stats.maxHp * 0.6);
        sfx('heal');
        this.fx.burst(f.x, f.y, '#7fdcff', 24, 90, 2.5, 0.8, true);
        this.ui.banner('', 'The waters restore you');
        break;
      case 'orb': {
        if (f.used) return;
        const opts = rollUpgrades(p.upgrades, 3, () => this.rng.next(), 'rare');
        this.state = 'modal';
        sfx('levelup');
        this.ui.levelUp(
          opts,
          'Treasure',
          (u) => {
            if (u) {
              this.takeUpgrade(u);
              f.used = true;
              this.fx.burst(f.x, f.y, '#ffd86a', 30, 120, 2.5, 0.8, true);
            }
            this.state = 'play';
            this.input.reset();
          },
          true,
        );
        break;
      }
      case 'shop': {
        const items = this.shopStock(f);
        this.state = 'modal';
        this.ui.shop(items, (i) => this.buy(items[i]));
        break;
      }
    }
  }

  private shopCache = new WeakMap<Feature, ShopItem[]>();

  private shopStock(f: Feature): ShopItem[] {
    let items = this.shopCache.get(f);
    if (!items) {
      const scale = 1 + (this.floorNum - 1) * 0.45;
      const ups = rollUpgrades(this.player.upgrades, 3, () => this.rng.next());
      items = [
        { kind: 'potion', price: Math.round(18 * scale), sold: false },
        ...ups.map((u) => ({ kind: 'upgrade' as const, upgrade: u.id, price: Math.round((u.rarity === 'epic' ? 75 : u.rarity === 'rare' ? 55 : 38) * scale), sold: false })),
        { kind: 'vitality', price: Math.round(30 * scale), sold: false },
      ];
      this.shopCache.set(f, items);
    }
    return items;
  }

  private buy(item: ShopItem): boolean {
    if (item.sold || this.gold < item.price) {
      sfx('deny');
      return false;
    }
    this.gold -= item.price;
    item.sold = true;
    sfx('buy');
    const p = this.player;
    if (item.kind === 'potion') p.heal(p.stats.maxHp * 0.5);
    else if (item.kind === 'vitality') {
      p.upgrades.push('vitality');
      p.recompute();
    } else if (item.upgrade) {
      const u = UPGRADE_BY_ID.get(item.upgrade);
      if (u) this.takeUpgrade(u);
    }
    return true;
  }

  closeModal(): void {
    if (this.state === 'modal') this.state = 'play';
    this.featureLock = true;
    this.input.reset();
  }

  // ================================================================ main update
  transition(action: () => void): void {
    if (this.fadeDir) return;
    this.fadeDir = 1;
    this.fadeAction = action;
  }

  update(dtRaw: number): void {
    // fades run in real time, even while paused for transitions
    if (this.fadeDir) {
      this.fade = clamp(this.fade + this.fadeDir * dtRaw * 6, 0, 1);
      if (this.fadeDir > 0 && this.fade >= 1) {
        this.fadeAction?.();
        this.fadeAction = null;
        this.fadeDir = -1;
      } else if (this.fadeDir < 0 && this.fade <= 0) this.fadeDir = 0;
    }

    if (this.state === 'play' && this.input.pressed('pause')) {
      this.state = 'paused';
      this.ui.pause();
      return;
    }
    if (this.state !== 'play' && this.state !== 'dead') return;
    if (this.fadeDir > 0) return;

    this.slowmo = Math.min(1, this.slowmo + dtRaw * (this.state === 'dead' ? 0.2 : 1.2));
    if (this.freeze > 0) {
      this.freeze -= dtRaw;
      this.updateCamera(dtRaw);
      return;
    }
    const dt = dtRaw * this.slowmo;
    this.time += this.state === 'play' ? dtRaw : 0;
    this.input.poll();
    const p = this.player;

    if (this.state === 'play') p.update(this, this.input, dt);
    else this.input.clearPressed();
    this.updateWisp(dt);
    this.flow.update(p.x, p.y);

    // spawn waves
    if (this.room.locked && this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.spawnWave();
        sfx('door');
      }
    }

    for (const e of this.enemies) if (!e.dead) e.update(this, dt);

    // contact damage + thorns
    for (const e of this.enemies) {
      if (!e.targetable || e.contactCd > 0) continue;
      if (dist(e.x, e.y, p.x, p.y) < e.r + p.r - 2) {
        e.contactCd = 0.5;
        if (p.stats.thorns > 0) {
          this.damageEnemy(e, p.stats.thorns * p.stats.dmgMult, { color: '#9ff', silent: true });
          this.fx.sparks(e.x, e.y, angleTo(p.x, p.y, e.x, e.y), '#bff', 5);
        }
        this.hurtPlayer(e.dmg, e.x, e.y);
      }
    }

    this.updateBullets(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.fx.update(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    // wave / room clear
    if (this.room.locked && this.spawnDelay <= 0 && this.enemies.length === 0) {
      if (this.wave < this.room.waves && this.room.kind !== 'boss') {
        this.spawnDelay = 0.6;
      } else {
        this.clearDelay += dt;
        if (this.clearDelay > 0.35) this.onRoomCleared();
      }
    }

    // level ups wait until the action calms down a bit (no modal mid-dodge)
    if (this.pendingLevels > 0 && this.state === 'play' && this.freeze <= 0) {
      const threats = this.bullets.some((b) => b.team === 'enemy' && dist(b.x, b.y, p.x, p.y) < 70);
      if (!threats) this.openLevelUp();
    }

    if (this.state === 'play') {
      this.checkDoors();
      this.checkFeature();
    }
    this.updateCamera(dtRaw);
  }

  private onRoomCleared(): void {
    const room = this.room;
    this.clearDelay = 0;
    room.locked = false;
    room.cleared = true;
    sfx('clear');
    sfx('door');
    for (let d = 0; d < 4; d++) {
      const nb = room.doors[d] ? this.floor.neighbor(room, d) : undefined;
      if (nb) nb.known = true;
    }
    for (const pk of this.pickups) pk.pulled = true;
    if (room.kind !== 'boss') this.hint('cleared');
    if (room.kind === 'boss') {
      room.feature = { kind: 'stairs', x: room.pw / 2, y: room.ph / 2, used: false };
      setMusic(this.floor.theme.id, false);
      const bonus = this.floorNum === FLOORS_TO_WIN && !this.endless ? 'Victory awaits below…' : 'Stairs revealed';
      this.ui.banner('Boss defeated!', bonus);
    } else if (this.rng.chance(0.22)) {
      // small reward for clearing a room
      const p = room.randomFloorPos(this.rng, room.pw / 2, room.ph / 2, 0, 3) ?? [room.pw / 2, room.ph / 2];
      this.addPickup(this.rng.chance(0.3) ? 'potion' : 'gold', p[0], p[1], this.rng.chance(0.3) ? 0.25 : 6 + this.floorNum * 2);
    }
  }

  private updateBullets(dt: number): void {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      let target: { x: number; y: number } | null = null;
      if (b.homing) {
        if (b.team === 'enemy') target = p;
        else {
          let bd = 160;
          for (const e of this.enemies) {
            if (!e.targetable) continue;
            const d = dist(b.x, b.y, e.x, e.y);
            if (d < bd) {
              bd = d;
              target = e;
            }
          }
        }
      }
      const hitWall = b.update(dt, this.room, target);
      if (hitWall) {
        this.fx.sparks(b.x, b.y, b.angle + Math.PI, b.color, 3, 90);
        if (b.team === 'player' && b.explode) this.explode(b.x, b.y, b.explode, b.dmg * 0.6, 'player', '#ff8a3a');
        continue;
      }
      if (b.dead) continue;
      if (b.team === 'enemy') {
        if (!p.dead && p.invuln <= 0 && dist(b.x, b.y, p.x, p.y) < b.r + p.r - 3) {
          b.dead = true;
          this.hurtPlayer(b.dmg, b.x, b.y);
          this.hint('bullets');
        }
        continue;
      }
      for (const e of this.enemies) {
        if (!e.targetable || b.hit.has(e)) continue;
        if (dist(b.x, b.y, e.x, e.y) > b.r + e.r) continue;
        b.hit.add(e);
        const kb = b.kind === 'wave' ? 200 : 70;
        this.damageEnemy(e, b.dmg, { kx: Math.cos(b.angle) * kb, ky: Math.sin(b.angle) * kb, crit: false, color: b.crit ? '#ffd23a' : undefined });
        if (b.crit) {
          this.fx.text(e.x, e.y - e.r - 12, 'CRIT', '#ffd23a', 6, 0.5);
          sfx('crit', 1, 0.05);
        }
        this.fx.sparks(b.x, b.y, b.angle + Math.PI, b.color, 3);
        if (b.procs) this.onHitProcs(e, b);
        if (b.pierce-- <= 0) {
          b.dead = true;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private onHitProcs(e: Enemy, b: Bullet): void {
    const s = this.player.stats;
    if (s.frost > 0) {
      e.slowT = 1.5;
      e.slowAmt = Math.max(e.slowAmt, s.frost);
    }
    if (s.burn > 0) {
      e.burnT = 3;
      e.burnDps = Math.max(e.burnDps, s.burn * s.dmgMult);
    }
    if (b.explode) this.explode(b.x, b.y, b.explode, b.dmg * 0.6, 'player', '#ff8a3a');
    if (s.chain > 0 && Math.random() < s.chain) {
      let from: Enemy = e;
      const hit = new Set<Enemy>([e]);
      for (let k = 0; k < 3; k++) {
        let next: Enemy | null = null;
        let bd = 110;
        for (const o of this.enemies) {
          if (!o.targetable || hit.has(o)) continue;
          const d = dist(from.x, from.y, o.x, o.y);
          if (d < bd) {
            bd = d;
            next = o;
          }
        }
        if (!next) break;
        hit.add(next);
        this.chainArcs.push({ x0: from.x, y0: from.y, x1: next.x, y1: next.y, life: 0.18 });
        this.damageEnemy(next, b.dmg * 0.6, { color: '#9ff', silent: true });
        from = next;
      }
      sfx('zap', 1, 0.05);
    }
  }

  chainArcs: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (!h.fired && h.t >= h.delay) {
        h.fired = true;
        h.onFire?.();
        if (h.dmg > 0) this.hazardHit(h, p);
      } else if (h.fired && h.linger > 0 && h.dmg > 0) this.hazardHit(h, p);
    }
    this.hazards = this.hazards.filter((h) => !h.fired || h.t < h.delay + Math.max(0.15, h.linger));
    this.lobs = this.lobs.filter((l) => !l.hz.fired);
    for (const a of this.chainArcs) a.life -= dt;
    this.chainArcs = this.chainArcs.filter((a) => a.life > 0);
  }

  private hazardHit(h: Hazard, p: Player): void {
    if (h.kind === 'circle') {
      if (dist(h.x, h.y, p.x, p.y) < h.r + p.r * 0.5) this.hurtPlayer(h.dmg, h.x, h.y);
    } else {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const along = dx * Math.cos(h.angle) + dy * Math.sin(h.angle);
      const across = -dx * Math.sin(h.angle) + dy * Math.cos(h.angle);
      if (along > 0 && along < h.len && Math.abs(across) < h.r) this.hurtPlayer(h.dmg, p.x - Math.cos(h.angle), p.y - Math.sin(h.angle));
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const s = p.stats;
    for (const k of this.pickups) {
      k.age += dt;
      const d = dist(k.x, k.y, p.x, p.y);
      if (!k.pulled && k.age > 0.4 && d < s.magnet && k.kind !== 'potion') k.pulled = true;
      if (k.kind === 'potion' && d < 18) k.pulled = true;
      if (k.pulled && k.age > 0.25) {
        const a = angleTo(k.x, k.y, p.x, p.y);
        const sp = 140 + k.age * 160;
        k.vx = damp(k.vx, Math.cos(a) * sp, 10, dt);
        k.vy = damp(k.vy, Math.sin(a) * sp, 10, dt);
      } else {
        k.vx *= Math.exp(-5 * dt);
        k.vy *= Math.exp(-5 * dt);
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (!k.pulled) {
        k.x = clamp(k.x, TILE * 1.2, this.room.pw - TILE * 1.2);
        k.y = clamp(k.y, TILE * 1.2, this.room.ph - TILE * 1.2);
      }
      if (d < p.r + 6 && k.age > 0.2) {
        k.age = -999;
        if (k.kind === 'xp') {
          this.gainXp(k.value);
          sfx('xp', 1 + Math.min(0.8, this.combo * 0.02), 0.025);
        } else if (k.kind === 'gold') {
          this.gold += Math.max(1, Math.round(k.value * s.goldMult));
          sfx('coin', 1, 0.05);
        } else {
          const healed = p.heal(p.stats.maxHp * k.value);
          sfx('heal');
          this.fx.text(p.x, p.y - 16, `+${Math.round(healed)}`, '#7dff8a', 8);
        }
      }
    }
    this.pickups = this.pickups.filter((k) => k.age >= 0);
  }

  private checkDoors(): void {
    const room = this.room;
    if (room.locked || this.fadeDir) return;
    const p = this.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    if (room.at(tx, ty) !== DOOR) return;
    let d = -1;
    if (ty === 0 && p.y < TILE * 0.7) d = 0;
    else if (tx === room.w - 1 && p.x > room.pw - TILE * 0.7) d = 1;
    else if (ty === room.h - 1 && p.y > room.ph - TILE * 0.7) d = 2;
    else if (tx === 0 && p.x < TILE * 0.7) d = 3;
    if (d < 0) return;
    const next = this.floor.neighbor(room, d);
    if (!next) return;
    this.transition(() => this.enterRoom(next, d));
  }

  private checkFeature(): void {
    const f = this.room.feature;
    if (!f) return;
    const d = dist(this.player.x, this.player.y, f.x, f.y);
    if (this.featureLock) {
      if (d > 40) this.featureLock = false;
      return;
    }
    if (d < 22) {
      this.featureLock = true;
      this.useFeature(f);
    }
  }

  // ================================================================ guidance
  private updateWisp(dt: number): void {
    const p = this.player;
    const w = this.wisp;
    let tx = p.x - p.facing * 16;
    let ty = p.y - 26 + Math.sin(this.time * 2.2) * 3;
    w.guiding = false;
    const goal = this.room.locked ? null : this.guideTarget();
    if (goal) {
      const d = dist(p.x, p.y, goal[0], goal[1]);
      if (d > 28) {
        // lead the way, but never stray too far from the hero
        const k = Math.min(1, 110 / d);
        tx = p.x + (goal[0] - p.x) * k;
        ty = p.y + (goal[1] - p.y) * k - 12 + Math.sin(this.time * 3) * 4;
        w.guiding = true;
      }
    }
    w.x = damp(w.x, tx, w.guiding ? 2.2 : 4, dt);
    w.y = damp(w.y, ty, w.guiding ? 2.2 : 4, dt);
  }

  /** Where the wisp leads: the next door toward the boss, or the stairs once it's beaten. */
  private guideTarget(): [number, number] | null {
    const room = this.room;
    if (room.feature?.kind === 'stairs') return [room.feature.x, room.feature.y];
    if (room === this.floor.boss) return null;
    // breadth-first search across the room graph to the boss room
    const target = this.floor.boss;
    const prev = new Map<Room, [Room, number]>();
    const queue: Room[] = [room];
    const seen = new Set<Room>([room]);
    while (queue.length) {
      const r = queue.shift()!;
      if (r === target) break;
      for (let d = 0; d < 4; d++) {
        if (!r.doors[d]) continue;
        const nb = this.floor.neighbor(r, d);
        if (nb && !seen.has(nb)) {
          seen.add(nb);
          prev.set(nb, [r, d]);
          queue.push(nb);
        }
      }
    }
    let step: Room = target;
    let dir = -1;
    while (prev.has(step)) {
      const [from, d] = prev.get(step)!;
      if (from === room) {
        dir = d;
        break;
      }
      step = from;
    }
    if (dir < 0) return null;
    const [cx, cy] = room.doorCells(dir)[1];
    return [(cx + 0.5) * TILE, (cy + 0.5) * TILE];
  }

  // ================================================================ camera
  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  private camTarget(): [number, number] {
    const p = this.player;
    const room = this.room;
    let tx = p.x - this.viewW / 2 + p.vx * 0.25;
    let ty = p.y - this.viewH / 2 + p.vy * 0.2;
    const margin = TILE * 0.5;
    if (room.pw + margin * 2 <= this.viewW) tx = (room.pw - this.viewW) / 2;
    else tx = clamp(tx, -margin, room.pw - this.viewW + margin);
    if (room.ph + margin * 2 <= this.viewH) ty = (room.ph - this.viewH) / 2;
    else ty = clamp(ty, -margin, room.ph - this.viewH + margin);
    return [tx, ty];
  }

  snapCamera(): void {
    [this.camX, this.camY] = this.camTarget();
  }

  private updateCamera(dt: number): void {
    const [tx, ty] = this.camTarget();
    this.camX = damp(this.camX, tx, 7, dt);
    this.camY = damp(this.camY, ty, 7, dt);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 30);
  }
}

export function vibrate(pattern: number | number[]): void {
  if (!settings.vibration) return;
  try {
    if (Capacitor.isNativePlatform()) {
      const ms = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
      Haptics.vibrate({ duration: ms }).catch(() => {});
    } else navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
