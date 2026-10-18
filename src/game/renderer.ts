import { blitSprite, drawSprite, frameCount } from '../engine/sprites';
import { TAU } from '../engine/math';
import { BLOCK, DOOR, FLOOR, PIT, Room, TILE, WALL } from './dungeon';
import type { Enemy } from './enemies';
import type { Game } from './game';
import type { Bullet } from './projectiles';

/** Sprites whose DCSS art faces left; everything else is assumed to face right. */
const FACES_LEFT = new Set(['rat', 'bat', 'vbat', 'snake', 'spider', 'wolf', 'hell_hound', 'ice_beast', 'boss_hydra', 'boss_dragon', 'jelly', 'azure']);

const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

// soft white radial gradient used for all lights / glows
const glowSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
})();

const tintedGlows = new Map<string, HTMLCanvasElement>();
function tintedGlow(color: string): HTMLCanvasElement {
  let c = tintedGlows.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.drawImage(glowSprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    tintedGlows.set(color, c);
  }
  return c;
}

function buildRoomCache(room: Room, floorSprite: string, wallSprite: string, pitColor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = room.pw;
  c.height = room.ph;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const nWall = frameCount(wallSprite);
  for (let y = 0; y < room.h; y++)
    for (let x = 0; x < room.w; x++) {
      const t = room.at(x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (t === FLOOR || t === DOOR || t === PIT || t === BLOCK) blitSprite(g, floorSprite, room.floorVariant[y * room.w + x], px, py);
      if (t === DOOR) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(px, py, TILE, TILE);
      }
    }
  // pits: dark void with a lit lip on the far edge and depth gradient
  for (let y = 0; y < room.h; y++)
    for (let x = 0; x < room.w; x++) {
      if (room.at(x, y) !== PIT) continue;
      const px = x * TILE;
      const py = y * TILE;
      g.fillStyle = pitColor;
      g.fillRect(px, py, TILE, TILE);
      if (room.at(x, y - 1) !== PIT) {
        const grad = g.createLinearGradient(0, py, 0, py + 14);
        grad.addColorStop(0, 'rgba(0,0,0,0.9)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(px, py, TILE, 2);
        g.fillStyle = grad;
        g.fillRect(px, py + 2, TILE, 12);
      }
      if (room.at(x, y + 1) !== PIT) {
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(px, py + TILE - 2, TILE, 2);
      }
      if (room.at(x - 1, y) !== PIT) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(px, py, 2, TILE);
      }
      if (room.at(x + 1, y) !== PIT) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(px + TILE - 2, py, 2, TILE);
      }
    }
  // shadows cast onto the floor below/right of solid tiles
  for (let y = 0; y < room.h; y++)
    for (let x = 0; x < room.w; x++) {
      const t = room.at(x, y);
      if (t !== WALL && t !== BLOCK) continue;
      const below = room.at(x, y + 1);
      if (below === FLOOR || below === DOOR) {
        const grad = g.createLinearGradient(0, (y + 1) * TILE, 0, (y + 1) * TILE + 12);
        grad.addColorStop(0, 'rgba(0,0,0,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x * TILE, (y + 1) * TILE, TILE, 12);
      }
      const right = room.at(x + 1, y);
      if (right === FLOOR || right === DOOR) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect((x + 1) * TILE, y * TILE, 5, TILE);
      }
    }
  // walls & obstacles
  for (let y = 0; y < room.h; y++)
    for (let x = 0; x < room.w; x++) {
      const t = room.at(x, y);
      const px = x * TILE;
      const py = y * TILE;
      if (t === WALL) {
        blitSprite(g, wallSprite, hash(x, y) % nWall, px, py);
        // darken the face that looks into the room for a bit of depth
        if (room.at(x, y + 1) === FLOOR || room.at(x, y + 1) === DOOR) {
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(px, py + TILE - 7, TILE, 7);
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.fillRect(px, py, TILE, 2);
        }
      } else if (t === BLOCK) {
        const lone = ![
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => room.at(x + dx, y + dy) === BLOCK);
        if (lone) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath();
          g.ellipse(px + 16, py + 27, 12, 5, 0, 0, TAU);
          g.fill();
          blitSprite(g, 'column', hash(x, y) % 3, px, py);
        } else {
          blitSprite(g, wallSprite, hash(x, y) % nWall, px, py);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(px, py, TILE, 2);
          if (room.at(x, y + 1) !== BLOCK) {
            g.fillStyle = 'rgba(0,0,0,0.3)';
            g.fillRect(px, py + TILE - 6, TILE, 6);
          }
        }
      }
    }
  for (const d of room.decor) blitSprite(g, d.sprite, d.frame, d.x - TILE / 2, d.y - TILE / 2);
  return c;
}

export class Renderer {
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private game: Game,
  ) {
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
  }

  draw(): void {
    const { ctx, game: g } = this;
    const W = g.viewW;
    const H = g.viewH;
    const room = g.room;
    const theme = g.floor.theme;
    if (!room.cache) room.cache = buildRoomCache(room, theme.floor, theme.wall, theme.pit);

    const sx = g.shakeAmt > 0 ? (Math.random() - 0.5) * g.shakeAmt : 0;
    const sy = g.shakeAmt > 0 ? (Math.random() - 0.5) * g.shakeAmt : 0;
    const ox = Math.round(-g.camX + sx);
    const oy = Math.round(-g.camY + sy);

    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(room.cache, 0, 0);

    const t = g.time + performance.now() / 1000;
    this.drawDoors(room, t);
    this.drawTorches(room, t);
    this.drawHazards(t);
    this.drawFeature(t);
    this.drawPickups(t);
    this.drawActors(t);
    this.drawBullets();
    this.drawLobs();
    this.drawParticles();
    ctx.restore();

    this.drawLighting(ox, oy, t);

    // additive glows on top of the darkness so projectiles pop
    ctx.save();
    ctx.translate(ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of g.bullets) {
      const r = b.kind === 'wave' ? 26 : b.r * 4.5;
      ctx.globalAlpha = b.team === 'enemy' ? 0.55 : 0.4;
      ctx.drawImage(tintedGlow(b.color), b.x - r, b.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 0.5;
    for (const p of g.fx.particles) {
      if (!p.glow) continue;
      const r = p.size * 3;
      ctx.drawImage(tintedGlow(p.color), p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.restore();

    if (g.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${g.fade})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------ static-ish layers
  private drawDoors(room: Room, t: number): void {
    const { ctx } = this;
    if (!room.locked) return;
    for (let d = 0; d < 4; d++) {
      if (!room.doors[d]) continue;
      for (const [x, y] of room.doorCells(d)) {
        blitSprite(ctx, 'gate', 0, x * TILE, y * TILE);
        ctx.fillStyle = `rgba(255,60,40,${0.12 + Math.sin(t * 4) * 0.06})`;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }

  private drawTorches(room: Room, t: number): void {
    const { ctx } = this;
    for (const [x, y] of room.torches) {
      const px = x * TILE + 16;
      const py = y * TILE + 18;
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(px - 2, py, 4, 9);
      const f = Math.sin(t * 13 + x) * 1.2 + Math.sin(t * 7.3 + x * 2) * 0.8;
      ctx.fillStyle = '#ff7b1c';
      ctx.beginPath();
      ctx.ellipse(px, py - 3, 4, 6 + f * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.ellipse(px, py - 1, 2, 3.5 + f * 0.4, 0, 0, TAU);
      ctx.fill();
    }
  }

  private drawFeature(t: number): void {
    const { ctx, game: g } = this;
    const f = g.room.feature;
    if (!f) return;
    switch (f.kind) {
      case 'stairs':
        drawSprite(ctx, 'stairs', 0, f.x, f.y, { scale: 1.5 });
        this.label(f.x, f.y - 30, 'Descend', t);
        break;
      case 'fountain':
        drawSprite(ctx, f.used ? 'fountain_dry' : 'fountain', 0, f.x, f.y, { scale: 1.4 });
        break;
      case 'orb': {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y + 14, 12, 4, 0, 0, TAU);
        ctx.fill();
        drawSprite(ctx, 'statue_angel', 0, f.x, f.y + 4, { alpha: 0.9 });
        if (!f.used) drawSprite(ctx, 'orb', 0, f.x, f.y - 18 + Math.sin(t * 2.5) * 3);
        break;
      }
      case 'shop': {
        // a rug, the merchant and some wares
        ctx.fillStyle = '#5a1e22';
        ctx.fillRect(f.x - 46, f.y - 6, 92, 40);
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = 2;
        ctx.strokeRect(f.x - 42, f.y - 2, 84, 32);
        drawSprite(ctx, 'shop', 0, f.x, f.y - 30);
        drawSprite(ctx, 'merchant', 0, f.x, f.y + 14 + Math.sin(t * 2) * 0.6, { ay: 1 });
        drawSprite(ctx, 'gold', 2, f.x - 30, f.y + 16);
        drawSprite(ctx, 'potion', 0, f.x + 30, f.y + 14);
        break;
      }
    }
  }

  private label(x: number, y: number, _text: string, t: number): void {
    const { ctx } = this;
    ctx.fillStyle = `rgba(255,230,140,${0.5 + Math.sin(t * 4) * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 5);
    ctx.fill();
  }

  private drawHazards(t: number): void {
    const { ctx, game: g } = this;
    for (const h of g.hazards) {
      const k = Math.min(1, h.t / h.delay);
      if (h.fired) continue;
      if (h.kind === 'circle') {
        ctx.fillStyle = withAlpha(h.color, 0.12 + k * 0.18);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(h.color, 0.7 + Math.sin(t * 20) * 0.2);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = withAlpha(h.color, 0.35);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * k, 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.angle);
        ctx.fillStyle = h.color;
        ctx.globalAlpha = 0.4 + k * 0.4;
        ctx.fillRect(0, -h.r, h.len, h.r * 2);
        ctx.restore();
      }
    }
  }

  private drawPickups(t: number): void {
    const { ctx, game: g } = this;
    for (const k of g.pickups) {
      const bob = Math.sin(t * 5 + k.x) * 1.5;
      if (k.kind === 'xp') {
        const s = k.value >= 10 ? 4 : k.value >= 3 ? 3 : 2;
        const c = k.value >= 10 ? '#ff7ad9' : k.value >= 3 ? '#7ad7ff' : '#8dff7a';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(k.x, k.y - s + bob);
        ctx.lineTo(k.x + s, k.y + bob);
        ctx.lineTo(k.x, k.y + s + bob);
        ctx.lineTo(k.x - s, k.y + bob);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(k.x - 1, k.y - 1 + bob, 1, 1);
      } else if (k.kind === 'gold') {
        drawSprite(ctx, 'gold', 0, k.x, k.y + bob - 2, { scale: 0.8 });
      } else {
        drawSprite(ctx, 'potion', 0, k.x, k.y + bob - 4, { scale: 0.75 });
      }
    }
  }

  // ------------------------------------------------------------ actors
  private drawActors(t: number): void {
    const { ctx, game: g } = this;
    const p = g.player;
    // shadows first
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (const e of g.enemies) {
      if (e.spawnT > 0.3) continue;
      const k = e.scale * (e.def.scale && e.boss ? 1 : 1);
      const lift = Math.max(0.4, 1 - e.z / 60);
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.75 + (e.flying && !e.boss ? 4 : 0), e.r * 0.95 * lift * Math.min(1.4, k), e.r * 0.35 * lift, 0, 0, TAU);
      ctx.fill();
    }
    if (!p.dead) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 10, 8, 3, 0, 0, TAU);
      ctx.fill();
    }

    // nova aura under everything
    if (p.novaT > 0) {
      const r = p.stats.novaRadius;
      const a = Math.min(1, p.novaT * 2) * 0.22;
      ctx.fillStyle = `rgba(190,120,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(220,170,255,${a * 3})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const actors: ({ y: number; draw: () => void })[] = [];
    for (const e of g.enemies) actors.push({ y: e.y, draw: () => this.drawEnemy(e, t) });
    if (!p.dead) actors.push({ y: p.y, draw: () => this.drawPlayer(t) });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();

    // slash sweep
    if (p.slashT > 0) {
      const k = 1 - p.slashT / 0.22;
      const s = p.stats;
      const start = p.slashAngle - s.slashArc / 2;
      const sweep = s.slashArc * Math.min(1, k * 1.8);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = i === 0 ? '#ffffff' : i === 1 ? '#fff4c2' : 'rgba(255,220,150,0.5)';
        ctx.lineWidth = 6 - i * 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.slashRange - 8 - i * 5, start, start + sweep);
        ctx.stroke();
      }
      ctx.restore();
    }

    // orbiting orbs and familiars
    for (let i = 0; i < p.stats.orbits; i++) {
      const [ox, oy] = p.orbitPos(i);
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox - 1, oy - 2, 2, 2);
    }
    for (let i = 0; i < p.stats.spheres; i++) {
      const [sx, sy] = p.spherePos(i, g.time);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,180,0.6)';
      ctx.beginPath();
      ctx.arc(sx, sy, 6 + Math.sin(t * 6 + i) * 1, 0, TAU);
      ctx.stroke();
    }

    // chain lightning
    ctx.strokeStyle = '#bff';
    ctx.lineWidth = 1.5;
    for (const a of g.chainArcs) {
      ctx.globalAlpha = a.life / 0.18;
      ctx.beginPath();
      ctx.moveTo(a.x0, a.y0);
      const n = 5;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        ctx.lineTo(a.x0 + (a.x1 - a.x0) * k + (Math.random() - 0.5) * 10, a.y0 + (a.y1 - a.y0) * k + (Math.random() - 0.5) * 10);
      }
      ctx.lineTo(a.x1, a.y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayer(t: number): void {
    const { ctx, game: g } = this;
    const p = g.player;
    for (const a of p.afterimages) drawSprite(ctx, p.hero.sprite, 0, a.x, a.y - 4, { flip: a.flip, alpha: a.life * 1.6, flash: 0.6 });
    const bob = p.moving ? -Math.abs(Math.sin(p.walkT * 5)) * 2 : Math.sin(t * 2) * 0.5;
    const squash = p.moving ? 1 + Math.sin(p.walkT * 10) * 0.03 : 1;
    const blink = p.invuln > 0 && p.hurtFlash <= 0 && Math.floor(t * 20) % 2 === 0;
    drawSprite(ctx, p.hero.sprite, 0, p.x, p.y + 12 + bob, {
      ay: 1,
      flip: p.facing < 0,
      scaleY: squash,
      scaleX: 2 - squash,
      alpha: blink ? 0.45 : 1,
      flash: p.hurtFlash,
    });
  }

  private drawEnemy(e: Enemy, t: number): void {
    const { ctx } = this;
    const name = e.def.sprite;
    let flip = e.facing < 0;
    if (FACES_LEFT.has(name)) flip = !flip;
    const s = e.scale;
    if (e.spawnT > 0) {
      // summoning circle, then the monster rises out of it
      const k = Math.max(0, Math.min(1, 1 - e.spawnT / 0.6));
      ctx.strokeStyle = `rgba(190,130,255,${0.8 - k * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y + e.r * 0.6, 4 + e.r * 1.2 * Math.min(1, k * 2), 0, TAU);
      ctx.stroke();
      if (k > 0.4) drawSprite(ctx, name, 0, e.x, e.y + e.r * 0.8 + 6, { ay: 1, scale: s * (k - 0.4) / 0.6, alpha: (k - 0.4) / 0.6, flip, flash: 1 - k });
      return;
    }
    if (e.elite) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(t * 5) * 0.1;
      const r = e.r * 2.6;
      ctx.drawImage(tintedGlow('#ffb02e'), e.x - r, e.y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    let sx = 1;
    let sy = 1;
    let yOff = 0;
    if (e.move === 'hop' || e.z > 0) {
      sy = 1 + e.z * 0.006;
      sx = 1 - e.z * 0.004;
    } else if (e.def.ai === 'hop') {
      const b = Math.sin(e.age * 8) * 0.06;
      sy = 1 - b;
      sx = 1 + b;
    } else if (e.flying) yOff = Math.sin(e.age * 4) * 2 - 3;
    else if (e.move !== 'hold') yOff = -Math.abs(Math.sin(e.age * 9)) * 1.5;
    let flash = e.flash;
    if (e.tell > 0) flash = Math.max(flash, 0.35 + Math.sin(t * 40) * 0.35);
    if (e.tell > 0) {
      sx *= 1.06;
      sy *= 1.06;
    }
    const footY = e.y + e.r * 0.8 + 3 - e.z + yOff;
    drawSprite(ctx, name, 0, e.x, footY, { ay: 1, scaleX: s * sx, scaleY: s * sy, flip, alpha: e.fade, flash });
    if (e.slowT > 0) {
      ctx.fillStyle = 'rgba(120,200,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.r * 0.6, e.r, e.r * 0.4, 0, 0, TAU);
      ctx.fill();
    }
    // small health bar once damaged (bosses use the big HUD bar)
    if (!e.boss && e.hp < e.maxHp) {
      const w = Math.max(14, e.r * 2);
      const y = footY - 32 * s * sy - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 4);
      ctx.fillStyle = e.elite ? '#ffb02e' : '#e8413c';
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 2);
    }
  }

  // ------------------------------------------------------------ projectiles & particles
  private drawBullets(): void {
    for (const b of this.game.bullets) this.drawBullet(b);
  }

  private drawBullet(b: Bullet): void {
    const { ctx } = this;
    const a = b.angle;
    switch (b.kind) {
      case 'bolt': {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.r * 1.4;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(b.x - Math.cos(a) * 9, b.y - Math.sin(a) * 9);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (b.crit ? 1.3 : 1), 0, TAU);
        ctx.fill();
        ctx.lineCap = 'butt';
        break;
      }
      case 'wave': {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.globalAlpha = Math.min(1, b.life * 3);
        ctx.strokeStyle = '#ffd08a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(-6, 0, 12, -1.1, 1.1);
        ctx.stroke();
        ctx.strokeStyle = '#ff7b1c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-10, 0, 12, -1.1, 1.1);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'arrow': {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#d9c7a0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(3, 0);
        ctx.stroke();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(1, -2.5);
        ctx.lineTo(1, 2.5);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillStyle = '#e8fbff';
        ctx.strokeStyle = '#3a8fc0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.r + 3, 0);
        ctx.lineTo(0, -b.r * 0.7);
        ctx.lineTo(-b.r - 2, 0);
        ctx.lineTo(0, b.r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      default: {
        // enemy orbs: dark rim + bright core so they read on any floor
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 1.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.45, 0, TAU);
        ctx.fill();
      }
    }
  }

  private drawLobs(): void {
    const { ctx, game: g } = this;
    for (const l of g.lobs) {
      const k = Math.min(1, l.hz.t / l.hz.delay);
      const x = l.x0 + (l.hz.x - l.x0) * k;
      const y = l.y0 + (l.hz.y - l.y0) * k - Math.sin(k * Math.PI) * 70;
      ctx.fillStyle = l.hz.color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 2, 0, TAU);
      ctx.fill();
    }
  }

  private drawParticles(): void {
    const { ctx, game: g } = this;
    for (const p of g.fx.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = p.color;
      if (p.streak) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        const s = p.size * (0.5 + a * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    for (const r of g.fx.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 3), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ lighting
  private drawLighting(ox: number, oy: number, t: number): void {
    const { ctx, game: g, light, lctx } = this;
    const W = g.viewW;
    const H = g.viewH;
    if (light.width !== W || light.height !== H) {
      light.width = W;
      light.height = H;
    }
    const theme = g.floor.theme;
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = `rgba(${theme.shade},${theme.dark})`;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      lctx.globalAlpha = a;
      lctx.drawImage(glowSprite, x + ox - r, y + oy - r, r * 2, r * 2);
    };
    const p = g.player;
    const flicker = Math.sin(t * 9) * 3 + Math.sin(t * 23) * 1.5;
    hole(p.x, p.y, 210 + flicker, 1);
    hole(p.x, p.y, 110, 0.7);
    for (const [x, y] of g.room.torches) hole(x * TILE + 16, y * TILE + 26, 85 + Math.sin(t * 11 + x) * 4, 0.9);
    for (const e of g.enemies) {
      if (e.def.glow) hole(e.x, e.y, e.boss ? 120 : 55, 0.8);
      if (e.boss) hole(e.x, e.y, 110, 0.5);
    }
    for (const b of g.bullets) hole(b.x, b.y, b.team === 'enemy' ? 26 : 22, 0.7);
    for (const h of g.hazards) if (!h.fired && h.kind === 'circle') hole(h.x, h.y, h.r * 1.6, 0.6);
    const f = g.room.feature;
    if (f) hole(f.x, f.y, 90, 0.8);
    if (p.novaT > 0) hole(p.x, p.y, p.stats.novaRadius * 1.4, 0.7);
    lctx.globalAlpha = 1;
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(light, 0, 0);

    // warm/cold coloured light around the player and torches
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    const pc = tintedGlow(`rgb(${theme.light})`);
    ctx.drawImage(pc, p.x + ox - 140, p.y + oy - 140, 280, 280);
    ctx.globalAlpha = 0.18;
    const tc = tintedGlow('rgb(255,150,60)');
    for (const [x, y] of g.room.torches) ctx.drawImage(tc, x * TILE + 16 + ox - 50, y * TILE + 22 + oy - 50, 100, 100);
    ctx.restore();
  }
}

function withAlpha(color: string, a: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const gg = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${gg},${b},${a})`;
  }
  return color;
}
