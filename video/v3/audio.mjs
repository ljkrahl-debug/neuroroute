// Score and sound design, synthesized in code plus recorded effects.
//
//   node audio.mjs     -> out/music.wav, out/sfx.wav   (run fetch-sfx.mjs first)
//
// Every sound is placed from EV in cues.mjs — the same table the picture
// reads. Continuous sounds are shaped by the picture's own motion curves
// (S.travel follows a line's speed, S.pour rises in pitch as something
// fills); recorded hits are placed by their measured peak (rec). All noise is
// seeded: the render is identical every time.
//
// Started from the motion-reel template: keep the instruments, effects,
// sample engine and mixing; replace CHORDS, the arrangement and the
// placements with the film's own.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { BPM, BEATS, EV } from './cues.mjs';
import { SFX_IDS } from './fetch-sfx.mjs';

const SR = 48000;
const BEAT = 60 / BPM;
const DUR = BEATS * BEAT;
const N = Math.round(DUR * SR);
const TAU = Math.PI * 2;
const sec = (beat) => beat * BEAT;
const at = (beat) => Math.round(sec(beat) * SR);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

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

const track = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
// equal-power pan, -1 left … +1 right
const panLR = (p) => [Math.cos((clamp(p, -1, 1) + 1) * Math.PI / 4), Math.sin((clamp(p, -1, 1) + 1) * Math.PI / 4)];
function put(dst, i, v, pan = 0, send = null, sendAmt = 0) {
  if (i < 0 || i >= N) return;
  const [l, r] = panLR(pan);
  dst.L[i] += v * l; dst.R[i] += v * r;
  if (send && sendAmt) { send.L[i] += v * l * sendAmt; send.R[i] += v * r * sendAmt; }
}
// screen x (0..1080) to a pan position
const xpan = (x) => clamp((x / 1080 - 0.5) * 1.3, -0.9, 0.9);

// Chamberlin state-variable filter. It goes unstable once f² + 2f/q nears 4
// (a low Q at a high cutoff), so f is held under that bound.
function svf() {
  let low = 0, band = 0;
  return (x, cutoff, q = 0.7) => {
    const fMax = (-2 / q + Math.sqrt(4 / (q * q) + 14)) / 2;
    const f = Math.min(fMax, 2 * Math.sin(Math.PI * Math.min(Math.max(cutoff, 20), SR / 6) / SR));
    low += f * band;
    const high = x - low - (1 / q) * band;
    band += f * high;
    return { lp: low, bp: band, hp: high };
  };
}

// the picture's easing, so the sound moves exactly like the image
const E = {
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outCubic: (x) => 1 - (1 - x) ** 3,
};
const rampB = (tSec, b0, b1) => clamp((tSec - sec(b0)) / (sec(b1) - sec(b0)));
// speed (0..1-ish) of an eased move from b0 to b1, at time tSec
const speedOf = (ease, tSec, b0, b1) => {
  const h = 1 / 480;
  return (ease(rampB(tSec + h, b0, b1)) - ease(rampB(tSec - h, b0, b1))) / (2 * h) * (sec(b1) - sec(b0));
};

const music = track(), musicSend = track();
const sfx = track(), sfxSend = track();

// ================================================================ the score

// A minor. The opening mickey-mouses the line: down the scale on the way
// out, a breathy, hollow line back up. The riser sits on E (the dominant)
// and resolves to Am on the drop. The logo rings out on Am(add9).
const CH = {
  Am: [57, 60, 64], F: [53, 57, 60], C: [55, 60, 64], G: [55, 59, 62], E: [56, 59, 64], Esus: [57, 59, 64],
  Fmaj7: [53, 57, 60, 64], Am9: [57, 60, 64, 71],
};
const ROOT = { Am: 45, F: 41, C: 48, G: 43, E: 40, Esus: 40, Fmaj7: 41, Am9: 45 };
// chord per beat: the build sits on E (the dominant) and resolves to Am on the payoff
function chordAt(b) {
  if (b < 4) return 'Am';
  if (b < 6) return 'F';
  if (b < 7) return 'Esus';
  if (b < 8) return 'E';
  if (b < 12) return 'Am9';
  return 'Fmaj7';
}

function kick(startBeat, gain = 1) {
  const s = at(startBeat), len = Math.round(0.45 * SR);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph += TAU * (44 + 130 * Math.exp(-t / 0.028)) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.17);
    const click = n < 160 ? noise() * 0.4 * (1 - n / 160) : 0;
    put(music, s + n, Math.tanh((body * 1.3 + click) * 1.2) * 0.85 * gain);
  }
}

function clap(startBeat, gain = 1) {
  const s = at(startBeat), len = Math.round(0.3 * SR);
  const f = svf();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const burst = [0, 0.01, 0.021].some((o) => t >= o && t < o + 0.007) ? 1 : 0;
    const env = Math.max(burst, t > 0.021 ? Math.exp(-(t - 0.021) / 0.08) : 0);
    const v = f(noise(), 1500, 1.3).bp * env * 0.6 * gain;
    put(music, s + n, v, 0.08, musicSend, 0.35);
  }
}

function hat(startBeat, open = false, gain = 1, pan = 0.25) {
  const s = at(startBeat), len = Math.round((open ? 0.22 : 0.05) * SR);
  const f = svf();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.exp(-t / (open ? 0.07 : 0.013));
    put(music, s + n, f(noise(), 9500, 0.8).hp * env * 0.2 * gain, pan, musicSend, 0.1);
  }
}

function snare(startBeat, gain = 1) {
  const s = at(startBeat), len = Math.round(0.16 * SR);
  const f = svf();
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph += TAU * (190 + 60 * Math.exp(-t / 0.01)) / SR;
    const v = (f(noise(), 4200, 0.9).bp * 0.8 + Math.sin(ph) * 0.4) * Math.exp(-t / 0.045) * 0.5 * gain;
    put(music, s + n, v, -0.05, musicSend, 0.25);
  }
}

function crash(startBeat, gain = 1, reverse = false, lenSec = 2.2) {
  const len = Math.round(lenSec * SR);
  const s = reverse ? at(startBeat) - len : at(startBeat);
  const f1 = svf(), f2 = svf();
  for (let n = 0; n < len; n++) {
    const k = reverse ? len - 1 - n : n;
    const t = k / SR;
    const env = Math.exp(-t / (lenSec * 0.32)) * Math.min(1, t / 0.002);
    const x = f2(f1(noise(), 7000, 0.6).hp, 12000, 0.5).lp;
    put(music, s + n, x * env * 0.32 * gain, (n % 2 ? 0.3 : -0.3) * 0.5, musicSend, 0.4);
  }
}

function bassNote(startBeat, lenBeats, note, gain = 1, bright = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const f1 = svf(), f2 = svf();
  const hz = midi(note);
  let ph = 0;
  for (let n = 0; n < len + 1600; n++) {
    const t = n / SR;
    ph = (ph + hz / SR) % 1;
    const saw = 2 * ph - 1, sub = Math.sin(TAU * ph);
    const gate = n < len ? 1 : Math.exp(-(n - len) / 500);
    const env = Math.min(1, t / 0.003) * gate * (0.7 + 0.3 * Math.exp(-t / 0.09));
    const cutoff = 150 + 1100 * bright * Math.exp(-t / 0.06);
    const x = f2(f1(saw, cutoff, 1.0).lp, cutoff, 0.9).lp;
    put(music, s + n, Math.tanh((x * 0.7 + sub * 0.45) * 1.4) * 0.42 * gain);
  }
}

// supersaw: seven detuned saws per note, low-passed, with an optional
// sidechain pump on every beat
function chord(startBeat, lenBeats, notes, gain = 1, { cutoff = 1800, pump = false, attack = 0.02 } = {}) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const det = [-0.011, -0.0065, -0.0025, 0, 0.0025, 0.0065, 0.011];
  const voices = notes.flatMap((note) => det.map((d, i) => ({ hz: midi(note) * (1 + d), ph: rnd(), pan: (i / 6 - 0.5) * 1.6 })));
  const fl = svf(), fr = svf();
  for (let n = 0; n < len + 4800; n++) {
    const t = n / SR;
    const rel = n < len ? 1 : Math.exp(-(n - len) / 2400);
    let env = Math.min(1, t / attack) * rel;
    if (pump) { const ph = ((startBeat * BEAT + t) / BEAT) % 1; env *= 1 - 0.7 * Math.exp(-ph * 7); }
    let l = 0, r = 0;
    for (const v of voices) {
      v.ph = (v.ph + v.hz / SR) % 1;
      const x = 2 * v.ph - 1;
      l += x * (1 - v.pan) * 0.5; r += x * (1 + v.pan) * 0.5;
    }
    const c = cutoff * (0.8 + 0.2 * Math.sin(TAU * 0.5 * t));
    const vl = fl(l, c, 0.7).lp, vr = fr(r, c, 0.7).lp;
    const k = 0.028 * gain * env / notes.length;
    if (s + n < N && s + n >= 0) {
      music.L[s + n] += vl * k; music.R[s + n] += vr * k;
      musicSend.L[s + n] += vl * k * 0.35; musicSend.R[s + n] += vr * k * 0.35;
    }
  }
}

function pad(startBeat, lenBeats, notes, gain = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const filters = notes.map(() => [svf(), svf()]);
  const ph = notes.map(() => [rnd(), rnd(), rnd(), rnd()]);
  for (let n = 0; n < len + 14400; n++) {
    const t = n / SR;
    const rel = n < len ? 1 : Math.exp(-(n - len) / 7200);
    const env = Math.min(1, t / 0.6) * rel;
    let l = 0, r = 0;
    notes.forEach((note, k) => {
      const hz = midi(note), p = ph[k];
      p[0] = (p[0] + hz * 1.003 / SR) % 1; p[1] = (p[1] + hz * 0.997 / SR) % 1;
      p[2] = (p[2] + hz * 1.006 / SR) % 1; p[3] = (p[3] + hz * 0.994 / SR) % 1;
      const cut = 700 + 300 * Math.sin(TAU * 0.2 * t + k);
      l += filters[k][0]((2 * p[0] - 1) + (2 * p[1] - 1), cut, 0.6).lp;
      r += filters[k][1]((2 * p[2] - 1) + (2 * p[3] - 1), cut, 0.6).lp;
    });
    const i = s + n;
    if (i >= 0 && i < N) {
      const k = 0.05 * gain * env;
      music.L[i] += l * k; music.R[i] += r * k;
      musicSend.L[i] += l * k * 0.6; musicSend.R[i] += r * k * 0.6;
    }
  }
}

function pluck(startBeat, note, pan = 0, gain = 1, decay = 0.12) {
  const s = at(startBeat), len = Math.round((decay * 4) * SR);
  const f = svf();
  const hz = midi(note);
  let ph = rnd();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    ph = (ph + hz / SR) % 1;
    const x = f((2 * ph - 1) * 0.6 + (ph < 0.5 ? 0.4 : -0.4), 500 + 5600 * Math.exp(-t / 0.05), 0.8).lp;
    const env = Math.min(1, t / 0.002) * Math.exp(-t / decay);
    put(music, s + n, x * env * 0.16 * gain, pan, musicSend, 0.3);
  }
}

// breathy, hollow tone for the empty way back: a sine with noise blown
// through a resonant band at the same pitch
function breath(startBeat, lenBeats, note, pan = 0, gain = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const f = svf();
  const hz = midi(note);
  let ph = 0;
  for (let n = 0; n < len + 4800; n++) {
    const t = n / SR;
    ph += TAU * hz * (1 + 0.004 * Math.sin(TAU * 5 * t)) / SR;
    const rel = n < len ? 1 : Math.exp(-(n - len) / 2400);
    const env = Math.min(1, t / 0.05) * rel;
    const air = f(noise(), hz, 12).bp;
    put(music, s + n, (Math.sin(ph) * 0.35 + air * 0.9) * env * 0.16 * gain, pan, musicSend, 0.6);
  }
}


// The music is the TikTok sound by uzan.x, played straight from its start
// (out/music.wav, cut by deliver.mjs); this file writes the effects only.

// ================================================================ the effects

const S = {
  /** The line travelling: amplitude and pitch follow its speed. 'full' is a
   * warm saw-and-noise zip; 'hollow' is wind blown through an empty tube. */
  travel(b0, b1, ease, kind, panFrom, panTo, gain = 1) {
    const s = at(b0), len = at(b1) - s + Math.round(0.15 * SR);
    const f1 = svf(), f2 = svf(), f3 = svf();
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const tSec = (s + n) / SR;
      const v = clamp(speedOf(ease, tSec, b0, b1) / 2, 0, 1.4);
      const pan = panFrom + (panTo - panFrom) * ease(rampB(tSec, b0, b1));
      let x;
      if (kind === 'full') {
        ph = (ph + (55 + 140 * v) / SR) % 1;
        x = f1(noise(), 300 + 2600 * v, 1.1).bp * 0.8 + f2(2 * ph - 1, 400 + 1500 * v, 0.8).lp * 0.5;
      } else {
        // two pipe resonances that rise with speed: the empty tube whistles
        const base = 520 + 900 * v;
        x = f1(noise(), base, 14).bp * 0.9 + f2(noise(), base * 2.01, 18).bp * 0.5 + f3(noise(), 5000, 0.7).hp * 0.08;
      }
      put(sfx, s + n, x * v * 0.5 * gain, pan, sfxSend, kind === 'hollow' ? 0.5 : 0.2);
    }
  },
  /** A word slamming in. Solid: a heavy thock. Hollow: a knock on an empty container. */
  word(beat, kind, pan = 0.2, gain = 1) {
    const s = at(beat);
    const f = svf(), g2 = svf();
    let ph = 0;
    for (let n = 0; n < 0.9 * SR; n++) {
      const t = n / SR;
      let v;
      if (kind === 'solid') {
        ph += TAU * (60 + 120 * Math.exp(-t / 0.02)) / SR;
        v = Math.sin(ph) * Math.exp(-t / 0.09) * 0.8 + f(noise(), 1800, 0.9).bp * Math.exp(-t / 0.012) * 0.5;
      } else {
        // a resonant, ringing body: empty
        const exc = n < 220 ? noise() * (1 - n / 220) : 0;
        v = f(exc, 210, 28).bp * 2.4 + g2(exc, 640, 22).bp * 1.2;
        v *= Math.exp(-t / 0.35);
      }
      put(sfx, s + n, v * 0.55 * gain, pan, sfxSend, kind === 'solid' ? 0.15 : 0.45);
    }
  },
  impact(beat, gain = 1, pan = 0) {
    const s = at(beat);
    const f = svf();
    let ph = 0;
    for (let n = 0; n < 1.6 * SR; n++) {
      const t = n / SR;
      ph += TAU * (30 + 70 * Math.exp(-t / 0.1)) / SR;
      const sub = Math.sin(ph) * Math.exp(-t / 0.6);
      const crack = f(noise(), 3000 * Math.exp(-t / 0.25) + 180, 0.7).lp * Math.exp(-t / 0.1);
      put(sfx, s + n, (sub * 0.95 + crack * 0.7) * gain, pan, sfxSend, 0.35);
    }
  },
  /** Whoosh peaking at `peakSec` (absolute), sweeping pan and pitch with it. */
  whoosh(peakSec, { pre = 0.35, post = 0.25, gain = 1, panFrom = -0.6, panTo = 0.6, lo = 250, hi = 4200, q = 1.2 } = {}) {
    const s = Math.round((peakSec - pre) * SR), len = Math.round((pre + post) * SR);
    const f1 = svf(), f2 = svf();
    for (let n = 0; n < len; n++) {
      const t = n / SR - pre;
      const env = t < 0 ? Math.pow(1 + t / pre, 2.4) : Math.exp(-t / (post * 0.35));
      const sweep = t < 0 ? 1 + t / pre : 1 - Math.min(1, t / post) * 0.6;
      const c = lo + (hi - lo) * sweep * sweep;
      const x = f1(noise(), c, q).bp * 0.8 + f2(noise(), c * 0.5, 0.8).lp * 0.25;
      const pan = panFrom + (panTo - panFrom) * clamp(n / len);
      put(sfx, s + n, x * env * 0.75 * gain, pan, sfxSend, 0.3);
    }
  },
  /** Something turning or lying down: a whoosh that swirls (a comb filter sweeping through it). */
  swirl(beat, dur = 0.7, gain = 1) {
    const s = at(beat), len = Math.round(dur * SR);
    const D = 2400, buf = new Float32Array(D);
    const f = svf();
    for (let n = 0; n < len; n++) {
      const x = n / len;
      const env = Math.sin(Math.PI * Math.min(1, x * 1.3)) ** 2;
      const src = f(noise(), 600 + 3000 * x, 0.9).bp;
      const delay = Math.round(40 + 600 * (0.5 + 0.5 * Math.sin(TAU * 2.2 * x)));
      const y = src + 0.7 * buf[(n - delay + D * 8) % D];
      buf[n % D] = y;
      put(sfx, s + n, y * env * 0.4 * gain, -0.5 + x, sfxSend, 0.35);
    }
  },
  /** Glass materialising: a cluster of inharmonic high partials. */
  glass(beat, gain = 1, pan = 0, base = 1) {
    const s = at(beat);
    const parts = [2093, 3136, 4186, 5274, 6645].map((h) => h * base);
    const phs = parts.map(() => rnd());
    for (let n = 0; n < 1.0 * SR; n++) {
      const t = n / SR;
      let v = 0;
      parts.forEach((hz, i) => { phs[i] += hz / SR; v += Math.sin(TAU * phs[i]) * Math.exp(-t / (0.5 - i * 0.07)) / (i + 1.5); });
      const env = Math.min(1, t / 0.004);
      put(sfx, s + n, v * env * 0.22 * gain, pan, sfxSend, 0.6);
    }
  },
  blip(beat, hz = 1200, gain = 1, pan = 0, up = 1.5) {
    const s = at(beat);
    let ph = 0;
    for (let n = 0; n < 0.09 * SR; n++) {
      const t = n / SR;
      ph += TAU * hz * (1 + (up - 1) * Math.min(1, t / 0.025)) / SR;
      put(sfx, s + n, Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.028) * 0.3 * gain, pan, sfxSend, 0.25);
    }
  },
  /** A sweeping scan tone, for something being analysed. */
  scan(b0, b1, gain = 1) {
    const s = at(b0), len = at(b1) - s;
    let ph = 0, mph = 0;
    for (let n = 0; n < len; n++) {
      const x = n / len;
      const hz = 600 + 1800 * x;
      mph += TAU * hz * 0.5 / SR;
      ph += TAU * (hz + Math.sin(mph) * hz * 0.8) / SR;
      const env = Math.sin(Math.PI * x) ** 0.6;
      put(sfx, s + n, Math.sin(ph) * env * 0.09 * gain, -0.7 + 1.4 * x, sfxSend, 0.3);
    }
  },
  /** Two-tone alert, for a warning tag appearing. */
  alert(beat, pan = 0.3) {
    S.blip(beat, 1319, 1.1, pan, 1.0);
    S.blip(beat + 0.12, 1047, 1.1, pan, 1.0);
  },
  click(beat, gain = 1, pan = 0) {
    for (const off of [0, 0.04]) {
      const s = at(beat) + Math.round(off * SR);
      for (let n = 0; n < 0.02 * SR; n++) {
        const t = n / SR;
        const v = noise() * Math.exp(-t / 0.0012) * 0.7 + Math.sin(TAU * (off ? 2400 : 3200) * t) * Math.exp(-t / 0.004) * 0.45;
        put(sfx, s + n, v * 0.6 * gain * (off ? 0.6 : 1), pan, sfxSend, 0.1);
      }
    }
  },
  tick(beat, hz = 2600, gain = 1, pan = 0) {
    const s = at(beat);
    for (let n = 0; n < 0.02 * SR; n++) {
      const t = n / SR;
      put(sfx, s + n, Math.sin(TAU * hz * t) * Math.exp(-t / 0.004) * 0.28 * gain, pan, sfxSend, 0.15);
    }
  },
  /** A soft airy swish for a cursor gliding in. */
  swish(beat, dur = 0.3, gain = 1, panFrom = 0.8, panTo = 0.2) {
    const s = at(beat), len = Math.round(dur * SR);
    const f = svf();
    for (let n = 0; n < len; n++) {
      const x = n / len;
      const env = Math.sin(Math.PI * x) ** 2;
      put(sfx, s + n, f(noise(), 2500 + 2500 * x, 1.0).bp * env * 0.22 * gain, panFrom + (panTo - panFrom) * x, sfxSend, 0.15);
    }
  },
  thunk(beat, gain = 1, pan = 0, hz = 90) {
    const s = at(beat);
    let ph = 0;
    for (let n = 0; n < 0.25 * SR; n++) {
      const t = n / SR;
      ph += TAU * (hz + hz * 1.5 * Math.exp(-t / 0.015)) / SR;
      put(sfx, s + n, Math.sin(ph) * Math.exp(-t / 0.06) * 0.7 * gain, pan, sfxSend, 0.2);
    }
  },
  /** Liquid filling a tube: a resonant pour whose pitch rises as it fills
   * (like a bottle), plus seeded bubbles. Shaped by the picture's fill curve. */
  pour(b0, b1, ease, { from = 0, to = 1, gain = 1, pan = -0.4 } = {}) {
    const s = at(b0), len = at(b1) - s + Math.round(0.2 * SR);
    const f1 = svf(), f2 = svf();
    let nextBubble = 0, bph = 0, bhz = 0, bt = 1;
    const brnd = mulberry32(77);
    for (let n = 0; n < len; n++) {
      const tSec = (s + n) / SR;
      const level = from + (to - from) * ease(rampB(tSec, b0, b1));
      const flow = clamp(speedOf(ease, tSec, b0, b1) / 1.6, 0.15, 1);
      const res = 300 + 1700 * level;
      let x = f1(noise(), res, 9).bp * 0.7 + f2(noise(), res * 2.3, 6).bp * 0.25;
      if (n >= nextBubble) { bhz = res * (1.2 + brnd()); bt = 0; bph = 0; nextBubble = n + Math.round((0.02 + brnd() * 0.06) * SR); }
      bt += 1 / SR; bph += TAU * bhz * (1 + bt * 18) / SR;
      x += Math.sin(bph) * Math.exp(-bt / 0.012) * 0.35;
      const tail = n > at(b1) - s ? Math.exp(-(n - (at(b1) - s)) / (0.05 * SR)) : 1;
      put(sfx, s + n, x * flow * tail * 0.5 * gain, pan, sfxSend, 0.4);
    }
  },
  /** A split-flap letter turning over. */
  flap(beat, gain = 1, pan = 0.3) {
    const s = at(beat);
    const f = svf();
    for (let n = 0; n < 0.08 * SR; n++) {
      const t = n / SR;
      const exc = n < 90 ? noise() : 0;
      const v = f(exc, 2600, 6).bp * 2 * Math.exp(-t / 0.02) + noise() * Math.exp(-t / 0.002) * 0.3;
      put(sfx, s + n, v * 0.45 * gain, pan, sfxSend, 0.15);
    }
    // the second half of the flap landing
    S.tick(beat + 0.06, 1800, 0.6 * gain, pan);
  },
  /** A bright two-note success chime. */
  chime(beat, notes = [84, 91], gain = 1, pan = 0) {
    notes.forEach((m, i) => {
      const s = at(beat) + Math.round(i * 0.07 * SR);
      const hz = midi(m);
      let p1 = 0, p2 = 0;
      for (let n = 0; n < 1.2 * SR; n++) {
        const t = n / SR;
        p1 += TAU * hz / SR; p2 += TAU * hz * 3.01 / SR;
        const v = (Math.sin(p1 + 0.6 * Math.sin(p2) * Math.exp(-t / 0.2))) * Math.exp(-t / 0.45) * Math.min(1, t / 0.003);
        put(sfx, s + n, v * 0.2 * gain, pan + (i ? 0.15 : -0.15), sfxSend, 0.5);
      }
    });
  },
  /** A bell-like ping, for nodes. */
  ping(beat, note, gain = 1, pan = 0, decay = 0.6) {
    const s = at(beat), hz = midi(note);
    let p1 = 0, p2 = 0;
    for (let n = 0; n < decay * 3 * SR; n++) {
      const t = n / SR;
      p1 += TAU * hz / SR; p2 += TAU * hz * 2.76 / SR;
      const v = Math.sin(p1 + 1.2 * Math.sin(p2) * Math.exp(-t / 0.08)) * Math.exp(-t / decay) * Math.min(1, t / 0.002);
      put(sfx, s + n, v * 0.16 * gain, pan, sfxSend, 0.55);
    }
  },
  /** A rising "pew": something sent outwards. */
  send(beat, gain = 1, pan = 0) {
    const s = at(beat);
    let ph = 0;
    for (let n = 0; n < 0.35 * SR; n++) {
      const t = n / SR;
      ph += TAU * (500 + 2500 * (1 - Math.exp(-t / 0.08))) / SR;
      put(sfx, s + n, Math.sin(ph) * Math.exp(-t / 0.09) * Math.min(1, t / 0.004) * 0.18 * gain, pan, sfxSend, 0.5);
    }
  },
  /** A clean riser into the drop. */
  riser(b0, b1, gain = 1) {
    const s = at(b0), len = at(b1) - s;
    const f = svf();
    let ph = 0, ph2 = 0;
    for (let n = 0; n < len; n++) {
      const x = n / len;
      ph += TAU * (110 + 880 * x * x) / SR;
      ph2 += TAU * (110 + 880 * x * x) * 1.007 / SR;
      const v = f(noise(), 500 + 7000 * x * x, 1.4).bp * 0.6 + (2 * ((ph / TAU) % 1) - 1 + 2 * ((ph2 / TAU) % 1) - 1) * 0.12;
      put(sfx, s + n, v * Math.pow(x, 1.8) * 0.75 * gain, Math.sin(TAU * x * 3) * 0.3, sfxSend, 0.3);
    }
  },
  /** Implosion: noise sucked inwards, ending in a pop. */
  implode(beatEnd, dur = 0.5, gain = 1) {
    const e = at(beatEnd), len = Math.round(dur * SR), s = e - len;
    const f = svf();
    for (let n = 0; n < len; n++) {
      const x = n / len;
      put(sfx, s + n, f(noise(), 6000 - 5200 * x, 1.2).bp * Math.pow(x, 2) * 0.6 * gain, (1 - x) * (n % 2 ? 0.5 : -0.5), sfxSend, 0.3);
    }
    S.thunk(beatEnd, 0.8 * gain, 0, 140);
  },
  shimmer(beat, gain = 1) {
    const s = at(beat);
    const parts = [72, 76, 79, 83, 88, 91].map(midi);
    const phs = parts.map(() => rnd());
    for (let n = 0; n < 2.2 * SR; n++) {
      const t = n / SR;
      let l = 0, r = 0;
      parts.forEach((hz, i) => {
        phs[i] += hz * (1 + 0.002 * Math.sin(TAU * (3 + i) * t)) / SR;
        const v = Math.sin(TAU * phs[i]) * Math.exp(-t / (1.2 - i * 0.12)) * Math.min(1, t / (0.01 + i * 0.03));
        if (i % 2) r += v; else l += v;
      });
      const i = s + n;
      if (i < N) { sfx.L[i] += l * 0.05 * gain; sfx.R[i] += r * 0.05 * gain; sfxSend.L[i] += l * 0.04 * gain; sfxSend.R[i] += r * 0.04 * gain; }
    }
  },
  /** A soft sine glide, for the dot travelling home. */
  glide(b0, b1, hz0, hz1, gain = 1, panFrom = 0, panTo = -0.6) {
    const s = at(b0), len = at(b1) - s;
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const x = n / len;
      const e = E.inOutCubic(x);
      ph += TAU * (hz0 + (hz1 - hz0) * e) / SR;
      put(sfx, s + n, Math.sin(ph) * Math.sin(Math.PI * x) * 0.12 * gain, panFrom + (panTo - panFrom) * e, sfxSend, 0.5);
    }
  },
};

// a camera whip is a (near) critically damped spring: fastest 1/sqrt(k) s in
const peakOf = (k) => 1 / Math.sqrt(k);
const WHIP_PEAK = peakOf(190), HOME_PEAK = peakOf(110);

// ---- the effects, each named after the picture event it lands on
for (const [i, b] of [EV.w1, EV.w2, EV.w3, EV.w4, EV.w5].entries()) S.word(b, i === 4 ? 'hollow' : 'solid', 0.2, 0.8);
for (let b = 0; b < EV.freeze; b++) S.blip(b + 0.02, 1400 + 300 * Math.sin(b * 2.1), 0.25, Math.sin(b * 1.3) * 0.7);   // a call rings
S.whoosh(sec(EV.collapse) + 0.5, { pre: 0.5, post: 0.1, lo: 4000, hi: 300, gain: 0.6, panFrom: 0.5, panTo: 0 });
S.implode(EV.dot, 0.6, 0.9);
S.word(EV.neon, 'hollow', 0, 0.5); S.word(EV.neon + 0.35, 'hollow', 0, 0.5);
S.riser(EV.drop - 1.5, EV.drop - 0.05, 0.5);
S.impact(EV.drop, 1.6, 0);
S.shimmer(EV.drop + 0.1, 0.7);
S.word(EV.headNet, 'solid', -0.3, 0.4); S.word(EV.headNet + 0.25, 'solid', -0.3, 0.4);
S.word(EV.partners, 'solid', -0.3, 0.4); S.word(EV.partners + 0.25, 'solid', -0.3, 0.4);
[0, 1, 2, 3, 4].forEach((k) => S.ping(EV.partners + 0.3 + k * 0.08, [81, 84, 88, 91, 93][k], 0.5, -0.5 + k * 0.25));
S.word(EV.empty, 'hollow', -0.3, 0.5); S.word(EV.empty + 0.25, 'solid', -0.3, 0.4);
S.pour(EV.fill, EV.fill + 3, E.inOutCubic, { from: 0, to: 1, gain: 0.6, pan: 0 });
S.word(EV.modes, 'solid', -0.3, 0.4); S.word(EV.modes + 0.25, 'solid', -0.3, 0.4);
[0, 1, 2, 3].forEach((k) => S.whoosh(sec(EV.modes + k * 0.2) + 0.3, { pre: 0.25, post: 0.2, lo: 500, hi: 3500, gain: 0.35, panFrom: 0, panTo: k % 2 ? 0.7 : -0.7 }));
S.implode(EV.converge + 0.6, 0.5, 0.8);
S.impact(EV.wordmark, 0.8, 0); S.shimmer(EV.wordmark, 1.0);
S.word(EV.claim, 'solid', 0, 0.3);
S.whoosh(sec(EV.retract) + 0.15, { pre: 0.25, post: 0.1, lo: 4000, hi: 500, gain: 0.5, panFrom: 0.3, panTo: 0 });
S.swish(EV.shatter, 0.6, 0.7, 0, 0.6);

// ============================================================ recorded layer

// Recorded effects (fetch-sfx.mjs), each placed so its loudest moment lands
// on its event. Loudness is matched first (the loudest 50 ms of every file is
// brought to the same level), so the gains below are a mix, not a repair.
const SAMPLES = {};
const missing = new Set();
function sampleOf(id) {
  if (SAMPLES[id]) return SAMPLES[id];
  const path = `out/sfx/${id}.f32`;
  if (!existsSync(path)) { missing.add(id); return null; }
  const raw = readFileSync(path);
  const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
  const n = f.length / 2, L = new Float32Array(n), Rr = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; Rr[i] = f[2 * i + 1]; }
  const win = Math.round(0.05 * SR);
  let best = 0, peakAt = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    acc += L[i] * L[i] + Rr[i] * Rr[i];
    if (i >= win) acc -= L[i - win] * L[i - win] + Rr[i - win] * Rr[i - win];
    if (acc > best) { best = acc; peakAt = i - win / 2; }
  }
  const norm = 0.25 / Math.sqrt(best / (2 * win) + 1e-12);
  return (SAMPLES[id] = { L, R: Rr, n, peakAt: Math.max(0, peakAt), norm });
}

/**
 * Place a recorded effect. `atSec` is where its peak lands (or its start,
 * with align 'start'). rate < 1 plays it lower and longer; reverse plays it
 * backwards (its peak then lands at the end of the swell); len trims it with
 * a short fade. Samples running past either end wrap round: the film loops.
 */
function rec(name, atSec, { gain = 1, pan = 0, rate = 1, reverse = false, align = 'peak', len = null, send = 0.25, wrap = true, pre = 0.7 } = {}) {
  const smp = sampleOf(SFX_IDS[name]);
  if (!smp) return;
  const total = Math.floor((smp.n - 1) / rate);
  const peakOut = (reverse ? smp.n - 1 - smp.peakAt : smp.peakAt) / rate;
  const start = Math.round(atSec * SR - (align === 'peak' ? peakOut : 0));
  const keep = len == null ? total : Math.min(total, Math.round(len * SR));
  const fade = Math.round(0.03 * SR);
  // a long swell before the peak is cut to `pre` seconds and faded in, so a
  // whoosh cannot spill over the event before it
  const first = align === 'peak' ? Math.max(0, Math.round(peakOut - pre * SR)) : 0;
  const fadeIn = Math.round(0.06 * SR);
  const [pl, pr] = panLR(pan);
  const g = gain * smp.norm;
  for (let k = first; k < keep; k++) {
    let pos = k * rate;
    if (reverse) pos = smp.n - 1 - pos;
    const i0 = Math.floor(pos), fr = pos - i0, i1 = Math.min(smp.n - 1, i0 + 1);
    let l = smp.L[i0] * (1 - fr) + smp.L[i1] * fr, r = smp.R[i0] * (1 - fr) + smp.R[i1] * fr;
    let env = len != null && k > keep - fade ? (keep - k) / fade : 1;
    if (first > 0 && k < first + fadeIn) env *= (k - first) / fadeIn;
    l *= g * env * pl * 1.414; r *= g * env * pr * 1.414;
    let i = start + k;
    if (i < 0 || i >= N) { if (!wrap) continue; i = ((i % N) + N) % N; }
    sfx.L[i] += l; sfx.R[i] += r;
    sfxSend.L[i] += l * send; sfxSend.R[i] += r * send;
  }
}
const bt = (beat) => sec(beat);

// ---- recorded hits
for (const b of [EV.w1, EV.w2, EV.w3, EV.w4]) rec('fastBlow', bt(b), { gain: 0.45, pan: -0.2 });
rec('buzzGlitch', bt(EV.w5) + 0.42, { gain: 0.5, pan: 0.3 });
rec('spaceImpact', bt(EV.dot), { gain: 0.6, reverse: true, pre: 1.2 });
rec('buzzGlitch', bt(EV.neon) + 0.42, { gain: 0.4 });
rec('trailerImpact', bt(EV.drop), { gain: 1.75, pre: 1.0 });
rec('subHit', bt(EV.drop), { gain: 0.6, align: 'start' });
rec('optionSelect', bt(EV.partners + 0.3), { gain: 0.4, align: 'start' });
rec('deepBubbles', bt(EV.fill), { gain: 0.35, align: 'start', len: bt(EV.fill + 3) - bt(EV.fill) });
rec('energyFlow', bt(EV.modes + 0.5), { gain: 0.3 });
rec('logoImpact', bt(EV.wordmark), { gain: 0.8, pre: 1.0 });
rec('glitterShot', bt(EV.wordmark + 1.0), { gain: 0.3 });

if (missing.size) console.log(`WARNING: recorded effects missing (${[...missing].join(', ')}): run node fetch-sfx.mjs — mixing without them`);

// =================================================================== mixing

/** Freeverb: eight damped combs and four all-passes per side. */
function reverb(src, { room = 0.86, damp = 0.3, wet = 1 } = {}) {
  const k = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => Math.round(n * k));
  const alls = [556, 441, 341, 225].map((n) => Math.round(n * k));
  const spread = Math.round(23 * k);
  const make = (sizes) => sizes.map((n) => ({ buf: new Float32Array(n), i: 0, store: 0 }));
  const sides = [[make(combs), make(alls)], [make(combs.map((n) => n + spread)), make(alls.map((n) => n + spread))]];
  const out = track();
  for (let n = 0; n < N; n++) {
    const input = (src.L[n] + src.R[n]) * 0.015;
    for (let side = 0; side < 2; side++) {
      const [cs, as] = sides[side];
      let acc = 0;
      for (const c of cs) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = input + c.store * room;
        c.i = c.i + 1 === c.buf.length ? 0 : c.i + 1;
        acc += y;
      }
      for (const a of as) {
        const b = a.buf[a.i];
        const y = -acc + b;
        a.buf[a.i] = acc + b * 0.5;
        a.i = a.i + 1 === a.buf.length ? 0 : a.i + 1;
        acc = y;
      }
      (side ? out.R : out.L)[n] = acc * wet;
    }
  }
  return out;
}

function addInto(dst, src, g = 1) { for (let i = 0; i < N; i++) { dst.L[i] += src.L[i] * g; dst.R[i] += src.R[i] * g; } }

addInto(music, reverb(musicSend, { room: 0.84, damp: 0.35 }), 0.9);
addInto(sfx, reverb(sfxSend, { room: 0.88, damp: 0.25 }), 1.0);

// the last 30 ms close to silence so the loop restart never clicks
function edgeFade(t, seconds) {
  const len = Math.round(seconds * SR);
  for (let i = 0; i < len; i++) { const g = i / len; t.L[N - 1 - i] *= g; t.R[N - 1 - i] *= g; }
}
edgeFade(music, 0.03); edgeFade(sfx, 0.03);

function writeWav(path, t) {
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(t.L[i]), Math.abs(t.R[i]));
  // scale so the loudest peak sits just into the soft knee, then saturate
  const pre = peak > 0 ? 1.2 / peak : 1, norm = 0.9 / Math.tanh(1.2);
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(t.L[i] * pre) * norm * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(t.R[i] * pre) * norm * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${DUR}s, peak before saturation ${peak.toFixed(2)})`);
}

mkdirSync('out', { recursive: true });

writeWav('out/sfx.wav', sfx);
