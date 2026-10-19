// Score and sound design for "Füllstand", synthesized in code.
//
//   node v2/audio.mjs     -> out/v2/music.wav, out/v2/sfx.wav
//
// Every sound is placed from EV in cues.mjs — the same table the picture
// reads — and the continuous ones are shaped by the same motion curves the
// picture uses: the line's zip follows its speed, the slider ratchets once
// per percent, the liquid rises in pitch as the leg fills, the whips peak
// when the camera is fastest. All noise is seeded: the render is identical
// every time.
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
// chord per beat
function chordAt(b) {
  if (b < 8) return 'Am';
  if (b < 12) return 'Am';
  if (b < 16) return 'F';
  if (b < 18) return 'C';
  if (b < 20) return 'G';
  if (b < 22) return 'Esus';
  if (b < 24) return 'E';
  if (b < 28) return 'Am';
  // 6 — weeks ahead: away from the tonic, a build on E into "all planned" on 40
  if (b < 32) return 'F';
  if (b < 36) return 'C';
  if (b < 38) return 'G';
  if (b < 40) return 'E';
  if (b < 48) return 'Am';
  if (b < 52) return 'F';
  if (b < 54) return 'C';
  if (b < 56) return 'G';
  if (b < 64) return 'Am9';
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

// ---------------------------------------------------------------- arrange

// 1 — the loop (beats 0–8): heartbeat kicks, a drone, the line's motif
for (const b of [0, 2, 4, 6]) kick(b, 0.7);
bassNote(0, 7.6, 33, 0.55, 0.3);           // A1 drone
pad(0, 8, [45, 52, 57], 0.6);
// down the scale as the line goes down (solid, plucked), arriving on the impact
[[0, 76], [0.5, 74], [1, 72], [1.5, 71], [2, 69], [2.5, 67]].forEach(([b, m], i) => pluck(b, m, -0.2 + i * 0.05, 0.9, 0.14));
// back up, hollow
[[3.5, 64], [4.25, 67], [5, 69], [5.75, 71], [6.5, 72]].forEach(([b, m], i) => breath(b, 0.7, m, 0.25 - i * 0.05, 0.9));

// 2–4 — card, offer, marketplace (8–20): the groove comes in, then lifts
for (let b = 8; b < 20; b++) {
  const c = chordAt(b);
  kick(b, b % 4 === 0 ? 0.95 : 0.8);
  hat(b + 0.5, b >= 16, b >= 16 ? 0.8 : 0.9);
  if (b >= 12) { hat(b + 0.25, false, 0.45, -0.25); hat(b + 0.75, false, 0.45, -0.25); }
  if (b >= 16 && b % 2 === 1) clap(b);
  bassNote(b, 0.42, ROOT[c], 0.85);
  bassNote(b + 0.5, 0.42, b % 4 === 3 ? ROOT[c] + 12 : ROOT[c], 0.85);
  if (b >= 16) for (let k = 0; k < 4; k++) pluck(b + k / 4, CH[c][(b * 4 + k) % 3] + 12, k % 2 ? 0.35 : -0.35, 0.75);
}
pad(8, 4, CH.Am, 0.8); pad(12, 4, CH.F, 0.8); pad(16, 2, CH.C, 0.9); pad(18, 2, CH.G, 0.9);

// 5 — the way back fills (20–24): kick drops out on the whip, then a build
// on E that resolves on the drop. A 1/16 of silence right before it.
pad(20, 2, CH.Esus, 1); pad(22, 1.75, CH.E, 1.1);
chord(21.5, 2.25, CH.E, 0.6, { cutoff: 900, attack: 0.8 });
for (let b = 21.5; b < 23.75; b += 0.5) bassNote(b, 0.4, ROOT.E, 0.7, 0.6);
// snare roll: eighths, then sixteenths, then thirty-seconds
for (let b = 22; b < 23.75; b += b < 23 ? 0.25 : 0.125) snare(b, 0.25 + 0.35 * (b - 22) / 1.75);
crash(24, 0.9, true, 1.6);  // reverse cymbal into the drop

// the full groove: everything, with the chords pumping. It carries the drop
// (24–28), "all planned" (40–44) and the network (44–56).
function fullGroove(b) {
  const c = chordAt(b);
  kick(b, 1);
  if (b % 2 === 1) clap(b, 1);
  hat(b + 0.5, true, 0.75);
  hat(b + 0.25, false, 0.5, -0.3); hat(b + 0.75, false, 0.5, -0.3);
  for (let k = 0; k < 4; k++) bassNote(b + k / 4, 0.2, k === 0 ? ROOT[c] : ROOT[c] + (k === 2 ? 12 : 0), k === 0 ? 0.95 : 0.6, 0.9);
  for (let k = 0; k < 4; k++) pluck(b + k / 4, CH[c][(b * 4 + k) % 3] + 24, k % 2 ? 0.45 : -0.45, 0.55, 0.09);
}
// 5 — the drop (24–28)
for (let b = 24; b < 28; b++) fullGroove(b);
chord(24, 4, CH.Am, 1, { pump: true, cutoff: 2600 });
crash(24, 1.0);

// 6 — weeks ahead (28–40): half-time, lighter, the arpeggio "thinking" while
// the forecast runs; a build on E with a 1/16 rest before "all planned"
for (let b = 28; b < 40; b++) {
  const c = chordAt(b);
  if (b % 2 === 0) kick(b, b % 4 === 0 ? 0.9 : 0.75);
  if (b % 4 === 2) clap(b, 0.8);
  hat(b + 0.5, false, 0.7);
  if (b >= 32) { hat(b + 0.25, false, 0.35, -0.3); if (b !== 39) hat(b + 0.75, false, 0.35, -0.3); }
  bassNote(b, b === 39 ? 0.7 : 0.9, ROOT[c], 0.75, 0.5);
  // the forecast's arpeggio: sixteenths, its filter opening with the scan
  const bright = b < 28 ? 0 : clamp((b - 28) / 4);
  for (let k = 0; k < (b === 39 ? 3 : 4); k++) pluck(b + k / 4, CH[c][(b * 4 + k) % 3] + 12 + (k === 3 ? 12 : 0), k % 2 ? 0.4 : -0.4, 0.35 + 0.2 * bright, 0.07 + 0.05 * bright);
}
pad(28, 4, CH.F, 0.9); pad(32, 4, CH.C, 0.9); pad(36, 2, CH.G, 1); pad(38, 1.75, CH.E, 1.1);
chord(28, 4, CH.F, 0.45, { cutoff: 1300, attack: 0.3 });
chord(32, 4, CH.C, 0.5, { cutoff: 1600, attack: 0.2 });
chord(37.5, 2.25, CH.E, 0.55, { cutoff: 900, attack: 0.8 });
for (let b = 38; b < 39.75; b += b < 39 ? 0.25 : 0.125) snare(b, 0.2 + 0.3 * (b - 38) / 1.75);
crash(EV.allFull, 0.8, true, 1.4);   // reverse cymbal into "all planned"

// "all planned" (40) and the network (44–56): the full groove again
for (let b = 40; b < 56; b++) fullGroove(b);
chord(40, 8, CH.Am, 0.9, { pump: true, cutoff: 2500 });
chord(48, 4, CH.F, 1, { pump: true, cutoff: 2400 });
chord(52, 2, CH.C, 1, { pump: true, cutoff: 3000 });
chord(54, 2, CH.G, 1, { pump: true, cutoff: 3000 });
crash(EV.allFull, 0.8);
crash(EV.headMarkt, 0.35);  // the window opens

// 8 — the brand (56–68): the groove stops, Am(add9) rings, the dot breathes
crash(EV.wordmark, 0.8, true, 1.2);
pad(EV.converge, 7.8, CH.Am9, 1.2);
chord(EV.wordmark, 6.5, CH.Am9, 0.55, { cutoff: 1400, attack: 0.01 });
bassNote(EV.wordmark, 6.5, 33, 0.7, 0.2);
for (let b = 58; b < 64; b += 0.5) pluck(b, CH.Am9[(b * 2) % 4] + 12, ((b * 2) % 2 ? 0.4 : -0.4), 0.45, 0.2);
pad(64, 4, CH.Fmaj7, 0.9);
for (const b of [64, 65, 66]) pluck(b, [69, 72, 76][b - 64], 0, 0.5, 0.3);

// ---- bolder layers: a braam on the big hits, an 808 under the drop, tension
// in the opening so the first seconds already pull

/** A braam: stacked, detuned low saws whose filter tears open, saturated. */
function braam(startBeat, lenSec, notes, gain = 1) {
  const s = at(startBeat), len = Math.round(lenSec * SR);
  const vs = notes.flatMap((m) => [-0.008, 0, 0.008].map((d) => ({ hz: midi(m) * (1 + d), ph: rnd() })));
  const fl = svf(), fr = svf();
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const env = Math.min(1, t / 0.02) * Math.exp(-t / (lenSec * 0.45));
    let l = 0, r = 0;
    vs.forEach((v, i) => { v.ph = (v.ph + v.hz / SR) % 1; const x = 2 * v.ph - 1; if (i % 2) l += x; else r += x; });
    const cut = 180 + 2600 * Math.exp(-t / 0.35) + 300 * Math.exp(-t / 1.2);
    const vl = Math.tanh(fl(l, cut, 1.2).lp * 0.9), vr = Math.tanh(fr(r, cut, 1.2).lp * 0.9);
    const i = s + n;
    if (i >= 0 && i < N) {
      music.L[i] += vl * env * 0.32 * gain; music.R[i] += vr * env * 0.32 * gain;
      musicSend.L[i] += vl * env * 0.12 * gain; musicSend.R[i] += vr * env * 0.12 * gain;
    }
  }
}

/** An 808: a sine that drops in pitch onto the note, driven into saturation. */
function bass808(startBeat, lenBeats, note, gain = 1) {
  const s = at(startBeat), len = Math.round(sec(lenBeats) * SR);
  const hz = midi(note);
  let ph = 0;
  for (let n = 0; n < len + 2400; n++) {
    const t = n / SR;
    ph += TAU * hz * (1 + 0.9 * Math.exp(-t / 0.03)) / SR;
    const rel = n < len ? 1 : Math.exp(-(n - len) / 900);
    const env = Math.min(1, t / 0.002) * rel * (0.8 + 0.2 * Math.exp(-t / 0.2));
    put(music, s + n, Math.tanh(Math.sin(ph) * 2.2) * 0.5 * env * gain);
  }
}

// a high, trembling string of tension over the opening, rising a little
{
  const s0 = at(0), len = at(7.8);
  let p1 = 0, p2 = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR, x = n / len;
    const hz = midi(81) * (1 + 0.06 * x);
    p1 += TAU * hz / SR; p2 += TAU * hz * 1.5 / SR;
    const trem = 0.6 + 0.4 * Math.sin(TAU * (6 + 6 * x) * t);
    const env = Math.min(1, t / 0.6) * (0.5 + 0.5 * x);
    put(music, s0 + n, (Math.sin(p1) + 0.4 * Math.sin(p2)) * trem * env * 0.035, 0, musicSend, 0.6);
  }
}
// sub pulses under the opening, every eighth, as the line runs
for (let b = 0.5; b < 7.5; b += 0.5) bass808(b, 0.3, 33, 0.35 + 0.25 * (b / 7.5));
braam(EV.drop, 2.4, [33, 45, 52], 1.25);
braam(EV.headMarkt, 1.8, [36, 48, 55], 0.4);
braam(EV.wordmark, 2.6, [33, 45, 52, 57], 0.6);
braam(EV.allFull, 2.0, [33, 45, 52], 0.75);   // "all planned": big, but under the drop
for (const [b0, b1] of [[24, 28], [40, 56]]) for (let b = b0; b < b1; b++) bass808(b, b % 4 === 3 ? 0.9 : 0.45, ROOT[chordAt(b)] - 12, 0.75);

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
  /** The loop lying down: a whoosh that swirls (a comb filter sweeping through it). */
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
  /** A sweeping scan tone across the card. */
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
  /** Two-tone alert for the amber "LEERFAHRT ERKANNT" tag. */
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

// the camera's whips: a damped spring with k = 190 is fastest ~0.07 s in
const WHIP_PEAK = 0.072;

// ---- 1: the loop
S.travel(EV.launch, EV.arriveM, E.outQuad, 'full', -0.55, -0.55, 1.1);
S.word(EV.voll, 'solid', 0.25); S.word(EV.hin, 'solid', 0.25);
S.impact(EV.arriveM, 1.0, -0.5);
S.travel(EV.turn, EV.arriveH, E.inOutCubic, 'hollow', -0.4, -0.4, 0.28);
S.word(EV.leer, 'hollow', 0.25, 0.7); S.word(EV.zurueck, 'hollow', 0.25, 0.7);
S.ping(EV.arriveH, 81, 0.7, -0.5, 0.4);

// ---- 2: the card
S.whoosh(sec(EV.morph) + 0.25, { pre: 0.2, post: 0.5, panFrom: -0.2, panTo: 0.9, gain: 0.45 }); // words pushed off right
S.swirl(EV.morph, 0.75, 0.55);
S.glass(EV.morph + 0.35, 0.55, 0);
S.blip(EV.cardTitle, 900, 0.7, -0.3); S.blip(EV.cardSub, 1100, 0.5, -0.3); S.blip(EV.cardBtn, 760, 0.8, -0.2, 1.3);
S.scan(EV.scan, EV.tag, 1);
S.alert(EV.tag, 0.25);
S.word(EV.headA, 'solid', -0.3, 0.32); S.word(EV.headB, 'solid', -0.3, 0.32);

// ---- 3: the offer
S.swish(EV.spedIn + 0.1, 0.35, 1, 0.8, -0.1);
S.tick(EV.hover1, 3400, 0.5, -0.2);
S.click(EV.click1, 1, -0.2);
S.whoosh(sec(EV.unfold) + 0.12, { pre: 0.12, post: 0.3, lo: 300, hi: 2500, panFrom: -0.2, panTo: 0, gain: 0.45 });
S.glass(EV.unfold + 0.2, 0.55, 0, 0.75);
S.thunk(EV.unfold + 0.45, 0.6, 0, 80);
S.word(EV.headPrice, 'solid', -0.3, 0.32);
[13.3, 13.38, 13.45, 13.5, 13.56, 13.6, 13.65].forEach((b, i) => S.blip(b, 700 + i * 120, 0.45, -0.3 + i * 0.1));
S.click(EV.grab, 0.6, -0.5);
{
  // one detent per percent, rising in pitch with the discount, exactly when the knob crosses it
  let last = 0;
  for (let n = at(EV.dragFrom); n < at(EV.dragTo); n++) {
    const d = 30 * E.inOutCubic(rampB(n / SR, EV.dragFrom, EV.dragTo));
    if (Math.floor(d) > last) {
      last = Math.floor(d);
      S.tick(n / SR / BEAT, 1600 + last * 45, 0.75, -0.6 + last / 30);
    }
  }
}
S.click(EV.release, 0.5, 0.1);
S.tick(EV.hover2, 3400, 0.5, 0);
S.click(EV.click2, 0.7, 0.1);
S.word(EV.click2, 'solid', -0.3, 0.4);

// ---- 4: the marketplace
S.whoosh(sec(EV.fold) + 0.12, { pre: 0.15, post: 0.15, lo: 2500, hi: 600, gain: 0.4, panFrom: 0, panTo: 0 }); // the panel folds
S.whoosh(sec(EV.whipUp) + WHIP_PEAK, { pre: 0.28, post: 0.4, lo: 200, hi: 5200, q: 0.9, gain: 0.55, panFrom: 0.3, panTo: -0.3 });
S.thunk(EV.land, 0.5, 0, 70);
[0, 0.06, 0.12].forEach((o, i) => S.thunk(EV.land + 0.05 + o, 0.18, 0.2 * i, 120 + 20 * i)); // the others make room
S.word(EV.headMarket, 'solid', -0.3, 0.32); S.word(EV.headMarket + 0.25, 'solid', -0.3, 0.32);
[16.3, 16.34, 16.38, 16.42, 16.46].forEach((b, i) => S.blip(b, 1000 + i * 150, 0.22, -0.2 + i * 0.1));
S.swish(EV.verlIn + 0.05, 0.5, 1, -0.9, 0.5);
S.tick(EV.hover3, 3400, 0.5, 0.6);
S.click(EV.click3, 1, 0.6);
S.chime(EV.booked, [84, 91], 1, 0.4);
S.pour(EV.booked, EV.whipDown, E.outCubic, { from: 0, to: 0.18, gain: 0.6, pan: -0.3 });
S.word(EV.headBooked + 0.05, 'solid', -0.3, 0.8);

// ---- 5: back down, the leg fills, the drop
S.whoosh(sec(EV.whipDown) + WHIP_PEAK, { pre: 0.28, post: 0.45, lo: 5200, hi: 200, q: 0.9, gain: 0.75, panFrom: -0.3, panTo: 0.3 });
S.swirl(EV.whipDown + 0.2, 0.8, 0.8);
S.travel(EV.outRedraw, EV.outRedraw + 0.6, E.inOutCubic, 'full', -0.55, -0.55, 0.7);
[0, 0.2, 0.4, 0.6].forEach((o, i) => S.word(EV.words2 + o, i < 2 ? 'solid' : 'hollow', 0.25, 0.55));
S.pour(EV.fillFrom, EV.drop, E.inOutCubic, { from: 0.18, to: 1, gain: 0.8, pan: -0.45 });
S.riser(EV.fillFrom, EV.drop - 0.125, 0.55);
for (let i = 0; i < 4; i++) S.flap(EV.roll + i * 0.25 + 0.03, 1, 0.1 + i * 0.08);
S.impact(EV.drop, 1.45, 0);
S.shimmer(EV.drop + 0.1, 0.8);

// ---- 6: weeks ahead
// the row, as the picture lays it out (index.html: WEEK, WEEKS, revealBeat)
const WEEK_X = (i) => 140 + i * 148;
const WEEK_F = [1, 1, 0.32, 1.26, 1, 0.55];
const revealBeat = (i) => {
  const p = (WEEK_X(i) - 60) / 940;
  return EV.scanFrom + (Math.acos(1 - 2 * p) / Math.PI) * (EV.scanTo - EV.scanFrom);
};
const pourAt = (i) => EV.pourFrom + (i === 5 ? 0.15 : 0);
S.whoosh(sec(EV.planFrom) + 0.25, { pre: 0.25, post: 0.3, lo: 3200, hi: 600, gain: 0.55, panFrom: 0.2, panTo: -0.5 }); // the loop shrinks into this week
for (let i = 1; i < 6; i++) {
  const b = EV.weeksIn + i * 0.16;
  S.blip(b, 700 + i * 90, 0.4, xpan(WEEK_X(i)), 1.6);       // each week draws itself
  S.tick(b + 0.45, 2600, 0.3, xpan(WEEK_X(i)));             // and its terminal snaps on
}
S.word(EV.headWeeks, 'solid', -0.3, 0.32); S.word(EV.headWeeks + 0.25, 'solid', -0.3, 0.32);
S.scan(EV.scanFrom, EV.scanTo, 1);                         // the forecast runs across the row
S.word(EV.headKI, 'solid', -0.3, 0.32); S.word(EV.headKI + 0.25, 'solid', -0.3, 0.32);
for (let i = 1; i < 6; i++) {
  // each week answers as the light passes: a short pour up to its forecast
  const rv = revealBeat(i), f = Math.min(1, WEEK_F[i]);
  S.ping(rv, [76, 79, 72, 84, 79, 74][i], 0.45, xpan(WEEK_X(i)), 0.5);
  S.pour(rv, rv + 0.7, E.outCubic, { from: 0, to: f, gain: 0.3, pan: xpan(WEEK_X(i)) });
}
[2, 3, 5].forEach((i, k) => S.blip(EV.tags + k * 0.12, 1300 + k * 160, 0.55, xpan(WEEK_X(i))));
S.alert(EV.tags + 0.12, xpan(WEEK_X(3)));                  // more freight than trucks
// the tender: the card swings up, the tags fly into it
S.whoosh(sec(EV.tender) + 0.12, { pre: 0.15, post: 0.3, lo: 300, hi: 2600, gain: 0.7, panFrom: 0, panTo: 0 });
S.glass(EV.tender + 0.2, 0.9, 0, 0.85);
S.thunk(EV.tender + 0.45, 0.6, 0, 80);
[2, 3, 5].forEach((i, k) => S.send(EV.tender + 0.3 + i * 0.05, 0.6, xpan(WEEK_X(i)) * 0.6));
S.word(EV.headTender, 'solid', -0.3, 0.32); S.word(EV.headTender + 0.25, 'solid', -0.3, 0.32);
[0.15, 0.2, 0.25, 0.3, 0.4, 0.5].forEach((o, i) => S.blip(EV.tender + 0.35 + o, 900 + i * 110, 0.35, -0.2 + i * 0.08));
// the shipper: into the field, types the volume, sends it
S.swish(EV.verlIn3 + 0.05, 0.45, 1, 0.9, -0.1);
S.click(EV.field, 0.6, -0.2);
for (let i = 0; i < 11; i++) S.tick(EV.typeFrom + (i / 11) * (EV.typeTo - EV.typeFrom), 2800 + 300 * Math.sin(i * 2.3), 0.45, -0.25);
S.tick(EV.click6 - 0.35, 3400, 0.5, 0.2);
S.click(EV.click6, 1, 0.2);
S.chime(EV.click6 + 0.05, [84, 91], 0.9, 0.2);
for (const i of [2, 5]) {
  S.send(pourAt(i) - 0.45, 0.7, xpan(WEEK_X(i)) * 0.6);    // the volume flies up to its week
  S.pour(pourAt(i), EV.pourTo, E.inOutCubic, { from: WEEK_F[i], to: 1, gain: 0.6, pan: xpan(WEEK_X(i)) });
}
S.blip(EV.pourTo + 0.06, 1760, 0.5, xpan(WEEK_X(2))); S.blip(EV.pourTo + 0.1, 1980, 0.45, xpan(WEEK_X(5)));
// the carrier takes the excess
S.swish(EV.spedIn2 + 0.05, 0.4, 1, 0.9, 0.3);
S.tick(EV.click7 - 0.4, 3400, 0.5, 0.4);
S.click(EV.click7, 1, 0.4);
S.chime(EV.click7 + 0.05, [81, 88], 0.8, 0.4);
S.whoosh(sec(EV.takeFrom) + 0.3, { pre: 0.2, post: 0.15, lo: 900, hi: 3400, gain: 0.4, panFrom: xpan(WEEK_X(3)), panTo: 0.4 });
S.blip(EV.takeTo + 0.06, 1760, 0.5, xpan(WEEK_X(3)));
S.whoosh(sec(EV.cardAway) + 0.2, { pre: 0.2, post: 0.2, lo: 2500, hi: 300, gain: 0.5, panFrom: 0, panTo: 0 });
// all planned: a hit under the drop's, every week lighting up in turn
S.impact(EV.allFull, 1.1, 0);
S.shimmer(EV.allFull + 0.1, 0.7);
for (let i = 0; i < 6; i++) S.ping(EV.allFull + i * 0.05, [81, 84, 88, 91, 93, 96][i], 0.45, xpan(WEEK_X(i)), 0.6);
S.word(EV.allFull, 'solid', -0.3, 0.6); S.word(EV.allFull + 0.25, 'solid', -0.3, 0.5);
// the row folds back into the one big loop
S.swirl(EV.merge, 0.7, 0.6);
S.whoosh(sec(EV.merge + 0.5) + 0.25, { pre: 0.25, post: 0.3, lo: 500, hi: 3000, gain: 0.5, panFrom: -0.5, panTo: -0.3 });
S.blip(EV.labelsBack, 900, 0.35, -0.5); S.blip(EV.labelsBack + 0.1, 1100, 0.35, -0.5);

// ---- 7: the network
for (let i = 0; i < 4; i++) S.word(EV.collapse + i * 0.06, 'solid', 0.25, 0.25);
S.whoosh(sec(EV.collapse + 0.15) + 0.3, { pre: 0.3, post: 0.2, lo: 3000, hi: 400, panFrom: 0, panTo: -0.6, gain: 0.8 }); // rolling up
S.whoosh(sec(EV.hub) + 0.1, { pre: 0.15, post: 0.3, lo: 300, hi: 3000, panFrom: -0.6, panTo: 0, gain: 0.9 });     // flying in
S.glass(EV.hub + 0.25, 1, 0, 0.9);
S.thunk(EV.hub + 0.3, 0.7, 0, 60);
S.word(EV.headNet, 'solid', -0.3, 0.32); S.word(EV.headNet + 0.3, 'solid', -0.3, 0.32);
[[EV.partners[0], 81, -0.5], [EV.partners[1], 84, 0.5], [EV.partners[2], 88, 0]].forEach(([b, m, p]) => S.ping(b, m, 1, p));
for (let i = 0; i < 20; i++) {
  const a = (i * 18 + 9) * Math.PI / 180;
  S.tick(EV.marketDots + i * 0.025, 3000 + 600 * Math.sin(a), 0.35, Math.cos(a) * 0.8);
}
[0, 0.12, 0.24].forEach((o, i) => S.send(EV.request + o, 0.9, [-0.5, 0.5, 0][i]));
{
  // 24 hours: one tick per hour as the ring passes it, heavier every six
  for (let i = 0; i < 24; i++) {
    const tb = EV.sweepFrom + (i / 24) * (EV.sweepTo - EV.sweepFrom);
    const a = -Math.PI / 2 + (i / 24) * TAU;
    S.tick(tb, i % 6 === 0 ? 1400 : 2200, i % 6 === 0 ? 1.2 : 0.75, Math.cos(a) * 0.6);
    if (i % 6 === 0) S.thunk(tb, 0.25, Math.cos(a) * 0.4, 160);
  }
}
for (let b = 49; b <= 52; b++) S.ping(b, 93, 0.55, 0, 1.1);   // sonar: one ping a beat while the window runs
{
  // the radar hand: a breathy sweep that circles the stereo field once in 24 h
  const s0 = at(EV.sweepFrom), len = at(EV.sweepTo) - s0;
  const f = svf();
  for (let n = 0; n < len; n++) {
    const x = n / len, ang = -Math.PI / 2 + x * TAU;
    const env = Math.min(1, x * 12) * Math.min(1, (1 - x) * 12);
    put(sfx, s0 + n, f(noise(), 1800 + 900 * Math.sin(ang), 3).bp * env * 0.16, Math.cos(ang) * 0.8, sfxSend, 0.4);
  }
}
S.whoosh(sec(EV.headMarkt) + 0.05, { pre: 0.5, post: 0.6, lo: 300, hi: 6000, q: 0.7, gain: 0.6, panFrom: -0.4, panTo: 0.4 });
for (let i = 0; i < 20; i++) {
  const a = (i * 18 + 9) * Math.PI / 180;
  S.ping(EV.headMarkt + i * 0.03, [93, 91, 88, 86, 84][i % 5] - 12 * Math.floor(i / 10), 0.22, Math.cos(a) * 0.8, 0.3);
}
S.word(EV.headMarkt, 'solid', -0.3, 0.32); S.word(EV.headMarkt + 0.3, 'solid', -0.3, 0.32);
[[EV.offersBack, -0.5], [EV.offersBack + 0.2, 0], [EV.offersBack + 0.4, 0.5]].forEach(([b, p], i) => {
  S.whoosh(sec(b) + 0.2, { pre: 0.2, post: 0.08, lo: 800, hi: 3000, panFrom: p, panTo: 0, gain: 0.35 });
  S.blip(b + 0.55, 1400 + i * 200, 0.5, 0);
});
S.whoosh(sec(EV.offerCard) + 0.12, { pre: 0.12, post: 0.3, lo: 300, hi: 2600, gain: 0.8, panFrom: 0, panTo: 0 });
S.glass(EV.offerCard + 0.2, 1, 0, 0.8);
S.word(EV.headPartner, 'solid', -0.3, 0.32); S.word(EV.headPartner + 0.25, 'solid', -0.3, 0.32);
[54.6, 54.66, 54.7, 54.74, 54.8, 54.9].forEach((b, i) => S.blip(b, 900 + i * 110, 0.4, -0.2 + i * 0.08));
S.swish(EV.verlIn2 + 0.05, 0.4, 1, 0.9, 0.2);
S.click(EV.click4, 1, 0.2);
S.chime(EV.click4 + 0.05, [81, 88, 93], 1, 0.1);

// ---- 8: the brand
S.implode(EV.converge + 0.75, 0.6, 1);
S.impact(EV.wordmark, 0.8, 0);
S.shimmer(EV.wordmark, 1.1);
for (let i = 0; i < 10; i++) S.tick(EV.wordmark + i * 0.045 + 0.05, 2400 + i * 120, 0.35, -0.3 + i * 0.07);
S.word(EV.tagline, 'solid', 0, 0.35); S.word(EV.tagline + 0.15, 'solid', 0, 0.3);
S.glass(EV.cta, 0.8, 0, 1.2);
S.thunk(EV.cta, 0.5, 0, 110);
S.swish(EV.duIn + 0.05, 0.45, 0.9, 0.9, 0.1);
S.tick(EV.click5 - 0.45, 3400, 0.5, 0.1);
S.click(EV.click5, 1, 0.1);
S.chime(EV.click5 + 0.04, [88, 93], 0.8, 0.1);
S.whoosh(sec(EV.retract) + 0.15, { pre: 0.25, post: 0.1, lo: 4000, hi: 500, gain: 0.6, panFrom: 0.3, panTo: 0 });
S.thunk(EV.retract + 0.35, 0.5, 0, 120);
S.glide(EV.home, EV.home + 1.2, 440, 880, 0.9, 0, -0.6);
S.blip(EV.home + 1.25, 1760, 0.5, -0.6, 1);

// ============================================================ recorded layer

// Recorded effects (fetch-sfx.mjs), each placed so its loudest moment lands
// on its event. Loudness is matched first (the loudest 50 ms of every file is
// brought to the same level), so the gains below are a mix, not a repair.
const SAMPLES = {};
function sampleOf(id) {
  if (SAMPLES[id]) return SAMPLES[id];
  const path = `out/v2/sfx/${id}.f32`;
  if (!existsSync(path)) throw new Error(`missing ${path}: run node v2/fetch-sfx.mjs`);
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

// ---- 1: the loop
rec('deepWhooshImpact', bt(0.05), { gain: 0.9 });                 // the launch (its swell wraps to the film's end)
rec('staticPowerUp', bt(0.1), { gain: 0.35, pan: -0.4 });
rec('flyingSwoosh', bt(0.35), { gain: 0.6, pan: -0.5 });
for (const b of [EV.voll, EV.hin]) {
  rec('bassHit', bt(b), { gain: 0.8, align: 'start', pan: 0.2 });
  rec('zoomImpact', bt(b), { gain: 0.65, pan: 0.3, rate: b === EV.hin ? 0.94 : 1 });
}
rec('spaceImpact', bt(EV.arriveM), { gain: 1.0, align: 'start', pan: -0.4 });
rec('subHit', bt(EV.arriveM), { gain: 0.8, align: 'start' });
rec('zoomMove', bt(5.1), { gain: 0.45, pan: -0.3, rate: 0.9 });
for (const b of [EV.leer, EV.zurueck]) rec('buzzGlitch', bt(b) + 0.42, { gain: 0.55, pan: 0.3, rate: b === EV.leer ? 1 : 1.12 });
rec('wineClink', bt(EV.arriveH), { gain: 0.45, pan: -0.5 });

// ---- 2: the card
rec('fastWhoosh', bt(EV.morph + 0.3), { gain: 0.5, pan: 0.3 });
rec('inOutZoom', bt(EV.morph + 0.1), { gain: 0.45 });
rec('glassHit', bt(EV.morph + 0.35), { gain: 0.4, align: 'start' });
[[EV.cardTitle, 1], [EV.cardSub, 1.12], [EV.cardBtn, 0.9]].forEach(([b, r]) => rec('techSelect', bt(b), { gain: 0.45, rate: r, align: 'start', pan: -0.2 }));
rec('gammaWhoosh', bt(EV.scan + 0.3), { gain: 0.5, pan: 0 });
rec('optionSelect', bt(EV.tag), { gain: 0.5, align: 'start', pan: 0.3 });
for (const b of [EV.headA, EV.headB]) rec('fastBlow', bt(b), { gain: 0.5, pan: -0.3 });

// ---- 3: the offer
rec('smallSwoosh', bt(EV.spedIn + 0.15), { gain: 0.4, pan: 0.6 });
rec('selectClick', bt(EV.click1), { gain: 0.8, align: 'start', pan: -0.2 });
rec('clickTone', bt(EV.click1), { gain: 0.5, align: 'start', pan: -0.2 });
rec('metalSweep', bt(EV.unfold + 0.2), { gain: 0.45 });
rec('interfaceStart', bt(EV.unfold), { gain: 0.45, align: 'start' });
rec('fastBlow', bt(EV.headPrice), { gain: 0.45, pan: -0.3 });
rec('boxCheck', bt(EV.grab), { gain: 0.55, align: 'start', pan: -0.5 });
rec('boxCheck', bt(EV.release), { gain: 0.5, align: 'start', pan: 0.1, rate: 1.2 });
rec('selectClick', bt(EV.click2), { gain: 0.8, align: 'start', pan: 0.1 });
rec('openInterface', bt(EV.click2), { gain: 0.55, pan: 0.1 });
rec('bassHit', bt(EV.click2), { gain: 0.4, align: 'start' });

// ---- 4: the marketplace
rec('zoomOut', bt(EV.fold), { gain: 0.6, align: 'start' });
rec('futureSweep', sec(EV.whipUp) + 0.072, { gain: 0.45, pan: 0 });
rec('longHitSwoosh', sec(EV.whipUp) + 0.072, { gain: 0.4 });
rec('brightHit', bt(EV.land), { gain: 0.3, align: 'start' });
rec('bassHit', bt(EV.land), { gain: 0.35, align: 'start' });
rec('fastBlow', bt(EV.headMarket), { gain: 0.35, pan: -0.3 });
rec('smallSwoosh', bt(EV.verlIn + 0.15), { gain: 0.4, pan: -0.7 });
rec('selectClick', bt(EV.click3), { gain: 0.8, align: 'start', pan: 0.6 });
rec('positiveAlert', bt(EV.booked), { gain: 0.55, pan: 0.4 });
rec('liquidBubble', bt(EV.booked + 0.1), { gain: 0.45, pan: -0.3 });
rec('trailerRiser', bt(EV.drop - 0.12), { gain: 0.55, pre: 3 });                  // from the booking click to the drop
rec('fastBlow', bt(EV.headBooked + 0.05), { gain: 0.5, pan: -0.3 });

// ---- 5: back down, the leg fills, the drop
rec('laserSwoosh', sec(EV.whipDown) + 0.072, { gain: 0.6 });
rec('fastAirSweep', sec(EV.whipDown) + 0.1, { gain: 0.55 });
for (const b of [EV.words2, EV.words2 + 0.2]) { rec('bassHit', bt(b), { gain: 0.55, align: 'start' }); rec('zoomImpact', bt(b), { gain: 0.45 }); }
for (const b of [EV.words2 + 0.4, EV.words2 + 0.6]) rec('buzzGlitch', bt(b) + 0.42, { gain: 0.45, pan: 0.3 });
rec('deepBubbles', bt(EV.fillFrom), { gain: 0.5, align: 'start', pan: -0.4, len: bt(EV.drop) - bt(EV.fillFrom) });
for (let i = 0; i < 4; i++) rec('boxCheck', bt(EV.roll + i * 0.25 + 0.03), { gain: 0.35, align: 'start', pan: 0.1 + i * 0.08, rate: 1 + i * 0.06 });
rec('trailerImpact', bt(EV.drop), { gain: 1.6, pre: 1.0 });
rec('spaceImpact', bt(EV.drop), { gain: 0.85, align: 'start' });
rec('liquidBubble', bt(EV.drop + 0.05), { gain: 0.55, rate: 0.7, pan: -0.4 });
rec('soapBubble', bt(EV.drop + 0.15), { gain: 0.4, pan: -0.3 });
rec('sparkleWhoosh', bt(EV.drop + 0.6), { gain: 0.35, pan: 0.3 });

// ---- 6: weeks ahead
rec('zoomOut', bt(EV.planFrom), { gain: 0.5, align: 'start' });
for (let i = 1; i < 6; i++) rec('clickTone', bt(EV.weeksIn + i * 0.16 + 0.45), { gain: 0.3, align: 'start', rate: 1 + i * 0.06, pan: xpan(WEEK_X(i)) });
for (const b of [EV.headWeeks, EV.headWeeks + 0.25, EV.headKI, EV.headKI + 0.25, EV.headTender, EV.headTender + 0.25]) rec('fastBlow', bt(b), { gain: 0.4, pan: -0.3 });
rec('gammaWhoosh', bt(EV.scanFrom + 1.0), { gain: 0.4 });
rec('energyFlow', bt(EV.scanFrom + 0.9), { gain: 0.25 });
rec('optionSelect', bt(EV.tags), { gain: 0.45, align: 'start', pan: 0.2 });
rec('buzzGlitch', bt(EV.tags + 0.12) + 0.42, { gain: 0.35, pan: xpan(WEEK_X(3)) });
rec('interfaceStart', bt(EV.tender), { gain: 0.4, align: 'start' });
rec('metalSweep', bt(EV.tender + 0.15), { gain: 0.55 });
rec('glassHit', bt(EV.tender + 0.2), { gain: 0.3, align: 'start' });
rec('smallSwoosh', bt(EV.verlIn3 + 0.15), { gain: 0.4, pan: 0.6 });
rec('selectClick', bt(EV.field), { gain: 0.5, align: 'start', pan: -0.2 });
rec('selectClick', bt(EV.click6), { gain: 0.8, align: 'start', pan: 0.2 });
rec('positiveAlert', bt(EV.click6 + 0.05), { gain: 0.5, pan: 0.2 });
rec('deepBubbles', bt(EV.pourFrom), { gain: 0.4, align: 'start', pan: -0.3, len: bt(EV.pourTo) - bt(EV.pourFrom) });
rec('liquidBubble', bt(EV.pourFrom + 0.1), { gain: 0.45, pan: -0.3 });
rec('smallSwoosh', bt(EV.spedIn2 + 0.15), { gain: 0.35, pan: 0.7 });
rec('selectClick', bt(EV.click7), { gain: 0.8, align: 'start', pan: 0.4 });
rec('techAffirm', bt(EV.click7 + 0.05), { gain: 0.5, align: 'start', pan: 0.4 });
rec('flyingSwoosh', bt(EV.takeFrom + 0.4), { gain: 0.4, pan: 0.3 });
rec('windSwoosh', bt(EV.cardAway + 0.3), { gain: 0.4 });
// all planned: big, but under the drop (tier 2)
rec('epicImpact', bt(EV.allFull), { gain: 0.75, pre: 1.0 });
rec('subHit', bt(EV.allFull), { gain: 0.6, align: 'start' });
rec('sparkleWhoosh', bt(EV.allFull + 0.5), { gain: 0.3, pan: 0.3 });
rec('inOutZoom', bt(EV.merge + 0.5), { gain: 0.4 });

// ---- 7: the network
rec('windSwoosh', bt(EV.collapse + 0.5), { gain: 0.55, pan: -0.3 });
rec('zoomMove', bt(EV.hub + 0.15), { gain: 0.45, pan: -0.4 });
rec('glassHit', bt(EV.hub + 0.25), { gain: 0.35, align: 'start' });
rec('powerUp', bt(EV.hub + 0.2), { gain: 0.4, align: 'start' });
rec('passBy', bt(46.7), { gain: 0.5 });                           // the network swinging round
for (const b of [EV.headNet, EV.headNet + 0.3]) rec('fastBlow', bt(b), { gain: 0.45, pan: -0.3 });
EV.partners.forEach((b, i) => rec('clickTone', bt(b), { gain: 0.4, align: 'start', rate: [1, 1.12, 1.26][i], pan: [-0.5, 0.5, 0][i] }));
rec('gammaWhoosh', bt(EV.request + 0.3), { gain: 0.5 });
rec('epicImpact', bt(EV.headMarkt), { gain: 0.45, pre: 1.0 });
rec('energyFlow', bt(EV.headMarkt + 0.2), { gain: 0.4 });
for (const b of [EV.headMarkt, EV.headMarkt + 0.3]) rec('fastBlow', bt(b), { gain: 0.4, pan: -0.3 });
[0, 0.2, 0.4].forEach((o, i) => rec('smallSwoosh', bt(EV.offersBack + o + 0.3), { gain: 0.35, pan: [-0.5, 0, 0.5][i] }));
rec('metalSweep', bt(EV.offerCard + 0.15), { gain: 0.6 });
rec('glassHit', bt(EV.offerCard + 0.2), { gain: 0.3, align: 'start' });
for (const b of [EV.headPartner, EV.headPartner + 0.25]) rec('fastBlow', bt(b), { gain: 0.45, pan: -0.3 });
rec('selectClick', bt(EV.click4), { gain: 0.8, align: 'start', pan: 0.2 });
rec('techAffirm', bt(EV.click4 + 0.05), { gain: 0.5, align: 'start', pan: 0.1 });

// ---- 8: the brand
rec('spaceImpact', bt(EV.converge + 0.75), { gain: 0.7, reverse: true, pre: 1.6 });   // everything sucked into the dot
rec('logoImpact', bt(EV.wordmark), { gain: 0.9, pre: 1.3 });
rec('glitterShot', bt(EV.wordmark + 1.1), { gain: 0.35, pan: 0.2 });
rec('interfaceStart', bt(EV.cta), { gain: 0.45, align: 'start' });
rec('smallSwoosh', bt(EV.duIn + 0.15), { gain: 0.35, pan: 0.6 });
rec('selectClick', bt(EV.click5), { gain: 0.8, align: 'start', pan: 0.1 });
rec('bleepConfirm', bt(EV.click5 + 0.05), { gain: 0.45, pan: 0.1 });
rec('zoomInLong', bt(EV.retract + 0.3), { gain: 0.45 });
rec('fastWhoosh', bt(BEATS), { gain: 0.6, pan: -0.3, pre: 1.1 });           // flying into Hamburg: its peak is frame 0

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

mkdirSync('out/v2', { recursive: true });
writeWav('out/v2/music.wav', music);
writeWav('out/v2/sfx.wav', sfx);
