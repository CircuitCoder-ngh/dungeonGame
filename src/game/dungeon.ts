import { Rng } from '../engine/math';
import { Theme, themeForFloor } from './themes';

export const TILE = 32;

export const FLOOR = 0;
export const WALL = 1;
export const BLOCK = 2; // obstacle inside the room
export const PIT = 3; // blocks walking, not bullets or flyers
export const DOOR = 4;

/** N, E, S, W */
export const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const opposite = (d: number) => (d + 2) % 4;

export type RoomKind = 'start' | 'combat' | 'boss' | 'treasure' | 'shop' | 'fountain';

export interface Decor {
  sprite: string;
  frame: number;
  x: number; // pixel centre
  y: number;
}

export interface Feature {
  kind: 'stairs' | 'orb' | 'shop' | 'fountain';
  x: number;
  y: number;
  used: boolean;
}

export class Room {
  w = 15;
  h = 11;
  tiles = new Uint8Array(0);
  doors = [false, false, false, false];
  decor: Decor[] = [];
  /** tile coords of wall torches */
  torches: [number, number][] = [];
  feature: Feature | null = null;
  visited = false;
  known = false; // shown on the minimap
  cleared = false;
  locked = false;
  waves = 1;
  /** loose pickups left behind when the player walks out (owned by the game) */
  leftovers: unknown[] = [];
  /** pre-rendered static layer (owned by the renderer) */
  cache: HTMLCanvasElement | null = null;
  floorVariant: Uint8Array = new Uint8Array(0);

  constructor(
    public gx: number,
    public gy: number,
    public kind: RoomKind,
    public seed: number,
  ) {}

  get pw() {
    return this.w * TILE;
  }
  get ph() {
    return this.h * TILE;
  }

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return WALL;
    return this.tiles[y * this.w + x];
  }
  set(x: number, y: number, v: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[y * this.w + x] = v;
  }

  /** Door cells for direction d (3 tiles wide, centred on the wall). */
  doorCells(d: number): [number, number][] {
    const cx = (this.w - 1) / 2;
    const cy = (this.h - 1) / 2;
    switch (d) {
      case 0:
        return [-1, 0, 1].map((o) => [cx + o, 0]);
      case 1:
        return [-1, 0, 1].map((o) => [this.w - 1, cy + o]);
      case 2:
        return [-1, 0, 1].map((o) => [cx + o, this.h - 1]);
      default:
        return [-1, 0, 1].map((o) => [0, cy + o]);
    }
  }

  /** Pixel position just inside the room in front of door d (where the player appears). */
  doorEntry(d: number): [number, number] {
    const cx = this.pw / 2;
    const cy = this.ph / 2;
    switch (d) {
      case 0:
        return [cx, TILE * 1.7];
      case 1:
        return [this.pw - TILE * 1.7, cy];
      case 2:
        return [cx, this.ph - TILE * 1.7];
      default:
        return [TILE * 1.7, cy];
    }
  }

  isFloor(x: number, y: number): boolean {
    return this.at(x, y) === FLOOR;
  }

  /** Random walkable pixel position at least `minDist` px away from (px,py). */
  randomFloorPos(rng: Rng, px: number, py: number, minDist: number, margin = 2): [number, number] | null {
    for (let i = 0; i < 80; i++) {
      const tx = rng.int(margin, this.w - 1 - margin);
      const ty = rng.int(margin, this.h - 1 - margin);
      if (!this.isFloor(tx, ty)) continue;
      const x = (tx + 0.5) * TILE;
      const y = (ty + 0.5) * TILE;
      if ((x - px) ** 2 + (y - py) ** 2 < minDist * minDist) continue;
      return [x, y];
    }
    return null;
  }

  generate(theme: Theme): void {
    const rng = new Rng(this.seed);
    const sizes: Record<RoomKind, [number, number][]> = {
      start: [[15, 11]],
      treasure: [[13, 11]],
      shop: [[15, 11]],
      fountain: [[13, 11]],
      boss: [
        [27, 17],
        [25, 17],
      ],
      combat: [
        [15, 11],
        [17, 11],
        [19, 11],
        [17, 13],
        [21, 13],
        [23, 13],
        [19, 15],
        [25, 15],
        [13, 13],
        [27, 13],
      ],
    };
    [this.w, this.h] = rng.pick(sizes[this.kind]);
    this.waves = this.kind === 'combat' && this.w * this.h >= 280 && rng.chance(0.55) ? 2 : 1;

    for (let attempt = 0; attempt < 12; attempt++) {
      this.buildShell();
      if (this.kind === 'combat' && attempt < 11) this.placeObstacles(rng, attempt);
      if (this.kind === 'boss' && attempt < 11) this.placeBossObstacles(rng);
      if (this.connected()) break;
    }

    this.floorVariant = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.floorVariant.length; i++) {
      const r = rng.next();
      this.floorVariant[i] = r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3;
    }

    // torches along the top wall, avoiding the door
    this.torches = [];
    const cx = (this.w - 1) / 2;
    for (let x = 2; x < this.w - 2; x += rng.int(4, 6)) {
      if (Math.abs(x - cx) > 2) this.torches.push([x, 0]);
    }

    this.decor = [];
    // cobwebs in the corners
    if (theme.decor.includes('web')) {
      if (rng.chance(0.6)) this.decor.push({ sprite: 'web', frame: rng.int(0, 1), x: TILE * 1.5, y: TILE * 1.5 });
      if (rng.chance(0.6)) this.decor.push({ sprite: 'web', frame: rng.int(0, 1), x: this.pw - TILE * 1.5, y: TILE * 1.5 });
    }

    const mid: [number, number] = [this.pw / 2, this.ph / 2];
    switch (this.kind) {
      case 'treasure':
        this.feature = { kind: 'orb', x: mid[0], y: mid[1], used: false };
        break;
      case 'shop':
        this.feature = { kind: 'shop', x: mid[0], y: mid[1] - TILE, used: false };
        break;
      case 'fountain':
        this.feature = { kind: 'fountain', x: mid[0], y: mid[1], used: false };
        break;
    }
  }

  private buildShell(): void {
    this.tiles = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) this.set(x, y, WALL);
    for (let d = 0; d < 4; d++) if (this.doors[d]) for (const [x, y] of this.doorCells(d)) this.set(x, y, DOOR);
  }

  /** Tiles that must stay open: the inner ring and lanes in front of doors. */
  private reserved(x: number, y: number): boolean {
    if (x <= 1 || y <= 1 || x >= this.w - 2 || y >= this.h - 2) return true;
    const cx = (this.w - 1) / 2;
    const cy = (this.h - 1) / 2;
    if (Math.abs(x - cx) <= 1 && (y <= 3 || y >= this.h - 4)) return true;
    if (Math.abs(y - cy) <= 1 && (x <= 3 || x >= this.w - 4)) return true;
    return false;
  }

  /** Place a tile in all four mirrored quadrants for a designed look. */
  private mirrorSet(x: number, y: number, v: number, sym: number): void {
    const pts: [number, number][] = [[x, y]];
    if (sym >= 2) pts.push([this.w - 1 - x, y]);
    if (sym >= 4) pts.push([x, this.h - 1 - y], [this.w - 1 - x, this.h - 1 - y]);
    for (const [px, py] of pts) if (!this.reserved(px, py) && this.at(px, py) === FLOOR) this.set(px, py, v);
  }

  private placeObstacles(rng: Rng, attempt: number): void {
    const patterns = ['pillars', 'blocks', 'center', 'pits', 'cross', 'scatter', 'ring', 'lanes'];
    const pattern = rng.pick(patterns);
    const density = attempt > 6 ? 0.5 : 1;
    const hw = Math.floor(this.w / 2);
    const hh = Math.floor(this.h / 2);
    const cx = hw;
    const cy = hh;
    switch (pattern) {
      case 'pillars': {
        const step = rng.pick([3, 4]);
        for (let y = 3; y < hh; y += step) for (let x = 3; x < hw; x += step) this.mirrorSet(x, y, BLOCK, 4);
        break;
      }
      case 'blocks': {
        const n = Math.round(rng.int(1, 3) * density);
        for (let i = 0; i < n; i++) {
          const bx = rng.int(2, hw - 2);
          const by = rng.int(2, hh - 2);
          const bw = rng.int(1, 3);
          const bh = rng.int(1, 2);
          const t = rng.chance(0.25) ? PIT : BLOCK;
          for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) this.mirrorSet(x, y, t, 4);
        }
        break;
      }
      case 'center': {
        const rw = rng.int(1, Math.max(1, Math.floor(this.w / 5)));
        const rh = rng.int(1, Math.max(1, Math.floor(this.h / 5)));
        const t = rng.chance(0.5) ? PIT : BLOCK;
        for (let y = cy - rh; y <= cy + rh; y++) for (let x = cx - rw; x <= cx + rw; x++) this.mirrorSet(x, y, t, 1);
        break;
      }
      case 'pits': {
        const n = Math.round(rng.int(2, 4) * density);
        for (let i = 0; i < n; i++) {
          const px = rng.int(2, hw - 1);
          const py = rng.int(2, hh - 1);
          const r = rng.int(1, 2);
          for (let y = py - r; y <= py + r; y++)
            for (let x = px - r; x <= px + r; x++) if ((x - px) ** 2 + (y - py) ** 2 <= r * r + 0.5) this.mirrorSet(x, y, PIT, 4);
        }
        break;
      }
      case 'cross': {
        for (let x = 4; x < this.w - 4; x++) if (Math.abs(x - cx) > 1) this.mirrorSet(x, cy, PIT, 1);
        for (let y = 4; y < this.h - 4; y++) if (Math.abs(y - cy) > 1) this.mirrorSet(cx, y, PIT, 1);
        break;
      }
      case 'scatter': {
        const n = Math.round(((this.w * this.h) / 40) * density);
        for (let i = 0; i < n; i++) this.mirrorSet(rng.int(2, hw), rng.int(2, hh), BLOCK, 2);
        break;
      }
      case 'ring': {
        const rx = Math.floor(this.w / 4);
        const ry = Math.floor(this.h / 4);
        for (let y = cy - ry; y <= cy + ry; y++)
          for (let x = cx - rx; x <= cx + rx; x++) {
            const edge = Math.abs(x - cx) === rx || Math.abs(y - cy) === ry;
            const gap = Math.abs(x - cx) <= 1 || Math.abs(y - cy) <= 1;
            if (edge && !gap) this.mirrorSet(x, y, BLOCK, 1);
          }
        break;
      }
      case 'lanes': {
        for (let x = 3; x < this.w - 3; x += 4)
          for (let y = 3; y < this.h - 3; y++) if (Math.abs(y - cy) > 1 && rng.chance(0.85 * density)) this.mirrorSet(x, y, BLOCK, 1);
        break;
      }
    }
  }

  private placeBossObstacles(rng: Rng): void {
    // a few symmetric pillars to break line of sight
    const ox = Math.floor(this.w / 4);
    const oy = Math.floor(this.h / 4);
    if (rng.chance(0.7)) {
      for (const [x, y] of [
        [ox, oy],
        [this.w - 1 - ox, oy],
        [ox, this.h - 1 - oy],
        [this.w - 1 - ox, this.h - 1 - oy],
      ])
        this.set(x, y, BLOCK);
    }
  }

  /** All doors reachable from each other and most of the floor reachable. */
  private connected(): boolean {
    const seen = new Uint8Array(this.w * this.h);
    const start = [Math.floor(this.w / 2), Math.floor(this.h / 2)];
    // start from any open floor tile near the centre
    let sx = -1;
    let sy = -1;
    for (let r = 0; r < Math.max(this.w, this.h) && sx < 0; r++)
      for (let y = start[1] - r; y <= start[1] + r && sx < 0; y++)
        for (let x = start[0] - r; x <= start[0] + r; x++)
          if (this.at(x, y) === FLOOR) {
            sx = x;
            sy = y;
            break;
          }
    if (sx < 0) return false;
    const q = [sx, sy];
    seen[sy * this.w + sx] = 1;
    let count = 0;
    while (q.length) {
      const y = q.pop()!;
      const x = q.pop()!;
      count++;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const t = this.at(nx, ny);
        if ((t === FLOOR || t === DOOR) && !seen[ny * this.w + nx]) {
          seen[ny * this.w + nx] = 1;
          if (t === FLOOR) q.push(nx, ny);
          else count++;
        }
      }
    }
    let total = 0;
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === FLOOR || this.tiles[i] === DOOR) total++;
    return count >= total;
  }
}

export class Floor {
  rooms = new Map<string, Room>();
  start!: Room;
  boss!: Room;
  theme: Theme;

  constructor(
    public number: number,
    public seed: number,
  ) {
    this.theme = themeForFloor(number);
    this.generate();
  }

  static key(x: number, y: number) {
    return `${x},${y}`;
  }

  get(x: number, y: number): Room | undefined {
    return this.rooms.get(Floor.key(x, y));
  }

  neighbor(room: Room, d: number): Room | undefined {
    return this.get(room.gx + DIRS[d][0], room.gy + DIRS[d][1]);
  }

  private generate(): void {
    const rng = new Rng(this.seed);
    const target = Math.min(9 + this.number * 2, 18);
    let cells: [number, number][] = [];
    // Isaac-style growth: expand from the centre, refusing cells that would
    // touch more than one existing room so the map stays branchy.
    for (let tries = 0; tries < 200; tries++) {
      const occ = new Set<string>(['0,0']);
      cells = [[0, 0]];
      const queue: [number, number][] = [[0, 0]];
      while (queue.length && cells.length < target) {
        const [x, y] = queue.shift()!;
        for (const d of rng.shuffle([0, 1, 2, 3])) {
          if (cells.length >= target) break;
          const nx = x + DIRS[d][0];
          const ny = y + DIRS[d][1];
          const k = Floor.key(nx, ny);
          if (occ.has(k) || Math.abs(nx) > 4 || Math.abs(ny) > 3) continue;
          let neighbours = 0;
          for (const [dx, dy] of DIRS) if (occ.has(Floor.key(nx + dx, ny + dy))) neighbours++;
          if (neighbours > 1 || rng.chance(0.45)) continue;
          occ.add(k);
          cells.push([nx, ny]);
          queue.push([nx, ny]);
        }
        if (!queue.length && cells.length < target) queue.push(rng.pick(cells));
      }
      const deadEnds = cells.filter(([x, y], i) => i > 0 && DIRS.filter(([dx, dy]) => occ.has(Floor.key(x + dx, y + dy))).length === 1);
      if (cells.length >= target && deadEnds.length >= 3) break;
    }

    const occ = new Set(cells.map(([x, y]) => Floor.key(x, y)));
    const distOf = new Map<string, number>([['0,0', 0]]);
    const bfs: [number, number][] = [[0, 0]];
    while (bfs.length) {
      const [x, y] = bfs.shift()!;
      for (const [dx, dy] of DIRS) {
        const k = Floor.key(x + dx, y + dy);
        if (occ.has(k) && !distOf.has(k)) {
          distOf.set(k, distOf.get(Floor.key(x, y))! + 1);
          bfs.push([x + dx, y + dy]);
        }
      }
    }
    const deadEnds = cells
      .filter(([x, y], i) => i > 0 && DIRS.filter(([dx, dy]) => occ.has(Floor.key(x + dx, y + dy))).length === 1)
      .sort((a, b) => distOf.get(Floor.key(b[0], b[1]))! - distOf.get(Floor.key(a[0], a[1]))!);

    if (!deadEnds.length) {
      // degenerate layout (very unlikely): use the farthest room for the boss
      const far = cells.slice(1).sort((a, b) => distOf.get(Floor.key(b[0], b[1]))! - distOf.get(Floor.key(a[0], a[1]))!);
      deadEnds.push(far[0]);
    }
    const kinds = new Map<string, RoomKind>();
    kinds.set('0,0', 'start');
    const specials: RoomKind[] = ['boss', 'treasure', 'shop', 'fountain'];
    if (this.number >= 3) specials.push('treasure');
    deadEnds.forEach(([x, y], i) => {
      if (i < specials.length) kinds.set(Floor.key(x, y), specials[i]);
    });

    for (const [x, y] of cells) {
      const k = Floor.key(x, y);
      const room = new Room(x, y, kinds.get(k) ?? 'combat', (rng.next() * 2 ** 31) | 0);
      for (let d = 0; d < 4; d++) room.doors[d] = occ.has(Floor.key(x + DIRS[d][0], y + DIRS[d][1]));
      room.generate(this.theme);
      this.rooms.set(k, room);
      if (room.kind === 'start') this.start = room;
      if (room.kind === 'boss') this.boss = room;
    }
    this.start.visited = this.start.known = true;
    this.start.cleared = true;
    for (const r of this.rooms.values()) if (r.kind !== 'combat' && r.kind !== 'boss') r.cleared = true;
  }
}
