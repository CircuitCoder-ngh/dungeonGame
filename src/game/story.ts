// All of the game's narrative lives here so the writing is easy to edit.
//
// The story: beneath the town of Hollowmere burns the Heartfire, a flame that
// holds shut a seal on something ancient. Each generation a Warden descends to
// tend it. Warden Maren went down and never came back; now the dead stir and
// the wells freeze. The hero descends to find her and rekindle the fire. Maren's
// spirit, a small blue light, guides them down.

export interface Actor {
  sprite: string;
  /** horizontal position across the stage, 0..100 */
  x: number;
  /** vertical position of the feet, 0..100 */
  y: number;
  scale?: number;
  anim?: 'float' | 'flicker' | 'pulse' | 'sway';
  flip?: boolean;
  frame?: number;
}

export interface Panel {
  art: Actor[];
  text: string;
  speaker?: string;
  /** background tint of the panel */
  sky?: string;
}

export interface Line {
  speaker: string;
  portrait: string;
  text: string;
  color?: string;
}

export const MAREN = 'Maren';
const MAREN_COLOR = '#9fe6ff';

export const maren = (text: string): Line => ({ speaker: MAREN, portrait: 'maren_ghost', text, color: MAREN_COLOR });

const town: Actor[] = [
  { sprite: 'tree_dead', frame: 0, x: 12, y: 78, scale: 3, anim: 'sway' },
  { sprite: 'tree_dead', frame: 1, x: 88, y: 80, scale: 3 },
  { sprite: 'archway', x: 50, y: 74, scale: 4 },
];

export function introPanels(heroId: string): Panel[] {
  const hero = HERO_STORY[heroId] ?? HERO_STORY.knight;
  return [
    {
      sky: '#141022',
      art: [...town, { sprite: 'villager', frame: 0, x: 30, y: 84, scale: 2.5 }, { sprite: 'villager', frame: 2, x: 70, y: 84, scale: 2.5, flip: true }],
      text: 'For three hundred years the town of Hollowmere has slept above the old catacombs, kept safe by a flame that no one living has ever seen.',
    },
    {
      sky: '#1d0c08',
      art: [{ sprite: 'heartfire', x: 50, y: 70, scale: 5, anim: 'pulse' }],
      text: 'Far below burns the Heartfire. Its light holds shut a seal on something older than the town, older than the dungeon itself.',
    },
    {
      sky: '#0e1424',
      art: [{ sprite: 'maren', x: 50, y: 80, scale: 4 }],
      text: 'Every generation a Warden descends to tend the flame. At the turn of the season, Warden Maren took up her lantern and went down. She has not come back.',
    },
    {
      sky: '#0b0f1a',
      art: [{ sprite: 'heartfire_dim', x: 50, y: 72, scale: 5, anim: 'flicker' }],
      text: 'Since then the wells have frozen at midsummer. The dead do not stay in their graves. And at night, the stones beneath the town are warm.',
    },
    {
      sky: '#160f1e',
      art: [{ sprite: hero.sprite, x: 50, y: 80, scale: 4 }, { sprite: 'tree_dead', frame: 2, x: 16, y: 82, scale: 3 }],
      text: hero.why,
    },
    {
      sky: '#100c18',
      art: [{ sprite: 'stairs', x: 50, y: 74, scale: 4 }, { sprite: 'wisp_guide', x: 63, y: 52, scale: 2.5, anim: 'float' }],
      text: 'Find Maren. Rekindle the Heartfire. Descend.',
    },
  ];
}

export function endingPanels(heroId: string): Panel[] {
  const hero = HERO_STORY[heroId] ?? HERO_STORY.knight;
  return [
    {
      sky: '#2a0e06',
      art: [{ sprite: 'heartfire', x: 50, y: 80, scale: 4.5, anim: 'pulse' }],
      text: 'The Balrug falls, and with its last breath the stolen light pours back into the Heartfire. The deep halls blaze gold.',
    },
    {
      sky: '#0e1424',
      art: [
        { sprite: 'maren_ghost', x: 42, y: 80, scale: 4, anim: 'float' },
        { sprite: hero.sprite, x: 62, y: 82, scale: 3.5, flip: true },
      ],
      speaker: MAREN,
      text: "It's burning again. I can feel the seal closing... Thank you. Now I can rest.",
    },
    {
      sky: '#16122a',
      art: [{ sprite: hero.sprite, x: 50, y: 80, scale: 4 }, { sprite: 'heartfire', x: 72, y: 60, scale: 2, anim: 'pulse' }],
      text: hero.ending,
    },
    {
      sky: '#141022',
      art: [...town, { sprite: 'villager', frame: 1, x: 32, y: 84, scale: 2.5 }],
      text: 'Spring returns to Hollowmere. But far beneath the Heartfire, something else has begun to dig...\n\nEndless mode unlocked.',
    },
  ];
}

interface HeroStory {
  sprite: string;
  why: string;
  ending: string;
  /** one remark per floor theme on arrival */
  arrive: string[];
  death: string;
}

export const HERO_STORY: Record<string, HeroStory> = {
  knight: {
    sprite: 'hero_knight',
    why: 'Sir Aldric, sworn shield of the Wardens, takes up the oath Maren left unfinished. He has never once turned back.',
    ending: 'Aldric carries Maren\'s lantern home and takes her place as Warden of Hollowmere. He tends the flame for forty years.',
    arrive: [
      "Hold fast, Warden. I'm right behind your light.",
      "Sewers. Of course it's sewers.",
      "An oathbreaker. I'll show him what an oath is worth.",
      'Cold steel, colder halls. Keep moving.',
      'Stay with me, Maren. We finish this together.',
    ],
    death: 'Aldric falls, his oath unbroken.',
  },
  mage: {
    sprite: 'hero_mage',
    why: "Ysolde, Maren's apprentice, knows the old wards better than anyone alive, and she refuses to believe her teacher is gone.",
    ending: 'Ysolde stays by the flame for a night and a day, learning its song. Hollowmere has a new Warden.',
    arrive: [
      "Teacher...! No. I'll grieve later. Lead the way.",
      'Ash in the water. The wards are failing faster than I feared.',
      "Vorhal's bindings were my thesis. I know exactly how to break him.",
      'Frost-runes... these were carved to keep something in.',
      "I'll rekindle it, Teacher. Just like you taught me.",
    ],
    death: "Ysolde's light gutters out.",
  },
  rogue: {
    sprite: 'hero_rogue',
    why: "Corwin, Maren's younger brother, has hunted every tunnel beneath Hollowmere. He is going to bring his sister home.",
    ending: "Corwin carries his sister's lantern up into the morning. Hollowmere sleeps warm again.",
    arrive: [
      "Mar. Always running ahead of everyone. I've got you.",
      "Smells like home. That's not a compliment.",
      'Lots of bones down here. None of them yours. Good.',
      "Should've brought a thicker cloak.",
      "Let's go light a fire, sis.",
    ],
    death: 'Corwin goes still in the dark.',
  },
};

/** Maren's words when the hero reaches each floor (by theme order). */
export const FLOOR_STORY: { title: string; lines: string[]; lore: string }[] = [
  {
    title: 'The Crypt',
    lines: [
      "You came... I hoped no one would. My body lies far below. This light is all that's left of me.",
      'Follow my light. I will show you the way down.',
    ],
    lore: "The town's honoured dead lie in the Crypt, and Hollowmere still leaves offerings at its gate. Something down here has been eating them, and growing.",
  },
  {
    title: 'The Sewers',
    lines: ["The Heartfire's ash washes down into these tunnels. Everything that drinks it... changes."],
    lore: 'The old cisterns carry the runoff of the deep. As the Heartfire weakened its ash turned bitter, and the creatures of the sewers swelled on it.',
  },
  {
    title: 'The Ossuary',
    lines: ['Vorhal is buried here: the first Warden. He broke his oath and was laid to rest in chains.', "I fear his chains are broken. The dead answer to him now."],
    lore: 'Vorhal tended the Heartfire for ninety years before he tried to take its power for himself. The Wardens who followed him sealed him beneath a mountain of bones.',
  },
  {
    title: 'Frozen Depths',
    lines: ["Feel that cold? It's what the Heartfire was holding back.", 'The deeper we go, the less of the fire remains. Hurry.'],
    lore: 'The cold below Hollowmere is older than fire. A wyrm sleeps in it, and wakes whenever the Heartfire dims.',
  },
  {
    title: 'The Inferno',
    lines: ['This is where I fell. The seal is cracked, and it is awake.', 'Return its light to the Heartfire, and I can finally rest.'],
    lore: 'The Balrug was here before Hollowmere and before the Wardens. The Heartfire was never meant to destroy it. It was only ever meant to keep it asleep.',
  },
];

export const ENDLESS_LINE = maren('The Heartfire burns... yet the deep goes on. Something stirs beneath even the seal.');

export interface BossStory {
  /** spoken by the boss as the fight begins */
  taunt: string;
  /** spoken by the boss when it becomes enraged */
  enrage: string;
  /** Maren's words when it falls */
  defeat: string;
}

export const BOSS_STORY: Record<string, BossStory> = {
  jelly_king: {
    taunt: 'MORE... OFFERINGS... MORE!',
    enrage: 'HUNGRY! HUNGRY!',
    defeat: 'It grew fat on the gifts meant for the dead. Rest a moment, then take the stairs.',
  },
  hydra: {
    taunt: 'Five heads hiss as one: "Warm. You are warm. Give it to us."',
    enrage: '"Burn it. Drown it. EAT IT."',
    defeat: 'The water will run clean again. Keep going.',
  },
  lich: {
    taunt: 'Another Warden, come to tend a dying flame? I tended it for ninety years. Let it go out.',
    enrage: 'I WAS the Heartfire! I will not be chained again!',
    defeat: 'Vorhal... may you find the peace you refused us all.',
  },
  dragon: {
    taunt: 'The cold was here before the fire, little lantern. It will be here after.',
    enrage: 'Your flame is SMALL. I will put it out.',
    defeat: 'The cold is breaking. I can feel the Heartfire... barely. Hurry.',
  },
  balrug: {
    taunt: "THE WARDEN'S LIGHT IS MINE. YOURS WILL BE NEXT.",
    enrage: 'I AM THE FIRE BENEATH THE FIRE!',
    defeat: 'It is done...',
  },
};

/** One-time guidance from Maren, triggered by game events. */
export const HINTS: Record<string, string> = {
  locked: 'The doors seal when the dead wake. Clear a room to open the way onward.',
  cleared: "Well done. Follow my light. I'll lead you toward the way down.",
  levelup: "You're growing stronger. Choose well: your gifts build on one another.",
  treasure: "A Warden's shrine. Touch the orb and claim one relic.",
  shop: 'Old Tobin still trades down here, somehow. Gold buys what courage cannot.',
  fountain: 'A Warden-well. Drink and be mended. It holds only one draught.',
  elite: "That one glows with stolen Heartfire. Careful, it's far stronger.",
  lowhp: "You're badly hurt! Dash through danger. Nothing can touch you mid-dash.",
  bossdoor: 'I can feel it beyond this door. Ready yourself.',
  bullets: 'Your blade can cut their spells from the air. Slash the bolts away!',
};

export const DEATH_LINES = [
  'The light fades... but the Heartfire remembers you. Rise again.',
  'Not like this. Come back to me, and we will try again.',
  'Every Warden falls once. The worthy ones get back up.',
];
