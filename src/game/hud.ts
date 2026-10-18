import { ButtonId, ButtonRect, Input, JOY_RADIUS } from '../engine/input';
import { TAU } from '../engine/math';
import { drawSprite, spriteSize } from '../engine/sprites';
import type { Enemy } from './enemies';
import type { Game } from './game';
import { settings } from './profile';
import type { Line } from './story';

export const FONT = '"Pixelify Sans", system-ui, sans-serif';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ICONS: Record<ButtonId, string> = { slash: 'ic_sword', nova: 'ic_blast', dash: 'ic_blink', pause: '' };
const KEYS: Record<string, string> = { slash: 'J', nova: 'K', dash: 'L' };

export class Hud {
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private bannerT = 0;
  private bannerTitle = '';
  private bannerSub = '';
  boss: Enemy | null = null;
  private bossShown = 0;
  /** queued dialogue; the head is the line being shown */
  private dialogue: { line: Line; wait: number; t: number }[] = [];

  constructor(
    private ctx: CanvasRenderingContext2D,
    private game: Game,
    private input: Input,
  ) {}

  /** Queue a line of dialogue (non-blocking). `delay` is extra wait before it appears. */
  say(line: Line, delay = 0, urgent = false): void {
    // drop stale chatter rather than letting a backlog build up
    if (this.dialogue.length > 4) this.dialogue.splice(1, this.dialogue.length - 4);
    const entry = { line, wait: delay, t: 0 };
    if (!urgent) this.dialogue.push(entry);
    else {
      // urgent lines go next; cut the current line short if it has been read
      const head = this.dialogue[0];
      if (head && head.wait <= 0 && head.t > 1.2) head.t = Math.max(head.t, this.duration(head.line));
      this.dialogue.splice(head && head.wait <= 0 ? 1 : 0, 0, entry);
    }
  }

  private duration(line: Line): number {
    return 2.2 + line.text.length / 24;
  }

  clearDialogue(): void {
    this.dialogue = [];
  }

  banner(title: string, sub = ''): void {
    this.bannerTitle = title;
    this.bannerSub = sub;
    this.bannerT = 2.8;
  }

  setBoss(e: Enemy | null): void {
    this.boss = e;
  }

  /** Draw at CSS-pixel coordinates (ctx is pre-scaled by devicePixelRatio). */
  draw(W: number, H: number, scale: number, dt: number): void {
    const { ctx, game: g } = this;
    ctx.imageSmoothingEnabled = false;
    this.bannerT = Math.max(0, this.bannerT - dt);
    const ox = Math.round(-g.camX);
    const oy = Math.round(-g.camY);
    const toScreen = (x: number, y: number): [number, number] => [(x + ox) * scale, (y + oy) * scale];

    // floating combat text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of g.fx.texts) {
      const [x, y] = toScreen(t.x, t.y);
      const a = Math.min(1, (t.life / t.max) * 2);
      const pop = 1 + Math.max(0, t.life - t.max + 0.12) * 4;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(t.size * 2.2 * pop)}px ${FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;

    if (g.state === 'menu') return;
    const I = this.insets;
    const left = 14 + I.left;
    const top = 12 + I.top;

    this.drawStatus(left, top);
    this.drawMinimap(W - 14 - I.right - 46, top);
    this.drawBossBar(W, top, dt);
    this.drawBanner(W, H);
    this.drawDialogue(W, H, g.state === 'play' ? dt : 0);
    this.drawControls(W, H);

    // red vignette when low on health
    const p = g.player;
    const low = p.hp / p.stats.maxHp;
    if (low < 0.35 && !p.dead) {
      const k = (0.35 - low) / 0.35;
      const pulse = 0.5 + Math.sin(performance.now() / 180) * 0.5;
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      grad.addColorStop(0, 'rgba(160,0,0,0)');
      grad.addColorStop(1, `rgba(160,0,0,${0.25 + k * 0.3 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawStatus(x: number, y: number): void {
    const { ctx, game: g } = this;
    const p = g.player;
    const w = 170;
    // HP
    panel(ctx, x - 4, y - 4, w + 8, 48);
    ctx.fillStyle = '#2a0c10';
    ctx.fillRect(x, y, w, 16);
    const hpK = Math.max(0, p.hp / p.stats.maxHp);
    const grad = ctx.createLinearGradient(0, y, 0, y + 16);
    grad.addColorStop(0, '#ff5a5a');
    grad.addColorStop(1, '#b3122a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * hpK, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, y, w * hpK, 3);
    text(ctx, `${Math.ceil(p.hp)} / ${p.stats.maxHp}`, x + w / 2, y + 8.5, 13, '#fff', 'center');
    // XP
    const xpK = Math.min(1, g.xp / g.xpNeeded());
    ctx.fillStyle = '#10200c';
    ctx.fillRect(x + 34, y + 21, w - 34, 8);
    ctx.fillStyle = '#9dff5a';
    ctx.fillRect(x + 34, y + 21, (w - 34) * xpK, 8);
    text(ctx, `Lv ${g.level}`, x, y + 25.5, 13, '#d8ffb8', 'left');
    // gold
    drawSprite(ctx, 'gold', 0, x + 7, y + 38, { scale: 0.6 });
    text(ctx, `${g.gold}`, x + 18, y + 38, 13, '#ffd76a', 'left');
    text(ctx, `F${g.floorNum}`, x + w, y + 38, 12, '#bbb', 'right');
    const kills = `${g.kills}`;
    text(ctx, `☠ ${kills}`, x + w - 30, y + 38, 12, '#bbb', 'right');
  }

  private drawMinimap(right: number, y: number): void {
    const { ctx, game: g } = this;
    const fl = g.floor;
    const cw = 13;
    const ch = 9;
    const gap = 3;
    let minX = 99;
    let maxX = -99;
    let minY = 99;
    let maxY = -99;
    for (const r of fl.rooms.values()) {
      if (!r.known) continue;
      minX = Math.min(minX, r.gx);
      maxX = Math.max(maxX, r.gx);
      minY = Math.min(minY, r.gy);
      maxY = Math.max(maxY, r.gy);
    }
    const w = (maxX - minX + 1) * (cw + gap) + gap;
    const h = (maxY - minY + 1) * (ch + gap) + gap;
    const x0 = right - w;
    panel(ctx, x0 - 3, y - 3, w + 6, h + 6);
    for (const r of fl.rooms.values()) {
      if (!r.known) continue;
      const rx = x0 + gap + (r.gx - minX) * (cw + gap);
      const ry = y + gap + (r.gy - minY) * (ch + gap);
      const cur = r === g.room;
      ctx.fillStyle = cur ? '#fff' : r.visited ? '#7a7488' : '#3a3644';
      ctx.fillRect(rx, ry, cw, ch);
      // corridors
      ctx.fillStyle = '#7a7488';
      if (r.doors[1] && fl.get(r.gx + 1, r.gy)?.known) ctx.fillRect(rx + cw, ry + ch / 2 - 1, gap, 2);
      if (r.doors[2] && fl.get(r.gx, r.gy + 1)?.known) ctx.fillRect(rx + cw / 2 - 1, ry + ch, 2, gap);
      const icon = r.kind === 'boss' ? '#ff4040' : r.kind === 'treasure' ? '#ffd040' : r.kind === 'shop' ? '#60e070' : r.kind === 'fountain' ? '#60c8ff' : '';
      if (icon) {
        ctx.fillStyle = icon;
        ctx.beginPath();
        ctx.arc(rx + cw / 2, ry + ch / 2, 2.6, 0, TAU);
        ctx.fill();
      }
      if (r.visited && !r.cleared) {
        ctx.fillStyle = '#c03030';
        ctx.fillRect(rx + 1, ry + 1, 2, 2);
      }
    }
    // pause button sits to the right of the map
    const bx = right + 26;
    const by = y + 12;
    panel(ctx, bx - 18, by - 16, 36, 32);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(bx - 6, by - 7, 4, 14);
    ctx.fillRect(bx + 2, by - 7, 4, 14);
    this.pauseRect = { id: 'pause', x: bx, y: by, r: 22 };
  }

  private pauseRect: ButtonRect = { id: 'pause', x: 0, y: 0, r: 0 };

  private drawBossBar(W: number, y: number, dt: number): void {
    const { ctx } = this;
    const e = this.boss;
    if (!e || e.dead) {
      this.bossShown = 0;
      return;
    }
    this.bossShown = Math.min(1, this.bossShown + dt * 2);
    const w = Math.min(420, W * 0.42);
    const x = (W - w) / 2;
    const yy = y + 4 - (1 - this.bossShown) * 40;
    ctx.globalAlpha = this.bossShown;
    panel(ctx, x - 6, yy - 4, w + 12, 34);
    text(ctx, e.def.name, W / 2, yy + 6, 14, '#ffd2a0', 'center');
    ctx.fillStyle = '#2a0808';
    ctx.fillRect(x, yy + 16, w, 9);
    ctx.fillStyle = e.phase ? '#ff3b1f' : '#d81e3c';
    ctx.fillRect(x, yy + 16, w * Math.max(0, e.hp / e.maxHp), 9);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + w / 2, yy + 16, 1, 9);
    ctx.globalAlpha = 1;
  }

  private drawBanner(W: number, H: number): void {
    if (this.bannerT <= 0) return;
    const { ctx } = this;
    const t = this.bannerT;
    const a = Math.min(1, t * 2, (2.8 - t) * 4);
    ctx.globalAlpha = a;
    const y = H * 0.3;
    if (this.bannerTitle) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, y - 34, W, this.bannerSub ? 70 : 50);
      text(ctx, this.bannerTitle, W / 2, y - 8, 30, '#ffe7b0', 'center', true);
      if (this.bannerSub) text(ctx, this.bannerSub, W / 2, y + 22, 16, '#c9b8a8', 'center');
    } else if (this.bannerSub) {
      text(ctx, this.bannerSub, W / 2, y, 20, '#ffe7b0', 'center', true);
    }
    ctx.globalAlpha = 1;
  }

  private drawDialogue(W: number, H: number, dt: number): void {
    const head = this.dialogue[0];
    if (!head) return;
    if (head.wait > 0) {
      head.wait -= dt;
      return;
    }
    head.t += dt;
    const { line } = head;
    const dur = this.duration(line);
    if (head.t > dur + 0.35) {
      this.dialogue.shift();
      return;
    }
    const { ctx } = this;
    const I = this.insets;
    const a = Math.min(1, head.t * 5, (dur + 0.35 - head.t) * 3);
    const w = Math.min(480, W - I.left - I.right - 360);
    const fs = 13;
    ctx.font = `500 ${fs}px ${FONT}`;
    const shown = line.text.slice(0, Math.floor(head.t * 48));
    const lines = wrap(ctx, line.text, w - 78);
    const h = Math.max(62, 30 + lines.length * (fs + 4));
    const x = (W - w) / 2;
    const y = H - 12 - I.bottom - h;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,6,16,0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = line.color ?? 'rgba(255,230,190,0.4)';
    ctx.globalAlpha = a * 0.7;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = a;
    // portrait
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + 8, y + 8, 48, 48);
    const [pw, ph] = spriteSize(line.portrait);
    drawSprite(ctx, line.portrait, 0, x + 32, y + 32 + Math.sin(head.t * 3) * 1, { scale: Math.min(1.4, 46 / Math.max(pw, ph)) });
    text(ctx, line.speaker, x + 66, y + 13, 13, line.color ?? '#ffe2b0', 'left', true);
    // typewriter body: reveal the wrapped lines progressively
    let remaining = shown.length;
    ctx.font = `500 ${fs}px ${FONT}`;
    for (let i = 0; i < lines.length && remaining > 0; i++) {
      const part = lines[i].slice(0, remaining);
      remaining -= lines[i].length + 1;
      text(ctx, part, x + 66, y + 31 + i * (fs + 4), fs, '#eadfce', 'left');
    }
    ctx.globalAlpha = 1;
  }

  private drawControls(W: number, H: number): void {
    const { ctx, game: g, input } = this;
    const I = this.insets;
    const p = g.player;
    const lefty = settings.lefty;
    const touch = input.usingTouch;
    const buttons: ButtonRect[] = [this.pauseRect];
    // button cluster in the bottom corner opposite the joystick
    const bigR = touch ? 38 : 24;
    const smallR = touch ? 29 : 20;
    const edgeX = lefty ? 24 + I.left + bigR : W - 24 - I.right - bigR;
    const sign = lefty ? 1 : -1;
    const by = H - 22 - I.bottom - bigR;
    const layout: [ButtonId, number, number, number][] = touch
      ? [
          ['slash', edgeX, by, bigR],
          ['dash', edgeX + sign * (bigR + smallR + 18), by + 8, smallR],
          ['nova', edgeX + sign * 6, by - bigR - smallR - 16, smallR],
        ]
      : [
          ['dash', edgeX, by, smallR],
          ['nova', edgeX + sign * 52, by, smallR],
          ['slash', edgeX + sign * 104, by, smallR],
        ];
    for (const [id, x, y, r] of layout) {
      buttons.push({ id, x, y, r });
      const k = p.cdFrac(id as 'slash' | 'nova' | 'dash');
      const ready = k >= 1;
      const held = input.isHeld(id);
      ctx.globalAlpha = touch ? 0.85 : 0.9;
      ctx.fillStyle = held ? 'rgba(255,255,255,0.25)' : 'rgba(10,8,16,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ready ? 'rgba(255,230,170,0.9)' : 'rgba(255,255,255,0.25)';
      ctx.stroke();
      ctx.globalAlpha = ready ? 1 : 0.45;
      drawSprite(ctx, ICONS[id], 0, x, y, { scale: (r * 1.15) / 32 });
      ctx.globalAlpha = 1;
      if (!ready) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r - 2, -Math.PI / 2 + TAU * k, -Math.PI / 2 + TAU);
        ctx.closePath();
        ctx.fill();
      }
      if (id === 'dash' && p.stats.dashCharges > 1) text(ctx, `${p.dashCharges}`, x + r * 0.62, y - r * 0.62, 13, '#fff', 'center', true);
      if (!touch) text(ctx, KEYS[id], x, y + r + 9, 11, '#aaa', 'center');
    }
    input.buttons = buttons;

    if (!touch) return;
    // virtual joystick
    const j = input.joy;
    if (j.active) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(j.bx, j.by, JOY_RADIUS, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fill();
      const dx = j.kx - j.bx;
      const dy = j.ky - j.by;
      const d = Math.min(JOY_RADIUS, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#e8e0ff';
      ctx.beginPath();
      ctx.arc(j.bx + Math.cos(a) * d, j.by + Math.sin(a) * d, 22, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const hx = lefty ? W - 110 - I.right : 110 + I.left;
      const hy = H - 100 - I.bottom;
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, JOY_RADIUS, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hx, hy, 18, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(8,6,14,0.62)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,230,190,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, bold = false): void {
  ctx.font = `${bold ? 700 : 500} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function wrap(ctx: CanvasRenderingContext2D, s: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > width && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
