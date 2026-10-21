// Frames → ffmpeg for the film, with motion blur from sub-frames.
//
//   node render.mjs [--fps 60 --sub 4 --workers 3 --out out/silent.mp4]
//   node render.mjs --bench          time a few of the heaviest frames
//   node render.mjs --frames 400:460 --out out/patch.mp4   just those frames, to splice in
//   node render.mjs --w 1080 --h 1080 --out out/silent-1x1.mp4   another format (film.html reads ?w=&h=)
//
// Each output frame is the mean of `sub` sub-frames (ffmpeg tmix), so moving
// things blur by how far they travel in one frame. Frames are read straight
// from the canvas (toBlob): a page screenshot of the same canvas took ~1 s,
// four times longer. Workers render whole segments in parallel browsers;
// the segments are joined without re-encoding.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { BEATS, BPM } from './cues.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 60)), SUB = Number(arg('sub', 4)), WORKERS = Number(arg('workers', 3));
const DUR = Number(arg('dur', BEATS * 60 / BPM));
const OUT = arg('out', 'out/silent.mp4');
const FW = Number(arg('w', 1080)), FH = Number(arg('h', 1920));
mkdirSync('out/seg', { recursive: true });

async function openPage() {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: FW, height: FH }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${process.cwd()}/film.html?w=${FW}&h=${FH}`);
  // a film that throws never becomes ready: fail fast and say why instead of hanging
  const ready = await Promise.race([page.evaluate(() => window.ready).then(() => true), new Promise((r) => setTimeout(() => r(false), 20000))]);
  if (!ready) { console.error('film.html did not become ready:\n  ' + (errors.join('\n  ') || 'no page error reported')); process.exit(1); }
  const frame = async (t) => Buffer.from(await page.evaluate(async (x) => {
    window.seek(x);
    const blob = await new Promise((r) => document.getElementById('c').toBlob(r, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, t), 'base64');
  return { browser, frame, errors };
}

if (process.argv.includes('--bench')) {
  const { browser, frame } = await openPage();
  for (const b of [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => Math.round(f * BEATS * 10) / 10)) {
    const t0 = performance.now();
    for (let i = 0; i < 4; i++) await frame(b * 60 / BPM + i / 240);
    console.log(`beat ${String(b).padStart(5)}  ${((performance.now() - t0) / 4).toFixed(0)} ms/frame`);
  }
  await browser.close();
  process.exit(0);
}

const frames = Math.round(DUR * FPS);
// sub-frame k of frame f samples the interval leading up to the frame's time
const subTime = (f, k) => (f - (SUB - 1 - k) / SUB) / FPS;

async function segment(w, f0, f1) {
  const { browser, frame, errors } = await openPage();
  const out = `out/seg/seg${w}.mp4`;
  const vf = `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = performance.now();
  // one frame more than the segment keeps: the last frame of an encode comes
  // out wrong (a single-frame jump at every segment join), so it is rendered
  // and cut off below
  for (let f = f0; f <= f1; f++) {
    for (let k = 0; k < SUB; k++) {
      const png = await frame(Math.max(0, subTime(f, k)));
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if ((f - f0) % FPS === 0 && f > f0) {
      const done = (f - f0) / (f1 - f0), el = (performance.now() - t0) / 1000;
      console.log(`worker ${w}: ${Math.round(done * 100)} %, ~${Math.round(el / done - el)} s left`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-c', 'copy', '-frames:v', String(f1 - f0), out.replace('.mp4', '-cut.mp4')]);
  renameSync(out.replace('.mp4', '-cut.mp4'), out);
  await browser.close();
  if (errors.length) throw new Error(`worker ${w} page errors:\n  ${errors.join('\n  ')}`);
  return out;
}

if (arg('frames')) {
  const [f0, f1] = arg('frames').split(':').map(Number);
  const seg = await segment(0, f0, f1);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', seg, '-c', 'copy', OUT]);
  rmSync('out/seg', { recursive: true, force: true });
  console.log(`wrote ${OUT} (frames ${f0}–${f1 - 1})`);
  process.exit(0);
}

const per = Math.ceil(frames / WORKERS);
const segs = await Promise.all(Array.from({ length: WORKERS }, (_, w) => segment(w, w * per, Math.min(frames, (w + 1) * per))));
writeFileSync('out/seg/list.txt', segs.map((s) => `file '${s.replace('out/seg/', '')}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'out/seg/list.txt', '-c', 'copy', OUT]);
rmSync('out/seg', { recursive: true, force: true });
console.log(`wrote ${OUT} (${frames} frames at ${FPS} fps, ${SUB} sub-frames each)`);
