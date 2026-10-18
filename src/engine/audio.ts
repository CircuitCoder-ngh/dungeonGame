// All sound is synthesised with WebAudio, so the game ships with no audio files.
import { settings } from '../game/profile';

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
const lastPlayed = new Map<string, number>();

export function initAudio(): void {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ac = new Ctor();
  master = ac.createGain();
  master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain();
  musicBus = ac.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);
  applyVolumes();
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function applyVolumes(): void {
  if (!ac) return;
  sfxBus.gain.value = settings.sfx * 0.7;
  musicBus.gain.value = settings.music * 0.35;
}

export function suspendAudio(): void {
  ac?.suspend();
}
export function resumeAudio(): void {
  if (ac?.state === 'suspended') ac.resume();
}

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  dur: number;
  vol?: number;
  attack?: number;
  delay?: number;
  bus?: GainNode;
  detune?: number;
}

function tone(o: ToneOpts): void {
  if (!ac) return;
  const t = ac.currentTime + (o.delay ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.detune) osc.detune.value = o.detune;
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
  const vol = o.vol ?? 0.3;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(o.bus ?? sfxBus);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  delay?: number;
}

function noise(o: NoiseOpts): void {
  if (!ac) return;
  const t = ac.currentTime + (o.delay ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.5 + Math.random();
  const f = ac.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 1500, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ac.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.02);
}

const SOUNDS: Record<string, (p: number) => void> = {
  shoot: (p) => tone({ type: 'square', freq: 700 * p, to: 300 * p, dur: 0.07, vol: 0.06 }),
  hit: () => {
    noise({ dur: 0.06, vol: 0.25, freq: 2200, q: 1.5 });
    tone({ type: 'triangle', freq: 220, to: 90, dur: 0.07, vol: 0.18 });
  },
  crit: () => {
    noise({ dur: 0.08, vol: 0.3, freq: 3500, q: 2 });
    tone({ type: 'square', freq: 1400, to: 700, dur: 0.08, vol: 0.08 });
  },
  kill: (p) => {
    tone({ type: 'sawtooth', freq: 420 * p, to: 60, dur: 0.18, vol: 0.12 });
    noise({ dur: 0.15, vol: 0.2, freq: 900, to: 200 });
  },
  hurt: () => {
    tone({ type: 'square', freq: 220, to: 70, dur: 0.25, vol: 0.2 });
    noise({ dur: 0.2, vol: 0.3, freq: 600, filter: 'lowpass' });
  },
  slash: () => noise({ dur: 0.14, vol: 0.35, freq: 1200, to: 5000, filter: 'bandpass', q: 0.8 }),
  nova: () => {
    tone({ type: 'sine', freq: 180, to: 900, dur: 0.45, vol: 0.2, attack: 0.03 });
    tone({ type: 'triangle', freq: 360, to: 1800, dur: 0.45, vol: 0.08, attack: 0.03 });
    noise({ dur: 0.5, vol: 0.12, freq: 3000, q: 4 });
  },
  dash: () => noise({ dur: 0.18, vol: 0.25, freq: 400, to: 2500, q: 1.2 }),
  coin: () => {
    tone({ type: 'square', freq: 1320, dur: 0.06, vol: 0.06 });
    tone({ type: 'square', freq: 1760, dur: 0.12, vol: 0.06, delay: 0.05 });
  },
  xp: (p) => tone({ type: 'sine', freq: 900 * p, to: 1400 * p, dur: 0.08, vol: 0.07 }),
  heal: () => {
    tone({ type: 'sine', freq: 520, to: 780, dur: 0.25, vol: 0.15 });
    tone({ type: 'sine', freq: 780, to: 1040, dur: 0.3, vol: 0.1, delay: 0.1 });
  },
  levelup: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.3, vol: 0.18, delay: i * 0.07 }));
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', freq: f, dur: 0.12, vol: 0.04, delay: i * 0.07 }));
  },
  door: () => {
    tone({ type: 'triangle', freq: 90, to: 50, dur: 0.3, vol: 0.3 });
    noise({ dur: 0.25, vol: 0.2, freq: 300, filter: 'lowpass' });
  },
  clear: () => {
    [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.13, delay: i * 0.09 }));
  },
  explode: () => {
    noise({ dur: 0.5, vol: 0.45, freq: 900, to: 80, filter: 'lowpass' });
    tone({ type: 'sine', freq: 120, to: 35, dur: 0.4, vol: 0.35 });
  },
  enemyShoot: (p) => tone({ type: 'sine', freq: 520 * p, to: 260 * p, dur: 0.12, vol: 0.08 }),
  spawn: () => tone({ type: 'sine', freq: 200, to: 600, dur: 0.3, vol: 0.06, attack: 0.1 }),
  roar: () => {
    tone({ type: 'sawtooth', freq: 70, to: 45, dur: 1.2, vol: 0.3, attack: 0.1 });
    tone({ type: 'sawtooth', freq: 73, to: 40, dur: 1.2, vol: 0.2, attack: 0.1 });
    noise({ dur: 1.0, vol: 0.25, freq: 400, filter: 'lowpass' });
  },
  stomp: () => {
    tone({ type: 'sine', freq: 90, to: 30, dur: 0.35, vol: 0.4 });
    noise({ dur: 0.3, vol: 0.25, freq: 250, filter: 'lowpass' });
  },
  click: () => tone({ type: 'square', freq: 900, dur: 0.04, vol: 0.05 }),
  buy: () => {
    tone({ type: 'square', freq: 990, dur: 0.06, vol: 0.06 });
    tone({ type: 'square', freq: 1320, dur: 0.06, vol: 0.06, delay: 0.06 });
    tone({ type: 'square', freq: 1980, dur: 0.12, vol: 0.06, delay: 0.12 });
  },
  deny: () => tone({ type: 'square', freq: 150, dur: 0.15, vol: 0.1 }),
  stairs: () => {
    [784, 659, 523, 392, 330].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.25, vol: 0.14, delay: i * 0.08 }));
  },
  zap: () => {
    noise({ dur: 0.12, vol: 0.2, freq: 4000, q: 3 });
    tone({ type: 'sawtooth', freq: 1800, to: 300, dur: 0.1, vol: 0.06 });
  },
  death: () => {
    tone({ type: 'sawtooth', freq: 300, to: 40, dur: 1.2, vol: 0.25 });
    noise({ dur: 1, vol: 0.2, freq: 500, filter: 'lowpass' });
  },
  victory: () => {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone({ type: 'triangle', freq: f, dur: 0.4, vol: 0.16, delay: i * 0.12 }));
  },
};

/** Play a named sound. `pitch` multiplies the base frequency; repeats within `gap` seconds are dropped. */
export function sfx(name: string, pitch = 1, gap = 0.03): void {
  if (!ac || settings.sfx <= 0) return;
  const now = ac.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < gap) return;
  lastPlayed.set(name, now);
  SOUNDS[name]?.(pitch);
}

// ---------------------------------------------------------------- music
// A small generative score: a filtered drone plus sparse plucked notes from a
// minor scale, with a driving bass pulse during boss fights.

const SCALES: Record<string, number[]> = {
  crypt: [0, 3, 5, 7, 10],
  sewer: [0, 2, 3, 7, 8],
  bone: [0, 1, 5, 7, 8],
  ice: [0, 2, 5, 7, 9],
  hell: [0, 1, 4, 5, 7, 8],
  menu: [0, 3, 7, 10, 14],
};
const ROOTS: Record<string, number> = { crypt: 45, sewer: 43, bone: 41, ice: 47, hell: 40, menu: 45 };

let musicTimer = 0;
let mood = 'menu';
let boss = false;
let nextNote = 0;
let step = 0;
let droneNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function startDrone(root: number): void {
  if (!ac) return;
  stopDrone();
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 2);
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  const osc: OscillatorNode[] = [lfo];
  for (const [n, det] of [
    [root - 12, -6],
    [root - 12, 7],
    [root - 5, 0],
  ]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    o.detune.value = det;
    o.connect(filter);
    osc.push(o);
  }
  filter.connect(gain).connect(musicBus);
  osc.forEach((o) => o.start());
  droneNodes = { osc, gain };
}

function stopDrone(): void {
  if (!ac || !droneNodes) return;
  const { osc, gain } = droneNodes;
  gain.gain.cancelScheduledValues(ac.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1);
  osc.forEach((o) => o.stop(ac!.currentTime + 1.1));
  droneNodes = null;
}

function scheduler(): void {
  if (!ac || ac.state !== 'running') return;
  const scale = SCALES[mood] ?? SCALES.crypt;
  const root = ROOTS[mood] ?? 45;
  const beat = boss ? 0.16 : 0.32;
  while (nextNote < ac.currentTime + 0.3) {
    const t = nextNote - ac.currentTime;
    if (boss) {
      // pulsing bass on eighths
      const bassNote = root - 12 + (step % 16 < 12 ? 0 : scale[2]);
      tone({ type: 'sawtooth', freq: midi(bassNote), dur: 0.14, vol: 0.12, delay: t, bus: musicBus });
      if (step % 4 === 0) noiseHit(t);
      if (step % 2 === 0 && Math.random() < 0.5) {
        const n = root + 12 + scale[Math.floor(Math.random() * scale.length)];
        tone({ type: 'square', freq: midi(n), dur: 0.12, vol: 0.035, delay: t, bus: musicBus });
      }
    } else if (Math.random() < 0.38) {
      const oct = Math.random() < 0.3 ? 24 : 12;
      const n = root + oct + scale[Math.floor(Math.random() * scale.length)];
      tone({ type: 'triangle', freq: midi(n), dur: 1.4, vol: 0.09, delay: t, attack: 0.01, bus: musicBus });
      tone({ type: 'sine', freq: midi(n + 12), dur: 0.6, vol: 0.03, delay: t + 0.01, bus: musicBus });
    }
    step++;
    nextNote += beat;
  }
}

function noiseHit(delay: number): void {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 180;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
  src.stop(t + 0.25);
}

export function setMusic(newMood: string, isBoss = false): void {
  if (!ac) return;
  if (newMood === mood && isBoss === boss && musicTimer) return;
  const moodChanged = newMood !== mood || !droneNodes;
  mood = newMood;
  boss = isBoss;
  if (moodChanged) startDrone(ROOTS[mood] ?? 45);
  if (!musicTimer) {
    nextNote = ac.currentTime + 0.1;
    musicTimer = window.setInterval(scheduler, 100);
  }
}

export function stopMusic(): void {
  stopDrone();
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = 0;
}
