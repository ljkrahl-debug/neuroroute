// Original score and sound effects, synthesized in code (Step 8 of the guide).
//
//   node audio.mjs            -> out/music.wav, out/sfx.wav
//
// Everything is driven by cues.mjs, the same timeline the picture reads, and
// all noise is seeded, so the render is identical every time.
import { writeFileSync, mkdirSync } from 'node:fs';
import { BPM, BEATS, SFX, RISER } from './cues.mjs';

const SR = 48000;
const BEAT = 60 / BPM;
const DUR = BEATS * BEAT;
const N = Math.round(DUR * SR);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261018);
const noise = () => rnd() * 2 - 1;

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function track() {
  return { L: new Float32Array(N), R: new Float32Array(N) };
}

function add(dst, i, l, r = l) {
  if (i >= 0 && i < N) { dst.L[i] += l; dst.R[i] += r; }
}

// Chamberlin state-variable filter; returns { lp, bp, hp } per step.
function svf() {
  let low = 0, band = 0;
  return (x, cutoff, q = 0.7) => {
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff, SR / 6) / SR);
    low += f * band;
    const high = x - low - (1 / q) * band;
    band += f * high;
    return { lp: low, bp: band, hp: high };
  };
}

const sec = (beat) => beat * BEAT;
const at = (beat) => Math.round(sec(beat) * SR);

// ---------------------------------------------------------------- the song

// Am – F – C – G, one chord per bar.
const ROOTS = [45, 41, 48, 43];            // A2 F2 C3 G2
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const bar = (beat) => Math.floor(beat / 4) % 4;

const inRange = (b, from, to) => b >= from && b < to;

function kick(dst, startBeat, gain = 1) {
  const s = at(startBeat), len = Math.round(0.42 * SR);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 45 + 110 * Math.exp(-t / 0.035);
    ph += TAU * f / SR;
    const env = Math.exp(-t / 0.16);
    const click = n < 120 ? noise() * 0.35 * (1 - n / 120) : 0;
    const v = (Math.sin(ph) * env + click) * 0.9 * gain;
    add(dst, s + n, v);
  }
}

function clap(dst, startBeat, gain = 1) {
  const s = at(startBeat), len = Math.round(0.25 * SR);
  const f = svf();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    // three tight bursts then a tail — the classic hand-clap shape
    const burst = [0, 0.011, 0.022].some((o) => t >= o && t < o + 0.008) ? 1 : 0;
    const env = Math.max(burst, Math.exp(-(t - 0.022) / 0.07) * (t > 0.022 ? 1 : 0));
    const v = f(noise(), 1600, 1.4).bp * env * 0.55 * gain;
    add(dst, s + n, v * 0.9, v);
  }
}

function hat(dst, startBeat, open = false, gain = 1) {
  const s = at(startBeat), len = Math.round((open ? 0.18 : 0.05) * SR);
  const f = svf();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t / (open ? 0.06 : 0.014));
    const v = f(noise(), 9000, 0.8).hp * env * 0.22 * gain;
    add(dst, s + n, v * 0.7, v);
  }
}

function bassNote(dst, startBeat, lenBeats, note, gain = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const f1 = svf(), f2 = svf();
  const hz = midi(note - 12);
  let ph = 0;
  for (let n = 0; n < len + 2400; n++) {
    const t = n / SR;
    ph = (ph + hz / SR) % 1;
    const saw = 2 * ph - 1;
    const sub = Math.sin(TAU * ph);
    const gate = n < len ? 1 : Math.exp(-(n - len) / 600);
    const env = Math.min(1, t / 0.004) * gate * (0.75 + 0.25 * Math.exp(-t / 0.08));
    const cutoff = 180 + 900 * Math.exp(-t / 0.07);
    const x = f2(f1(saw, cutoff, 0.9).lp, cutoff, 0.9).lp;
    add(dst, s + n, (x * 0.55 + sub * 0.35) * env * 0.5 * gain);
  }
}

function padChord(dst, startBeat, lenBeats, notes, gain = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const filters = notes.map(() => [svf(), svf()]);
  const phases = notes.map(() => [rnd(), rnd(), rnd(), rnd()]);
  for (let n = 0; n < len + 9600; n++) {
    const t = n / SR;
    const rel = n < len ? 1 : Math.exp(-(n - len) / 4800);
    const env = Math.min(1, t / 0.35) * rel;
    let l = 0, r = 0;
    notes.forEach((note, k) => {
      const hz = midi(note);
      const p = phases[k];
      // two detuned saws per side for width
      p[0] = (p[0] + hz * 1.003 / SR) % 1; p[1] = (p[1] + hz * 0.997 / SR) % 1;
      p[2] = (p[2] + hz * 1.006 / SR) % 1; p[3] = (p[3] + hz * 0.994 / SR) % 1;
      const cut = 900 + 400 * Math.sin(TAU * 0.25 * t);
      l += filters[k][0]((2 * p[0] - 1) + (2 * p[1] - 1), cut, 0.6).lp;
      r += filters[k][1]((2 * p[2] - 1) + (2 * p[3] - 1), cut, 0.6).lp;
    });
    add(dst, s + n, l * env * 0.06 * gain, r * env * 0.06 * gain);
  }
}

function pluck(dst, startBeat, note, pan, gain = 1) {
  const s = at(startBeat), len = Math.round(0.35 * SR);
  const f = svf();
  const hz = midi(note);
  let ph = rnd();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph = (ph + hz / SR) % 1;
    const x = f((2 * ph - 1) * 0.6 + (ph < 0.5 ? 0.4 : -0.4), 600 + 5200 * Math.exp(-t / 0.05), 0.8).lp;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.11);
    const v = x * env * 0.16 * gain;
    add(dst, s + n, v * (1 - pan), v * (1 + pan));
  }
}

// --------------------------------------------------------------- arrangement

const music = track();

for (let b = 0; b < BEATS; b++) {
  const chord = CHORDS[bar(b)];
  const root = ROOTS[bar(b)];

  // drums
  const groove = inRange(b, 4, 27) || inRange(b, 32, 37);
  const halfTime = inRange(b, 28, 32);
  if (inRange(b, 0, 4) || groove) kick(music, b, b % 4 === 0 ? 1 : 0.85);
  if (halfTime && b % 2 === 0) kick(music, b, 0.9);
  if (inRange(b, 8, 27) && b % 2 === 1) clap(music, b);
  if (groove) {
    hat(music, b + 0.5, inRange(b, 16, 27));
    if (inRange(b, 8, 27)) { hat(music, b + 0.25, false, 0.5); hat(music, b + 0.75, false, 0.5); }
  }

  // bass: eighth notes, octave jump on the last one of each beat
  if (inRange(b, 4, 27) || inRange(b, 32, 36)) {
    bassNote(music, b, 0.4, root);
    bassNote(music, b + 0.5, 0.4, b % 4 === 3 ? root + 12 : root);
  }
  if (halfTime && b === 28) bassNote(music, 28, 3.8, ROOTS[bar(28)], 0.9);

  // pad: one chord per bar
  if (b % 4 === 0 && b < 32) padChord(music, b, 4, chord, b < 4 ? 0.7 : 1);

  // arp from the first feature to the riser, and lightly under the logo
  if (inRange(b, 16, 26) || inRange(b, 32, 36)) {
    for (let s = 0; s < 4; s++) {
      const note = chord[(b * 4 + s) % 3] + 12;
      pluck(music, b + s / 4, note, s % 2 ? 0.35 : -0.35, inRange(b, 32, 36) ? 0.7 : 1);
    }
  }
}
// the ending: Am(add9) held under the logo and left to ring out
padChord(music, 32, 7.2, [57, 60, 64, 71], 1.15);

// a dotted-eighth stereo delay gives the pad and arp some space
function delay(t, timeSec, feedback, mix) {
  const d = Math.round(timeSec * SR);
  for (let i = d; i < N; i++) {
    t.L[i] += t.R[i - d] * feedback * mix;
    t.R[i] += t.L[i - d] * feedback * mix;
  }
}
delay(music, BEAT * 0.75, 0.32, 0.6);

// ---------------------------------------------------------------- effects

const sfx = track();

const SOUNDS = {
  impact(start, g) {
    const f = svf();
    let ph = 0;
    for (let n = 0; n < 1.4 * SR; n++) {
      const t = n / SR;
      ph += TAU * (32 + 40 * Math.exp(-t / 0.12)) / SR;
      const sub = Math.sin(ph) * Math.exp(-t / 0.55);
      const crack = f(noise(), 2400 * Math.exp(-t / 0.3) + 200, 0.7).lp * Math.exp(-t / 0.12);
      add(sfx, start + n, (sub * 0.9 + crack * 0.6) * g);
    }
  },
  thump(start, g) {
    let ph = 0;
    for (let n = 0; n < 0.3 * SR; n++) {
      const t = n / SR;
      ph += TAU * (40 + 90 * Math.exp(-t / 0.03)) / SR;
      add(sfx, start + n, Math.sin(ph) * Math.exp(-t / 0.09) * 0.9 * g);
    }
  },
  whoosh(start, g) {
    // half a beat long, peaking exactly on the cut that follows
    const f = svf();
    const len = Math.round(BEAT * 0.5 * SR);
    for (let n = 0; n < len; n++) {
      const x = n / len;
      const v = f(noise(), 300 + 4200 * x * x, 1.2).bp * Math.pow(x, 2.2) * 0.7 * g;
      add(sfx, start + n, v * (0.6 + 0.4 * x), v * (1 - 0.4 * x));
    }
  },
  pop(start, g) {
    let ph = 0;
    for (let n = 0; n < 0.07 * SR; n++) {
      const t = n / SR;
      ph += TAU * (520 + 520 * Math.min(1, t / 0.02)) / SR;
      add(sfx, start + n, Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.022) * 0.45 * g);
    }
  },
  tick(start, g) {
    for (let n = 0; n < 0.025 * SR; n++) {
      const t = n / SR;
      add(sfx, start + n, Math.sin(TAU * 2200 * t) * Math.exp(-t / 0.006) * 0.35 * g);
    }
  },
  click(start, g) {
    // a mouse click: two tiny transients and a short tick
    for (const off of [0, 0.045]) {
      const s = start + Math.round(off * SR);
      for (let n = 0; n < 0.02 * SR; n++) {
        const t = n / SR;
        const v = (noise() * Math.exp(-t / 0.0015) * 0.6 + Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.004) * 0.4) * g;
        add(sfx, s + n, v * 0.55);
      }
    }
  },
};

for (const [beat, type, gain] of SFX) SOUNDS[type](at(beat), gain);

// riser into the number
{
  const s = at(RISER.from), len = at(RISER.to) - s;
  const f = svf();
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    ph += TAU * (180 + 1100 * x * x) / SR;
    const v = (f(noise(), 400 + 6000 * x, 1.5).bp * 0.5 + Math.sin(ph) * 0.15) * Math.pow(x, 1.6) * 0.8;
    add(sfx, s + n, v, v);
  }
}

// ------------------------------------------------------------------- output

function fadeOut(t, seconds) {
  const len = Math.round(seconds * SR);
  for (let i = 0; i < len; i++) {
    const g = 1 - i / len;
    t.L[N - len + i] *= g; t.R[N - len + i] *= g;
  }
}
fadeOut(music, 0.35);
fadeOut(sfx, 0.35);

function writeWav(path, t) {
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(t.L[i]), Math.abs(t.R[i]));
  // gentle saturation instead of hard clipping; loudness is set later in the mix
  const norm = peak > 0 ? 0.9 / Math.tanh(peak) : 1;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(t.L[i]) * norm * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(t.R[i]) * norm * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${DUR}s, peak before saturation ${peak.toFixed(2)})`);
}

mkdirSync('out', { recursive: true });
writeWav('out/music.wav', music);
writeWav('out/sfx.wav', sfx);
