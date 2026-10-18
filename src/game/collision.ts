import { BLOCK, DOOR, FLOOR, PIT, Room, TILE, WALL } from './dungeon';

/** What a mover is allowed to pass through. */
export const enum Mask {
  Walker, // blocked by walls, blocks, pits, doors
  Flyer, // blocked by walls, blocks, doors (flies over pits)
  Ghost, // blocked by outer walls/doors only
  Player, // like Walker, but open doors are passable
}

export function solidFor(room: Room, tx: number, ty: number, mask: Mask): boolean {
  const t = room.at(tx, ty);
  switch (t) {
    case FLOOR:
      return false;
    case WALL:
      return true;
    case DOOR:
      return mask !== Mask.Player || room.locked;
    case PIT:
      return mask === Mask.Walker || mask === Mask.Player;
    case BLOCK:
      return mask !== Mask.Ghost;
  }
  return true;
}

/** Bullets fly over pits but stop at walls, blocks and closed doors. */
export function blocksShot(room: Room, x: number, y: number): boolean {
  const t = room.at(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === WALL || t === BLOCK || t === DOOR;
}

function boxHits(room: Room, x: number, y: number, r: number, mask: Mask): boolean {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r - 0.001) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidFor(room, tx, ty, mask)) return true;
  return false;
}

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
}

const result: MoveResult = { x: 0, y: 0, hitX: false, hitY: false };

/**
 * Move an axis-aligned box of half-size r by (dx,dy) with wall sliding.
 * With `nudge`, the mover is eased around corners it only clips slightly,
 * which makes threading 3-tile doorways painless on a touch stick.
 */
export function moveBox(room: Room, x: number, y: number, r: number, dx: number, dy: number, mask: Mask, nudge = false): MoveResult {
  result.hitX = result.hitY = false;
  // substep so fast movers (dashes, knockback) can't tunnel through 1-tile blocks
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.4)));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      if (!boxHits(room, x + sx, y, r, mask)) x += sx;
      else {
        result.hitX = true;
        if (nudge && Math.abs(sy) < Math.abs(sx) * 0.5) {
          const n = cornerNudge(room, x + sx, y, r, mask, 'y');
          if (n !== 0) y += Math.sign(n) * Math.min(Math.abs(n), Math.abs(sx));
        }
      }
    }
    if (sy !== 0) {
      if (!boxHits(room, x, y + sy, r, mask)) y += sy;
      else {
        result.hitY = true;
        if (nudge && Math.abs(sx) < Math.abs(sy) * 0.5) {
          const n = cornerNudge(room, x, y + sy, r, mask, 'x');
          if (n !== 0) x += Math.sign(n) * Math.min(Math.abs(n), Math.abs(sy));
        }
      }
    }
  }
  result.x = x;
  result.y = y;
  return result;
}

/** Find a small perpendicular offset (up to ~0.7r) that frees the box. */
function cornerNudge(room: Room, x: number, y: number, r: number, mask: Mask, axis: 'x' | 'y'): number {
  const limit = r * 0.9 + 4;
  for (let o = 1; o <= limit; o += 1) {
    for (const s of [o, -o]) {
      const tx = axis === 'x' ? x + s : x;
      const ty = axis === 'y' ? y + s : y;
      if (!boxHits(room, tx, ty, r, mask)) return s;
    }
  }
  return 0;
}

export function freeAt(room: Room, x: number, y: number, r: number, mask: Mask): boolean {
  return !boxHits(room, x, y, r, mask);
}

/** True if a straight shot from a to b is unobstructed. */
export function lineOfSight(room: Room, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (blocksShot(room, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/**
 * Breadth-first distance field (in steps) from the target tile over walkable
 * tiles. Ground enemies descend it to path around obstacles and pits.
 */
export class FlowField {
  dist: Int16Array;
  tx = -999;
  ty = -999;
  constructor(private room: Room) {
    this.dist = new Int16Array(room.w * room.h);
  }

  update(px: number, py: number): void {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx === this.tx && ty === this.ty) return;
    this.tx = tx;
    this.ty = ty;
    const { room, dist } = this;
    const w = room.w;
    dist.fill(-1);
    if (tx < 0 || ty < 0 || tx >= w || ty >= room.h) return;
    const q = new Int32Array(w * room.h);
    let head = 0;
    let tail = 0;
    q[tail++] = ty * w + tx;
    dist[ty * w + tx] = 0;
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      const y = (i / w) | 0;
      const nd = dist[i] + 1;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (solidFor(room, nx, ny, Mask.Walker)) continue;
          if (dx && dy && (solidFor(room, x + dx, y, Mask.Walker) || solidFor(room, x, y + dy, Mask.Walker))) continue;
          const j = ny * w + nx;
          if (dist[j] !== -1) continue;
          dist[j] = nd;
          q[tail++] = j;
        }
    }
  }

  /** Direction (unit vector) to walk from pixel position, or null if unreachable. */
  dir(x: number, y: number): [number, number] | null {
    const { room, dist } = this;
    const w = room.w;
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    const here = dist[cy * w + cx];
    if (here === undefined || here < 0) return null;
    let best = here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= room.h) continue;
        const d = dist[ny * w + nx];
        if (d < 0) continue;
        if (dx && dy && (solidFor(room, cx + dx, cy, Mask.Walker) || solidFor(room, cx, cy + dy, Mask.Walker))) continue;
        if (d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    if (best === here) return null;
    const gx = (cx + bx + 0.5) * TILE - x;
    const gy = (cy + by + 0.5) * TILE - y;
    const m = Math.hypot(gx, gy) || 1;
    return [gx / m, gy / m];
  }
}
