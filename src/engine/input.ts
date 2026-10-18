// Unified input: floating virtual joystick + on-screen buttons for touch,
// keyboard for desktop, and the Gamepad API for controllers.

export type ButtonId = 'slash' | 'nova' | 'dash' | 'pause';

export interface ButtonRect {
  id: ButtonId;
  x: number; // centre, CSS px
  y: number;
  r: number;
}

const KEYMAP: Record<string, ButtonId> = {
  Space: 'slash',
  KeyJ: 'slash',
  KeyK: 'nova',
  KeyE: 'nova',
  KeyL: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  Escape: 'pause',
  KeyP: 'pause',
};

export const JOY_RADIUS = 52;

export class Input {
  moveX = 0;
  moveY = 0;
  usingTouch = matchMedia('(pointer: coarse)').matches;
  lefty = false;

  /** Layout written by the HUD each frame so touches can hit-test it. */
  buttons: ButtonRect[] = [];
  joy = { active: false, id: -1, bx: 0, by: 0, kx: 0, ky: 0 };

  private held = new Set<ButtonId>();
  private pressedQ = new Set<ButtonId>();
  private keys = new Set<string>();
  private touchButtons = new Map<number, ButtonId>();
  private padPrev: boolean[] = [];

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('lostpointercapture', this.onUp);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const b = KEYMAP[e.code];
      if (b) {
        this.press(b);
        e.preventDefault();
      }
      this.usingTouch = false;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const b = KEYMAP[e.code];
      if (b && !this.anyKeyFor(b)) this.held.delete(b);
    });
    window.addEventListener('blur', () => this.reset());
  }

  private anyKeyFor(b: ButtonId): boolean {
    for (const k of this.keys) if (KEYMAP[k] === b) return true;
    return false;
  }

  private press(b: ButtonId): void {
    this.held.add(b);
    this.pressedQ.add(b);
  }

  reset(): void {
    this.held.clear();
    this.pressedQ.clear();
    this.keys.clear();
    this.touchButtons.clear();
    this.joy.active = false;
    this.moveX = this.moveY = 0;
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') this.usingTouch = true;
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* pointer may already be gone */
    }
    const x = e.clientX;
    const y = e.clientY;
    for (const b of this.buttons) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r * 1.25) ** 2) {
        this.touchButtons.set(e.pointerId, b.id);
        this.press(b.id);
        return;
      }
    }
    const w = this.el.clientWidth;
    const onJoySide = this.lefty ? x > w * 0.5 : x < w * 0.5;
    if (onJoySide && !this.joy.active) {
      this.joy = { active: true, id: e.pointerId, bx: x, by: y, kx: x, ky: y };
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.joy.active && e.pointerId === this.joy.id) {
      const dx = e.clientX - this.joy.bx;
      const dy = e.clientY - this.joy.by;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) {
        // drag the base along so the stick never "sticks" at the rim
        const over = d - JOY_RADIUS;
        this.joy.bx += (dx / d) * over;
        this.joy.by += (dy / d) * over;
      }
      this.joy.kx = e.clientX;
      this.joy.ky = e.clientY;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.joy.active && e.pointerId === this.joy.id) this.joy.active = false;
    const b = this.touchButtons.get(e.pointerId);
    if (b) {
      this.touchButtons.delete(e.pointerId);
      if (![...this.touchButtons.values()].includes(b) && !this.anyKeyFor(b)) this.held.delete(b);
    }
  };

  /** Call once per frame before reading state. */
  poll(): void {
    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;

    if (this.joy.active) {
      const dx = (this.joy.kx - this.joy.bx) / JOY_RADIUS;
      const dy = (this.joy.ky - this.joy.by) / JOY_RADIUS;
      const m = Math.hypot(dx, dy);
      if (m > 0.18) {
        // rescale so the dead zone doesn't eat the low end of the range
        const k = Math.min(1, (m - 0.18) / 0.62) / m;
        mx = dx * k;
        my = dy * k;
      }
    }

    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.2) {
        mx = ax;
        my = ay;
        this.usingTouch = false;
      }
      const map: [number, ButtonId][] = [
        [0, 'slash'],
        [1, 'dash'],
        [2, 'nova'],
        [3, 'nova'],
        [5, 'dash'],
        [7, 'slash'],
        [9, 'pause'],
      ];
      for (const [i, id] of map) {
        const down = !!p.buttons[i]?.pressed;
        if (down && !this.padPrev[i]) this.press(id);
        if (!down && this.padPrev[i] && !this.anyKeyFor(id)) this.held.delete(id);
        this.padPrev[i] = down;
      }
      break;
    }

    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    this.moveX = mx;
    this.moveY = my;
  }

  /** True once per press. */
  pressed(b: ButtonId): boolean {
    if (this.pressedQ.has(b)) {
      this.pressedQ.delete(b);
      return true;
    }
    return false;
  }

  isHeld(b: ButtonId): boolean {
    return this.held.has(b);
  }

  clearPressed(): void {
    this.pressedQ.clear();
  }
}
