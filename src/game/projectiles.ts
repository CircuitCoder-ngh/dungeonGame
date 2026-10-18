import { blocksShot } from './collision';
import { Room } from './dungeon';

export type BulletKind = 'bolt' | 'orb' | 'wave' | 'shard' | 'fire' | 'skull' | 'arrow';

export class Bullet {
  vx: number;
  vy: number;
  r = 3;
  dmg = 10;
  team: 'player' | 'enemy' = 'enemy';
  color = '#fff';
  life = 3;
  pierce = 0;
  bounce = 0;
  homing = 0;
  explode = 0;
  crit = false;
  kind: BulletKind = 'orb';
  /** acceleration along velocity (px/s^2), can be negative */
  accel = 0;
  /** angular velocity of the heading (rad/s) for curving shots */
  turn = 0;
  maxSpeed = 600;
  dead = false;
  /** targets already hit (for piercing shots) */
  hit = new Set<object>();
  /** passes through walls (e.g. fire waves don't, ghost skulls do) */
  ghost = false;
  /** player bullets: whether on-hit effects (chain, burn...) apply */
  procs = true;
  age = 0;

  constructor(
    public x: number,
    public y: number,
    angle: number,
    speed: number,
  ) {
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  get angle() {
    return Math.atan2(this.vy, this.vx);
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  /** Returns true if the bullet hit a wall this frame (and died). */
  update(dt: number, room: Room, target: { x: number; y: number } | null): boolean {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return false;
    }
    let sp = this.speed;
    let a = this.angle;
    if (this.turn) a += this.turn * dt;
    if (this.homing && target) {
      const want = Math.atan2(target.y - this.y, target.x - this.x);
      let d = want - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a += Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
    }
    if (this.accel) sp = Math.max(20, Math.min(this.maxSpeed, sp + this.accel * dt));
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    if (!this.ghost && blocksShot(room, nx, ny)) {
      if (this.bounce > 0) {
        this.bounce--;
        // reflect on whichever axis is blocked
        if (blocksShot(room, nx, this.y)) this.vx = -this.vx;
        if (blocksShot(room, this.x, ny)) this.vy = -this.vy;
        this.hit.clear();
        return false;
      }
      this.dead = true;
      return true;
    }
    this.x = nx;
    this.y = ny;
    if (this.ghost && (nx < 0 || ny < 0 || nx > room.pw || ny > room.ph)) this.dead = true;
    return false;
  }
}
