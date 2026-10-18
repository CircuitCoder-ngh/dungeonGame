import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/700.css';
import { initAudio, resumeAudio, setMusic, suspendAudio } from './engine/audio';
import { Input } from './engine/input';
import { loadSprites } from './engine/sprites';
import { Game } from './game/game';
import { Hud, Insets } from './game/hud';
import { settings } from './game/profile';
import { Renderer } from './game/renderer';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { registerPWA } from './pwa';
import { Menus } from './ui/menus';

registerPWA();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;
// the world is drawn at low resolution and scaled up with crisp pixels
const world = document.createElement('canvas');
const wctx = world.getContext('2d', { alpha: false })!;

const input = new Input(canvas);
input.lefty = settings.lefty;

// game, HUD and menus reference each other through small interfaces
let menus!: Menus;
const game = new Game(input, {
  levelUp: (...a) => menus.levelUp(...a),
  shop: (...a) => menus.shop(...a),
  pause: () => menus.pause(),
  dead: (s) => menus.dead(s),
  victory: (s) => menus.victory(s),
  banner: (t, s) => menus.banner(t, s),
  bossBar: (e) => menus.bossBar(e),
  say: (line, delay, urgent) => menus.say(line, delay, urgent),
  ending: (id, done) => menus.ending(id, done),
});
const hud = new Hud(ctx, game, input);
menus = new Menus(game, hud);
const renderer = new Renderer(wctx, game);

let cssW = 0;
let cssH = 0;
let dpr = 1;
let scale = 3;

function readInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;inset:0;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const r = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return r;
}

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  // Integer scale from device pixels to world pixels, targeting ~330-400 world px of height.
  const devH = canvas.height;
  scale = Math.max(1, Math.round(devH / 360));
  const vw = Math.ceil(canvas.width / scale);
  const vh = Math.ceil(canvas.height / scale);
  world.width = vw;
  world.height = vh;
  wctx.imageSmoothingEnabled = false;
  game.setView(vw, vh);
  hud.insets = readInsets();
  document.documentElement.classList.toggle('portrait', cssH > cssW);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// audio can only start after a user gesture
const unlock = () => {
  initAudio();
  if (game.state === 'menu') setMusic('menu');
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'play') {
      game.state = 'paused';
      menus.pause();
    }
    suspendAudio();
  } else resumeAudio();
});

// Android back button: pause the game / close menus instead of quitting the app
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    if (game.state === 'play') {
      game.state = 'paused';
      menus.pause();
    } else if (game.state === 'paused' && !menus.hasBack) menus.resume();
    else if (game.state === 'modal') {
      // modals (level-up/treasure/shop) need an explicit choice; ignore
    } else menus.back();
  });
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    step(dt);
  } catch (err) {
    // keep the loop alive; a single bad frame shouldn't freeze the game
    console.error(err);
  }
}

function step(dt: number): void {
  if (game.player && game.floor) {
    game.update(dt);
    renderer.draw();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(world, 0, 0, world.width * scale, world.height * scale);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0a10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game.player && game.floor) hud.draw(cssW, cssH, scale / dpr, dt);
}

async function boot(): Promise<void> {
  await Promise.all([loadSprites(), document.fonts?.load('500 16px "Pixelify Sans"').catch(() => {})]);
  menus.title();
  requestAnimationFrame(frame);
}

boot();

// expose for debugging in the browser console
(window as unknown as { game: Game }).game = game;
