// Lays a supplied track out on the film's beats, as its music.
//
//   TRACK=uzan node v2/track.mjs <audio file>   -> out/v2/uzan/music.wav
//
// The film is written in beats and plays at the track's tempo (cues.mjs), so
// laying the track out is copying whole beats: each entry of the track's plan
// [filmFrom, filmTo, trackFrom] copies the track's beats from trackFrom on to
// film beats filmFrom..filmTo. Cuts sit a few ms before the beat, so a kick
// is never cut into, with short fades; a cut before frame 0 wraps to the end
// (the film loops). The track itself is never stored in the repository: it
// belongs to its creator, so it is passed in (and kept in out/, which git
// ignores) — see README.md for where it came from.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BPM, BEATS, OUTDIR, TRACK, TRACKS } from './cues.mjs';

if (!TRACK) { console.error('set TRACK=<id> (one of: ' + Object.keys(TRACKS).join(', ') + ')'); process.exit(1); }
const src = process.argv[2];
if (!src || !existsSync(src)) { console.error(`usage: TRACK=${TRACK} node v2/track.mjs <audio file>`); process.exit(1); }
mkdirSync(OUTDIR, { recursive: true });
const keep = `${OUTDIR}/track-source${src.slice(src.lastIndexOf('.'))}`;
if (resolve(src) !== resolve(keep)) copyFileSync(src, keep);

const SR = 48000;
const { t0, plan } = TRACKS[TRACK];
const P = 60 / BPM;                       // one beat, s
const N = Math.round(BEATS * P * SR);     // the film, in samples
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', keep, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 4));
const n = f.length / 2;

const L = new Float32Array(N), R = new Float32Array(N);
const PRE = Math.round(0.012 * SR);       // cut this far before the beat
const FADE = Math.round(0.006 * SR);
for (const [b0, b1, s0] of plan) {
  const dst0 = Math.round(b0 * P * SR) - PRE, len = Math.round((b1 - b0) * P * SR);
  const src0 = Math.round((t0 + s0 * P) * SR) - PRE;
  for (let k = 0; k < len + FADE; k++) {
    const si = src0 + k;
    if (si < 0 || si >= n) continue;
    // fade in over FADE, fade out over the FADE after the segment's end:
    // neighbouring segments overlap there and cross over
    const g = Math.min(1, k / FADE, (len + FADE - k) / FADE);
    const di = (((dst0 + k) % N) + N) % N;
    L[di] += f[2 * si] * g; R[di] += f[2 * si + 1] * g;
  }
}

let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const g = peak > 0.98 ? 0.98 / peak : 1;
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
writeFileSync(`${OUTDIR}/music.wav`, buf);
console.log(`wrote ${OUTDIR}/music.wav (${(N / SR).toFixed(2)} s at ${BPM} BPM, from ${plan.length} pieces of the track)`);
