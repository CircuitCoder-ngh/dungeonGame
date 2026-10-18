import { load, remove, save } from '../engine/save';

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  vibration: boolean;
  shake: boolean;
  damageNumbers: boolean;
  lefty: boolean; // swap joystick / buttons sides
}

export interface Meta {
  souls: number;
  /** meta upgrade id -> level */
  levels: Record<string, number>;
  unlocked: string[]; // hero ids
  hero: string; // last selected hero
}

export interface Stats {
  runs: number;
  wins: number;
  bestFloor: number;
  kills: number;
  bossKills: number;
  bestTime: number; // seconds for a full clear, 0 = none
  seenTutorial: boolean;
  introSeen: boolean;
  /** one-time story hints already shown */
  hints: string[];
  /** floors whose full arrival dialogue has been heard */
  storyFloors: number[];
}

/** Checkpoint written at the start of each floor so a run survives the app being closed. */
export interface RunSave {
  hero: string;
  floor: number; // 1-based, continues past 5 in endless mode
  seed: number;
  hp: number;
  gold: number;
  xp: number;
  level: number;
  upgrades: string[];
  kills: number;
  time: number;
  revived: boolean;
  souls: number;
  bossKills?: number;
}

export const settings: Settings = load<Settings>('settings', {
  music: 0.5,
  sfx: 0.8,
  vibration: true,
  shake: true,
  damageNumbers: true,
  lefty: false,
});

export const meta: Meta = load<Meta>('meta', { souls: 0, levels: {}, unlocked: ['knight'], hero: 'knight' });

export const stats: Stats = load<Stats>('stats', {
  runs: 0,
  wins: 0,
  bestFloor: 0,
  kills: 0,
  bossKills: 0,
  bestTime: 0,
  seenTutorial: false,
  introSeen: false,
  hints: [],
  storyFloors: [],
});

export const saveSettings = () => save('settings', settings);
export const saveMeta = () => save('meta', meta);
export const saveStats = () => save('stats', stats);

export const loadRun = (): RunSave | null => load<RunSave | null>('run', null);
export const saveRun = (r: RunSave) => save('run', r);
export const clearRun = () => remove('run');

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: (lvl: number) => string;
  icon: string;
  max: number;
  cost: (lvl: number) => number;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'vitality', name: 'Vitality', icon: 'ic_heal', max: 5, cost: (l) => 15 + l * 15, desc: (l) => `+${l * 10} max HP` },
  { id: 'might', name: 'Might', icon: 'ic_sword', max: 5, cost: (l) => 20 + l * 20, desc: (l) => `+${l * 8}% damage` },
  { id: 'swift', name: 'Swiftness', icon: 'ic_swift', max: 3, cost: (l) => 20 + l * 25, desc: (l) => `+${l * 5}% move speed` },
  { id: 'greed', name: 'Greed', icon: 'gold', max: 3, cost: (l) => 15 + l * 20, desc: (l) => `+${l * 20}% gold, start with ${l * 15} gold` },
  { id: 'wisdom', name: 'Wisdom', icon: 'orb', max: 3, cost: (l) => 20 + l * 25, desc: (l) => `+${l * 12}% experience` },
  { id: 'choice', name: 'Insight', icon: 'crystal', max: 1, cost: () => 120, desc: () => 'Level-ups offer 4 choices' },
  { id: 'revive', name: 'Second Wind', icon: 'ic_deathsdoor', max: 1, cost: () => 150, desc: () => 'Once per run, revive at 50% HP' },
];

export const metaLevel = (id: string) => meta.levels[id] ?? 0;
