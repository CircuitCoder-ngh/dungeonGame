export interface Theme {
  id: string;
  name: string;
  floor: string; // sprite name
  wall: string;
  /** darkness of unlit areas, 0..1 */
  dark: number;
  /** tint of the ambient darkness */
  shade: string;
  /** colour of the light around the player */
  light: string;
  /** colour used for enemy bullets */
  bullet: string;
  enemies: string[];
  boss: string;
  decor: string[];
  pit: string; // colour of pits / chasms
}

export const THEMES: Theme[] = [
  {
    id: 'crypt',
    name: 'The Crypt',
    floor: 'floor_crypt',
    wall: 'wall_crypt',
    dark: 0.5,
    shade: '8,6,16',
    light: '255,190,120',
    bullet: '#ff5a5a',
    enemies: ['rat', 'bat', 'slime', 'skeleton', 'goblin', 'spider'],
    boss: 'jelly_king',
    decor: ['web', 'column', 'statue_sword'],
    pit: '#050308',
  },
  {
    id: 'sewer',
    name: 'The Sewers',
    floor: 'floor_sewer',
    wall: 'wall_sewer',
    dark: 0.48,
    shade: '4,12,8',
    light: '200,255,170',
    bullet: '#b8ff4a',
    enemies: ['rat', 'slime', 'jelly', 'snake', 'kobold', 'eye', 'spider', 'orc'],
    boss: 'hydra',
    decor: ['column', 'web'],
    pit: '#03140c',
  },
  {
    id: 'bone',
    name: 'The Ossuary',
    floor: 'floor_bone',
    wall: 'wall_bone',
    dark: 0.52,
    shade: '10,6,14',
    light: '220,200,255',
    bullet: '#c77dff',
    enemies: ['skeleton', 'zombie', 'ghost', 'mummy', 'skull', 'necro', 'vbat', 'phantom'],
    boss: 'lich',
    decor: ['statue_angel', 'column', 'web'],
    pit: '#07040c',
  },
  {
    id: 'ice',
    name: 'Frozen Depths',
    floor: 'floor_ice',
    wall: 'wall_ice',
    dark: 0.42,
    shade: '6,10,24',
    light: '190,225,255',
    bullet: '#7fdcff',
    enemies: ['ice_beast', 'white_imp', 'winter_orb', 'wolf', 'azure', 'ice_devil', 'frost_cannon'],
    boss: 'dragon',
    decor: ['column', 'statue_sword'],
    pit: '#02061a',
  },
  {
    id: 'hell',
    name: 'The Inferno',
    floor: 'floor_hell',
    wall: 'wall_hell',
    dark: 0.45,
    shade: '24,4,2',
    light: '255,160,90',
    bullet: '#ffb13b',
    enemies: ['crimson_imp', 'hell_hound', 'fire_elem', 'red_devil', 'fiend', 'mortar', 'wisp'],
    boss: 'balrug',
    decor: ['column', 'statue_angel'],
    pit: '#1a0300',
  },
];

export const FLOORS_TO_WIN = THEMES.length;

export function themeForFloor(floor: number): Theme {
  return THEMES[(floor - 1) % THEMES.length];
}
