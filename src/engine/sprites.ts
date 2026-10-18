import atlasData from '../assets/atlas.json';

type Frame = [number, number, number, number];
const frames = atlasData as unknown as Record<string, Frame[]>;

let atlas: HTMLImageElement | HTMLCanvasElement;
/** Same atlas with every opaque pixel painted white, for hit flashes. */
let atlasWhite: HTMLCanvasElement;

export async function loadSprites(): Promise<void> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}assets/atlas.png`;
  await img.decode();
  atlas = img;
  atlasWhite = document.createElement('canvas');
  atlasWhite.width = img.width;
  atlasWhite.height = img.height;
  const c = atlasWhite.getContext('2d')!;
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#fff';
  c.fillRect(0, 0, img.width, img.height);
}

export function hasSprite(name: string): boolean {
  return name in frames;
}

export function frameCount(name: string): number {
  return frames[name]?.length ?? 0;
}

export function spriteSize(name: string, frame = 0): [number, number] {
  const f = frames[name]?.[frame];
  return f ? [f[2], f[3]] : [32, 32];
}

export interface DrawOpts {
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  flip?: boolean;
  alpha?: number;
  rot?: number;
  /** 0..1 white overlay amount */
  flash?: number;
  /** anchor: 0.5,0.5 = centre (default), 0.5,1 = feet */
  ax?: number;
  ay?: number;
}

/** Draw a sprite centred (by default) on x,y. */
export function drawSprite(ctx: CanvasRenderingContext2D, name: string, frame: number, x: number, y: number, o: DrawOpts = {}): void {
  const list = frames[name];
  if (!list) return;
  const f = list[((frame % list.length) + list.length) % list.length];
  const [sx, sy, sw, sh] = f;
  const s = o.scale ?? 1;
  const kx = (o.scaleX ?? 1) * s * (o.flip ? -1 : 1);
  const ky = (o.scaleY ?? 1) * s;
  const ax = o.ax ?? 0.5;
  const ay = o.ay ?? 0.5;
  const alpha = o.alpha ?? 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(kx, ky);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(atlas, sx, sy, sw, sh, -sw * ax, -sh * ay, sw, sh);
  if (o.flash && o.flash > 0) {
    ctx.globalAlpha *= Math.min(1, o.flash);
    ctx.drawImage(atlasWhite, sx, sy, sw, sh, -sw * ax, -sh * ay, sw, sh);
  }
  ctx.restore();
}

/** Draw a sprite's top-left at x,y without transforms (fast path for tiles). */
export function blitSprite(ctx: CanvasRenderingContext2D, name: string, frame: number, x: number, y: number): void {
  const list = frames[name];
  if (!list) return;
  const [sx, sy, sw, sh] = list[frame % list.length];
  ctx.drawImage(atlas, sx, sy, sw, sh, x, y, sw, sh);
}

/** Render a sprite into a standalone canvas (used for DOM icons). */
export function spriteCanvas(name: string, scale = 2, frame = 0): HTMLCanvasElement {
  const [w, h] = spriteSize(name, frame);
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  blitSprite(ctx, name, frame, 0, 0);
  return c;
}

/** Data URL of a sprite, for <img> tags in menus. */
const urlCache = new Map<string, string>();
export function spriteURL(name: string, scale = 2, frame = 0): string {
  const key = `${name}:${scale}:${frame}`;
  let u = urlCache.get(key);
  if (!u) {
    u = spriteCanvas(name, scale, frame).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}
