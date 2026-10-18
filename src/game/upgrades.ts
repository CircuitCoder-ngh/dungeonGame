import { metaLevel } from './profile';

export interface PlayerStats {
  maxHp: number;
  speed: number;
  armor: number; // fraction of damage ignored
  regen: number; // hp / s
  dmgMult: number;
  // primary: auto-aimed bolt
  boltDmg: number;
  boltRate: number; // shots per second
  boltSpeed: number;
  boltRange: number;
  boltCount: number;
  boltPierce: number;
  boltBounce: number;
  boltHoming: number;
  boltSize: number;
  boltExplode: number; // explosion radius, 0 = none
  chain: number; // chance to arc lightning on hit
  frost: number; // slow applied on hit (0..1)
  burn: number; // burn dps applied on hit
  crit: number;
  critMult: number;
  // slash
  slashDmg: number;
  slashCd: number;
  slashArc: number; // radians
  slashRange: number;
  slashWave: number; // 0 = none, else wave damage multiplier
  // nova
  novaDps: number;
  novaCd: number;
  novaRadius: number;
  novaDur: number;
  novaDrain: number; // fraction of nova damage healed
  // dash
  dashCd: number;
  dashCharges: number;
  dashDist: number;
  dashBurst: number; // damage dealt to enemies dashed through
  // misc
  magnet: number;
  goldMult: number;
  xpMult: number;
  orbits: number;
  spheres: number;
  thorns: number;
  killHeal: number;
}

export interface Hero {
  id: string;
  name: string;
  /** the character's own name, used by the story */
  person: string;
  sprite: string;
  blurb: string;
  cost: number;
  color: string; // bolt colour
  stats: Partial<PlayerStats>;
}

const BASE: PlayerStats = {
  maxHp: 100,
  speed: 105,
  armor: 0,
  regen: 0,
  dmgMult: 1,
  boltDmg: 10,
  boltRate: 3.0,
  boltSpeed: 300,
  boltRange: 260,
  boltCount: 1,
  boltPierce: 0,
  boltBounce: 0,
  boltHoming: 0,
  boltSize: 1,
  boltExplode: 0,
  chain: 0,
  frost: 0,
  burn: 0,
  crit: 0.05,
  critMult: 2,
  slashDmg: 28,
  slashCd: 1.1,
  slashArc: Math.PI * 0.75,
  slashRange: 50,
  slashWave: 0,
  novaDps: 20,
  novaCd: 7,
  novaRadius: 72,
  novaDur: 2.5,
  novaDrain: 0.1,
  dashCd: 1.3,
  dashCharges: 1,
  dashDist: 78,
  dashBurst: 0,
  magnet: 48,
  goldMult: 1,
  xpMult: 1,
  orbits: 0,
  spheres: 0,
  thorns: 0,
  killHeal: 0,
};

export const HEROES: Hero[] = [
  {
    id: 'knight',
    name: 'Knight',
    person: 'Aldric',
    sprite: 'hero_knight',
    blurb: 'Sworn shield of the Wardens. Armoured, with a brutal sword slash.',
    cost: 0,
    color: '#9fd8ff',
    stats: { maxHp: 130, armor: 0.1, slashDmg: 36, slashArc: Math.PI * 0.85, boltDmg: 9 },
  },
  {
    id: 'mage',
    name: 'Arcanist',
    person: 'Ysolde',
    sprite: 'hero_mage',
    blurb: "Maren's apprentice. Fragile, but her bolts and nova are deadly.",
    cost: 60,
    color: '#d88cff',
    stats: { maxHp: 85, boltDmg: 12, boltRate: 3.9, boltSpeed: 330, novaRadius: 92, novaDps: 26, novaCd: 6, slashDmg: 22 },
  },
  {
    id: 'rogue',
    name: 'Ranger',
    person: 'Corwin',
    sprite: 'hero_rogue',
    blurb: "Maren's brother, a hunter. Quick, evasive, deadly critical hits.",
    cost: 100,
    color: '#b6ff8a',
    stats: { maxHp: 100, speed: 122, crit: 0.18, critMult: 2.4, dashCharges: 2, dashCd: 0.9, slashCd: 0.8, boltRate: 3.5 },
  },
];

export type Rarity = 'common' | 'rare' | 'epic';

export interface Upgrade {
  id: string;
  name: string;
  icon: string;
  max: number;
  rarity: Rarity;
  desc: string;
  apply: (s: PlayerStats) => void;
  /** only offered when this returns true */
  requires?: (s: PlayerStats, owned: Map<string, number>) => boolean;
}

export const UPGRADES: Upgrade[] = [
  // bolt
  { id: 'power', name: 'Arcane Power', icon: 'ic_dart', max: 5, rarity: 'common', desc: '+22% bolt damage', apply: (s) => (s.boltDmg *= 1.22) },
  { id: 'haste', name: 'Quickcast', icon: 'ic_momentum', max: 5, rarity: 'common', desc: '+16% fire rate', apply: (s) => (s.boltRate *= 1.16) },
  { id: 'multishot', name: 'Split Bolt', icon: 'ic_starburst', max: 3, rarity: 'rare', desc: '+1 bolt per shot', apply: (s) => s.boltCount++ },
  { id: 'pierce', name: 'Piercing Lance', icon: 'ic_lance', max: 3, rarity: 'common', desc: 'Bolts pierce +1 enemy', apply: (s) => s.boltPierce++ },
  { id: 'bounce', name: 'Ricochet', icon: 'ic_ray', max: 2, rarity: 'common', desc: 'Bolts bounce off walls +2 times', apply: (s) => (s.boltBounce += 2) },
  { id: 'homing', name: 'Seeker', icon: 'ic_maxwell', max: 2, rarity: 'rare', desc: 'Bolts curve toward enemies', apply: (s) => (s.boltHoming += 4) },
  {
    id: 'explode',
    name: 'Fireball',
    icon: 'ic_fireball',
    max: 3,
    rarity: 'rare',
    desc: 'Bolts explode on impact',
    apply: (s) => (s.boltExplode = s.boltExplode ? s.boltExplode + 12 : 30),
  },
  { id: 'chain', name: 'Chain Lightning', icon: 'ic_chain', max: 3, rarity: 'rare', desc: '+18% chance hits arc to nearby foes', apply: (s) => (s.chain += 0.18) },
  { id: 'frost', name: 'Frostbite', icon: 'ic_freeze', max: 2, rarity: 'common', desc: 'Hits slow enemies', apply: (s) => (s.frost = Math.min(0.6, s.frost + 0.3)) },
  { id: 'burn', name: 'Ignite', icon: 'ic_sticky', max: 3, rarity: 'common', desc: 'Hits set enemies on fire', apply: (s) => (s.burn += 6) },
  { id: 'crit', name: 'Precision', icon: 'ic_agony', max: 4, rarity: 'common', desc: '+10% critical chance', apply: (s) => (s.crit += 0.1) },
  { id: 'bigbolt', name: 'Heavy Bolts', icon: 'ic_orb', max: 2, rarity: 'common', desc: 'Bigger, faster bolts, +10% damage', apply: (s) => ((s.boltSize += 0.5), (s.boltSpeed *= 1.15), (s.boltDmg *= 1.1)) },
  // slash
  { id: 'blade', name: 'Heavy Blade', icon: 'ic_sword', max: 4, rarity: 'common', desc: '+35% slash damage, wider arc', apply: (s) => ((s.slashDmg *= 1.35), (s.slashArc = Math.min(Math.PI * 1.6, s.slashArc + 0.25))) },
  { id: 'swiftblade', name: 'Swift Blade', icon: 'ic_piledriver', max: 3, rarity: 'common', desc: '-20% slash cooldown', apply: (s) => (s.slashCd *= 0.8) },
  {
    id: 'wave',
    name: 'Flame Wave',
    icon: 'ic_flamewave',
    max: 3,
    rarity: 'rare',
    desc: 'Slashes launch a piercing fire wave',
    apply: (s) => (s.slashWave = s.slashWave ? s.slashWave + 0.35 : 0.7),
  },
  // nova
  { id: 'novasize', name: 'Expanding Nova', icon: 'ic_blast', max: 3, rarity: 'common', desc: '+22% nova radius & damage', apply: (s) => ((s.novaRadius *= 1.22), (s.novaDps *= 1.22)) },
  { id: 'novacd', name: 'Ring of Flames', icon: 'ic_ringflames', max: 3, rarity: 'common', desc: '-20% nova cooldown', apply: (s) => (s.novaCd *= 0.8) },
  { id: 'drain', name: 'Vampiric Nova', icon: 'ic_drain', max: 2, rarity: 'rare', desc: 'Nova heals you for 20% of its damage', apply: (s) => (s.novaDrain += 0.2) },
  // dash
  { id: 'dashcd', name: 'Blink Mastery', icon: 'ic_blink', max: 2, rarity: 'common', desc: '-25% dash cooldown', apply: (s) => (s.dashCd *= 0.75) },
  { id: 'dashcharge', name: 'Double Step', icon: 'ic_swift', max: 1, rarity: 'rare', desc: '+1 dash charge', apply: (s) => s.dashCharges++ },
  { id: 'shockstep', name: 'Shock Step', icon: 'ic_static', max: 2, rarity: 'rare', desc: 'Dashing through enemies shocks them', apply: (s) => (s.dashBurst += 30) },
  // defence
  { id: 'vitality', name: 'Vitality', icon: 'ic_heal', max: 5, rarity: 'common', desc: '+25 max HP and heal 25', apply: (s) => (s.maxHp += 25) },
  { id: 'regen', name: 'Regeneration', icon: 'ic_deathsdoor', max: 3, rarity: 'common', desc: 'Regenerate 0.7 HP per second', apply: (s) => (s.regen += 0.7) },
  { id: 'armour', name: 'Ice Armour', icon: 'ic_armour', max: 4, rarity: 'common', desc: 'Take 9% less damage', apply: (s) => (s.armor = 1 - (1 - s.armor) * 0.91) },
  { id: 'thorns', name: 'Static Field', icon: 'ic_static', max: 2, rarity: 'common', desc: 'Enemies that touch you take damage', apply: (s) => (s.thorns += 18) },
  { id: 'bloodlust', name: 'Bloodlust', icon: 'ic_agony', max: 3, rarity: 'common', desc: 'Heal 1 HP per kill', apply: (s) => s.killHeal++ },
  // utility / summons
  { id: 'speed', name: 'Fleet Foot', icon: 'ic_swift', max: 3, rarity: 'common', desc: '+10% move speed', apply: (s) => (s.speed *= 1.1) },
  { id: 'magnet', name: 'Lodestone', icon: 'ic_gravitas', max: 2, rarity: 'common', desc: 'Much larger pickup radius', apply: (s) => (s.magnet *= 1.8) },
  { id: 'midas', name: 'Midas Touch', icon: 'gold', max: 2, rarity: 'common', desc: '+40% gold', apply: (s) => (s.goldMult *= 1.4) },
  { id: 'orbit', name: 'Orbiting Orbs', icon: 'ic_orb', max: 4, rarity: 'rare', desc: '+1 orb circles you, damaging foes', apply: (s) => s.orbits++ },
  { id: 'sphere', name: 'Battlesphere', icon: 'ic_sphere', max: 2, rarity: 'epic', desc: 'A familiar that fires at enemies', apply: (s) => s.spheres++ },
  {
    id: 'glass',
    name: 'Glass Cannon',
    icon: 'ic_icicle',
    max: 1,
    rarity: 'epic',
    desc: '+45% damage, -25% max HP',
    apply: (s) => ((s.dmgMult *= 1.45), (s.maxHp *= 0.75)),
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function computeStats(heroId: string, upgrades: string[]): PlayerStats {
  const hero = HEROES.find((h) => h.id === heroId) ?? HEROES[0];
  const s: PlayerStats = { ...BASE, ...hero.stats };
  // permanent (meta) upgrades
  s.maxHp += metaLevel('vitality') * 10;
  s.dmgMult *= 1 + metaLevel('might') * 0.08;
  s.speed *= 1 + metaLevel('swift') * 0.05;
  s.goldMult *= 1 + metaLevel('greed') * 0.2;
  s.xpMult *= 1 + metaLevel('wisdom') * 0.12;
  for (const id of upgrades) UPGRADE_BY_ID.get(id)?.apply(s);
  s.maxHp = Math.round(s.maxHp);
  return s;
}

const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 4.5, epic: 1.2 };

export function rollUpgrades(owned: string[], count: number, rnd: () => number, minRarity: Rarity = 'common'): Upgrade[] {
  const counts = new Map<string, number>();
  for (const id of owned) counts.set(id, (counts.get(id) ?? 0) + 1);
  const order: Rarity[] = ['common', 'rare', 'epic'];
  let pool = UPGRADES.filter((u) => (counts.get(u.id) ?? 0) < u.max && order.indexOf(u.rarity) >= order.indexOf(minRarity));
  if (pool.length < count) pool = UPGRADES.filter((u) => (counts.get(u.id) ?? 0) < u.max);
  const picks: Upgrade[] = [];
  while (picks.length < count && pool.length) {
    let total = 0;
    for (const u of pool) total += RARITY_WEIGHT[u.rarity];
    let r = rnd() * total;
    let chosen = pool[pool.length - 1];
    for (const u of pool) {
      r -= RARITY_WEIGHT[u.rarity];
      if (r <= 0) {
        chosen = u;
        break;
      }
    }
    picks.push(chosen);
    pool = pool.filter((u) => u !== chosen);
  }
  return picks;
}
