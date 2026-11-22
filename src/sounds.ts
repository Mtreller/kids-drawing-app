// Tiny, gentle sound effects synthesised on the fly: no audio files to download,
// works offline, and nothing plays until a child has tapped (browser rule).

export type SoundName = 'tap' | 'pop' | 'boing' | 'whoosh' | 'chime' | 'sparkle' | 'nope';

const STORAGE_KEY = 'color-pop-sound';
let context: AudioContext | null = null;
let enabled = readEnabled();
let lastPlayed = 0;

function readEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off'; }
  catch { return true; }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try { window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); }
  catch { /* Works for this session. */ }
}

function audio() {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  context ??= new Constructor();
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

function tone(ctx: AudioContext, { from, to = from, start = 0, length, type = 'sine', volume = .12 }: {
  from: number; to?: number; start?: number; length: number; type?: OscillatorType; volume?: number;
}) {
  const at = ctx.currentTime + start;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, at + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + length + .02);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const now = performance.now();
  // Little hands tap fast; don't let sounds pile up into noise.
  if (name === 'tap' && now - lastPlayed < 60) return;
  lastPlayed = now;
  const ctx = audio();
  if (!ctx) return;
  try {
    switch (name) {
      case 'tap':
        tone(ctx, { from: 660, to: 520, length: .06, type: 'triangle', volume: .07 });
        break;
      case 'pop':
        tone(ctx, { from: 300, to: 900, length: .12, volume: .16 });
        tone(ctx, { from: 900, to: 1400, start: .07, length: .1, type: 'triangle', volume: .06 });
        break;
      case 'boing':
        tone(ctx, { from: 220, to: 520, length: .16, type: 'triangle', volume: .13 });
        tone(ctx, { from: 520, to: 330, start: .14, length: .16, type: 'triangle', volume: .09 });
        break;
      case 'whoosh':
        tone(ctx, { from: 900, to: 260, length: .2, type: 'sine', volume: .08 });
        break;
      case 'chime':
        [523, 659, 784, 1047].forEach((note, index) => tone(ctx, { from: note, start: index * .09, length: .35, type: 'triangle', volume: .09 }));
        break;
      case 'sparkle':
        [1319, 1568].forEach((note, index) => tone(ctx, { from: note, start: index * .05, length: .12, type: 'sine', volume: .05 }));
        break;
      case 'nope':
        tone(ctx, { from: 300, to: 240, length: .14, type: 'triangle', volume: .07 });
        break;
    }
  } catch { /* Sound is a nicety; never break drawing over it. */ }
}
