import { sfx } from '../engine/audio';
import { rand, TAU } from '../engine/math';
import { Mask } from './collision';
import { TILE } from './dungeon';
import { Enemy, EnemyDef, ENEMIES, ShotDef } from './enemies';
import type { Game } from './game';

export const BOSSES: Record<string, EnemyDef & { title: string; minion: string }> = {
  jelly_king: {
    id: 'jelly_king',
    name: 'The Royal Jelly',
    title: 'Monarch of Ooze',
    sprite: 'boss_jelly',
    hp: 950,
    speed: 140,
    dmg: 18,
    r: 22,
    ai: 'boss',
    xp: 60,
    cost: 0,
    scale: 1.7,
    blood: '#ffb52e',
    glow: '255,190,90',
    minion: 'slime',
  },
  hydra: {
    id: 'hydra',
    name: 'The Hydra',
    title: 'Five-Headed Horror',
    sprite: 'boss_hydra',
    hp: 1350,
    speed: 40,
    dmg: 20,
    r: 26,
    ai: 'boss',
    xp: 80,
    cost: 0,
    scale: 2.4,
    blood: '#7fdc5a',
    minion: 'snake',
  },
  lich: {
    id: 'lich',
    name: 'The Ancient Lich',
    title: 'Lord of the Ossuary',
    sprite: 'boss_lich',
    hp: 1500,
    speed: 48,
    dmg: 20,
    r: 18,
    ai: 'boss',
    xp: 100,
    cost: 0,
    scale: 2.1,
    mask: Mask.Flyer,
    blood: '#c77dff',
    glow: '190,140,255',
    minion: 'skeleton',
  },
  dragon: {
    id: 'dragon',
    name: 'Frost Wyrm',
    title: 'Terror of the Depths',
    sprite: 'boss_dragon',
    hp: 1900,
    speed: 52,
    dmg: 24,
    r: 26,
    ai: 'boss',
    xp: 120,
    cost: 0,
    scale: 2.5,
    blood: '#9fe6ff',
    glow: '150,220,255',
    minion: 'white_imp',
  },
  balrug: {
    id: 'balrug',
    name: 'The Balrug',
    title: 'Flame of Udun',
    sprite: 'boss_balrug',
    hp: 2500,
    speed: 50,
    dmg: 26,
    r: 26,
    ai: 'boss',
    xp: 150,
    cost: 0,
    scale: 2.5,
    blood: '#ff8a2a',
    glow: '255,120,50',
    minion: 'crimson_imp',
  },
};

Object.assign(ENEMIES, BOSSES);

type Brain = Generator<number, void, unknown>;
type Attack = (e: Enemy, g: Game, enraged: boolean) => Brain;

/** Bullets shared by boss patterns. */
const orb = (speed: number, dmg: number, extra: Partial<ShotDef> = {}): ShotDef => ({ pattern: 'aim', cd: 0, speed, dmg, ...extra });

function ring(e: Enemy, g: Game, n: number, speed: number, dmg: number, offset = Math.random() * TAU, gapAt?: number, gap = 0, kind?: ShotDef['kind']): void {
  for (let i = 0; i < n; i++) {
    const a = offset + (TAU * i) / n;
    if (gapAt !== undefined) {
      let d = Math.abs(((a - gapAt) % TAU) + TAU) % TAU;
      if (d > Math.PI) d = TAU - d;
      if (d < gap) continue;
    }
    g.enemyShot(e, a, orb(speed, dmg, { kind, r: 5 }));
  }
}

function* tell(e: Enemy, t: number): Brain {
  e.move = 'hold';
  e.tell = t;
  yield t;
}

function summon(g: Game, id: string, n: number): void {
  const alive = g.enemies.filter((m) => !m.dead && !m.boss).length;
  for (let i = 0; i < Math.min(n, 6 - alive); i++) {
    const p = g.room.randomFloorPos(g.rng, g.player.x, g.player.y, 90, 2);
    if (p) g.spawnEnemy(id, p[0], p[1], { noDrops: true });
  }
  sfx('spawn', 0.7);
}

function* hopAt(e: Enemy, g: Game, dur: number, height: number): Brain {
  const p = g.player;
  e.startHop(g, p.x + p.vx * 0.3, p.y + p.vy * 0.3, dur, height);
  yield dur;
  e.z = 0;
  e.move = 'hold';
}

function* charge(e: Enemy, g: Game, speedMul: number): Brain {
  const a = e.aim(g, 0.15);
  g.addHazard({ kind: 'line', x: e.x, y: e.y, angle: a, len: 420, r: e.r, delay: 0.6, dmg: 0, color: 'rgba(255,60,60,0.35)' });
  yield* tell(e, 0.6);
  e.chargeX = Math.cos(a);
  e.chargeY = Math.sin(a);
  e.chargeT = 1.1;
  e.bonked = false;
  e.moveMul = speedMul;
  e.move = 'charge';
  sfx('roar', 1.4, 0.5);
  while (e.chargeT > 0) yield 0.03;
  e.moveMul = 1;
  e.move = 'hold';
  if (e.bonked) {
    ring(e, g, 10, 120, e.dmg * 0.6);
    yield 0.8;
  } else yield 0.3;
}

const ATTACKS: Record<string, Attack[]> = {
  jelly_king: [
    function* (e, g, enr) {
      for (let i = 0; i < (enr ? 4 : 3); i++) {
        yield* tell(e, enr ? 0.25 : 0.4);
        yield* hopAt(e, g, 0.7, 46);
        g.shake(6);
        sfx('stomp');
        g.fx.dust(e.x, e.y + e.r * 0.5, 14);
        g.fx.ring(e.x, e.y, 8, 70, '#ffcf6a', 0.35, 4);
        ring(e, g, enr ? 16 : 12, 115, e.dmg * 0.55);
      }
      yield 0.6;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.7);
      summon(g, enr ? 'jelly' : 'slime', 3);
      yield 1.0;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.5);
      e.move = 'chase';
      e.moveMul = 0.25;
      for (let i = 0; i < (enr ? 26 : 18); i++) {
        const a = e.aim(g) + rand(-0.7, 0.7);
        const b = g.enemyShot(e, a, orb(rand(90, 170), e.dmg * 0.5, { r: 4 }));
        b.accel = -60;
        yield 0.07;
      }
      e.moveMul = 1;
      yield 0.8;
    },
  ],
  hydra: [
    function* (e, g, enr) {
      yield* tell(e, 0.5);
      for (let w = 0; w < (enr ? 4 : 3); w++) {
        const a = e.aim(g);
        const n = enr ? 7 : 5;
        for (let i = 0; i < n; i++) g.enemyShot(e, a + (i - (n - 1) / 2) * 0.22 + (w % 2) * 0.11, orb(150, e.dmg * 0.5, { r: 5 }));
        sfx('enemyShoot', 0.6);
        yield 0.45;
      }
      yield 0.6;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.6);
      let spin = Math.random() * TAU;
      for (let t = 0; t < (enr ? 32 : 24); t++) {
        spin += enr ? 0.27 : 0.21;
        for (let k = 0; k < 5; k++) g.enemyShot(e, spin + (TAU * k) / 5, orb(105, e.dmg * 0.45, { r: 4 }));
        if (t % 3 === 0) sfx('enemyShoot', 0.7, 0.05);
        yield 0.1;
      }
      yield 0.8;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.7);
      summon(g, enr ? 'jelly' : 'snake', 3);
      yield 1.2;
    },
    function* (e, g) {
      yield* charge(e, g, 1.6);
      yield 0.4;
    },
  ],
  lich: [
    function* (e, g, enr) {
      // vanish and reappear far from the player, then burst
      for (let i = 0; i < 8; i++) {
        e.fade = 1 - (i + 1) / 8;
        yield 0.04;
      }
      const p = g.room.randomFloorPos(g.rng, g.player.x, g.player.y, 150, 2);
      if (p) [e.x, e.y] = p;
      for (let i = 0; i < 8; i++) {
        e.fade = (i + 1) / 8;
        yield 0.04;
      }
      yield* tell(e, 0.35);
      ring(e, g, enr ? 22 : 16, 110, e.dmg * 0.5, undefined, undefined, 0, 'skull');
      if (enr) {
        yield 0.35;
        ring(e, g, 22, 85, e.dmg * 0.5, undefined, undefined, 0, 'skull');
      }
      yield 0.9;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.6);
      let spin = Math.random() * TAU;
      const arms = enr ? 5 : 4;
      for (let t = 0; t < 30; t++) {
        spin += 0.16;
        for (let k = 0; k < arms; k++) g.enemyShot(e, spin + (TAU * k) / arms, orb(115, e.dmg * 0.45, { r: 4 }));
        if (t % 3 === 0) sfx('enemyShoot', 1.2, 0.05);
        yield 0.1;
      }
      yield 0.7;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.8);
      summon(g, enr ? 'mummy' : 'skeleton', 3);
      yield 1;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.5);
      for (let i = 0; i < (enr ? 7 : 5); i++) {
        const b = g.enemyShot(e, e.aim(g) + rand(-1.2, 1.2), orb(90, e.dmg * 0.6, { kind: 'skull', r: 5 }));
        b.homing = 1.4;
        b.life = 5;
        sfx('enemyShoot', 0.6, 0.05);
        yield 0.22;
      }
      yield 1;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.4);
      const p = g.player;
      const n = enr ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n + rand(-0.2, 0.2);
        const r = i === 0 ? 0 : rand(30, 80);
        g.lob(e.x, e.y, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 24, e.dmg * 0.8, 1.0, '#c77dff');
      }
      yield 1.4;
    },
  ],
  dragon: [
    function* (e, g, enr) {
      yield* charge(e, g, 1.7);
      if (enr) yield* charge(e, g, 1.9);
      yield 0.4;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.6);
      sfx('roar', 1.2, 0.3);
      const base = e.aim(g);
      for (let t = 0; t < (enr ? 28 : 20); t++) {
        const sweep = base + Math.sin(t * 0.25) * 0.5;
        for (let k = 0; k < 2; k++) g.enemyShot(e, sweep + rand(-0.25, 0.25), orb(rand(150, 210), e.dmg * 0.45, { kind: 'shard', r: 4 }));
        yield 0.06;
      }
      yield 0.8;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.5);
      const p = g.player;
      for (let i = 0; i < (enr ? 14 : 10); i++) {
        const tx = i < 2 ? p.x + p.vx * 0.5 : p.x + rand(-120, 120);
        const ty = i < 2 ? p.y + p.vy * 0.5 : p.y + rand(-80, 80);
        g.lob(e.x, e.y, tx, ty, 22, e.dmg * 0.8, 0.9 + i * 0.08, '#9fe6ff');
      }
      yield 1.6;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.5);
      for (let k = 0; k < (enr ? 3 : 2); k++) {
        const gapAt = e.aim(g) + rand(-1, 1);
        ring(e, g, 28, 95, e.dmg * 0.5, Math.random(), gapAt, 0.38, 'shard');
        sfx('enemyShoot', 0.5);
        yield 0.75;
      }
      yield 0.6;
    },
    function* (e, g) {
      yield* tell(e, 0.6);
      summon(g, 'white_imp', 3);
      yield 1;
    },
  ],
  balrug: [
    function* (e, g, enr) {
      yield* tell(e, 0.6);
      sfx('roar', 1, 0.3);
      for (let k = 0; k < (enr ? 4 : 3); k++) {
        ring(e, g, 30, 100, e.dmg * 0.5, Math.random(), Math.random() * TAU, 0.42, 'fire');
        yield 0.7;
      }
      yield 0.5;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.4);
      const p = g.player;
      for (let i = 0; i < (enr ? 14 : 9); i++) {
        const tx = i % 3 === 0 ? p.x + p.vx * 0.6 : rand(TILE * 2, g.room.pw - TILE * 2);
        const ty = i % 3 === 0 ? p.y + p.vy * 0.6 : rand(TILE * 2, g.room.ph - TILE * 2);
        g.lob(e.x, e.y, tx, ty, 30, e.dmg, 1.0 + i * 0.12, '#ff7a2a');
      }
      yield 1.5;
    },
    function* (e, g, enr) {
      yield* tell(e, 0.7);
      summon(g, enr ? 'hell_hound' : 'crimson_imp', 3);
      yield 1;
    },
    function* (e, g, enr) {
      e.move = 'chase';
      for (let w = 0; w < (enr ? 5 : 4); w++) {
        yield* tell(e, 0.3);
        const a = e.aim(g, 0.2);
        for (let i = 0; i < 7; i++) g.enemyShot(e, a + (i - 3) * 0.13, orb(170 + Math.abs(i - 3) * -10, e.dmg * 0.45, { kind: 'fire', r: 4 }));
        sfx('enemyShoot', 0.5);
        e.move = 'chase';
        yield 0.5;
      }
      yield 0.5;
    },
    function* (e, g) {
      yield* charge(e, g, 1.8);
      yield 0.3;
    },
  ],
};

export function* bossBrain(e: Enemy, g: Game): Brain {
  const attacks = ATTACKS[e.def.id] ?? ATTACKS.jelly_king;
  let last = -1;
  e.move = 'hold';
  yield 1.2;
  for (;;) {
    const enraged = e.hp < e.maxHp * 0.5;
    if (enraged && e.phase === 0) {
      e.phase = 1;
      g.bossEnrage(e);
      yield* tell(e, 1.0);
    }
    let i = Math.floor(Math.random() * attacks.length);
    if (i === last) i = (i + 1) % attacks.length;
    last = i;
    yield* attacks[i](e, g, enraged);
    e.move = 'chase';
    e.moveMul = 0.7;
    yield enraged ? rand(0.3, 0.7) : rand(0.6, 1.2);
    e.moveMul = 1;
  }
}
