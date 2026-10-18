import { rand, TAU } from '../engine/math';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  drag: number;
  grav: number;
  glow: boolean;
  /** draw as a short streak along velocity */
  streak?: boolean;
}

export interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

/** A telegraphed attack: shown as a warning, then deals damage when it fires. */
export interface Hazard {
  kind: 'circle' | 'line';
  x: number;
  y: number;
  r: number; // circle radius or line half-width
  angle: number;
  len: number;
  delay: number;
  t: number;
  dmg: number;
  color: string;
  fired: boolean;
  /** extra effect when it fires (spawn bullets etc.) */
  onFire?: () => void;
  /** keep dealing damage for this long after firing */
  linger: number;
}

export class Effects {
  particles: Particle[] = [];
  rings: Ring[] = [];
  texts: FloatText[] = [];

  burst(x: number, y: number, color: string, n: number, speed = 80, size = 2, life = 0.5, glow = false): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        color,
        size: size * (0.6 + Math.random() * 0.8),
        drag: 4,
        grav: 0,
        glow,
      });
    }
  }

  sparks(x: number, y: number, angle: number, color: string, n: number, speed = 160): void {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-0.7, 0.7);
      const s = speed * rand(0.4, 1.2);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.3), max: 0.3, color, size: 1.5, drag: 6, grav: 0, glow: true, streak: true });
    }
  }

  /** Little puff of dust at the feet (footsteps, landings). */
  dust(x: number, y: number, n = 3, color = 'rgba(200,190,170,0.6)'): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x: x + rand(-4, 4), y: y + rand(-2, 2), vx: rand(-20, 20), vy: rand(-25, -5), life: rand(0.25, 0.45), max: 0.45, color, size: rand(1.5, 3), drag: 3, grav: 0, glow: false });
    }
  }

  gore(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = rand(40, 140);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.35, 0.7), max: 0.7, color, size: rand(1.5, 3.5), drag: 3, grav: 260, glow: false });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, life = 0.35, width = 3): void {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  }

  text(x: number, y: number, text: string, color = '#fff', size = 8, life = 0.7): void {
    this.texts.push({ x: x + rand(-4, 4), y, vy: -38, text, color, life, max: life, size });
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
  }
}
