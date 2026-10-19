// Frames → ffmpeg for "Füllstand", with motion blur from sub-frames.
//
//   node v2/render.mjs [--fps 60 --sub 4 --workers 3 --out out/v2/silent.mp4]
//   node v2/render.mjs --bench          time a few of the heaviest frames
//
// Each output frame is the mean of `sub` sub-frames (ffmpeg tmix), so moving
// things blur by how far they travel in one frame. Frames are read straight
// from the canvas (toBlob): a page screenshot of the same canvas took ~1 s,
// four times longer. Workers render whole segments in parallel browsers;
// the segments are joined without re-encoding.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { BEATS, BPM } from './cues.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 60)), SUB = Number(arg('sub', 4)), WORKERS = Number(arg('workers', 3));
const DUR = Number(arg('dur', BEATS * 60 / BPM));
const OUT = arg('out', 'out/v2/silent.mp4');
mkdirSync('out/v2/seg', { recursive: true });

async function openPage() {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${process.cwd()}/v2/index.html`);
  await page.evaluate(() => window.ready);
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
  for (const b of [6, 10, 14.5, 16.1, 18, 24.5, 30, 35, 40]) {
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
  const out = `out/v2/seg/seg${w}.mp4`;
  const vf = `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = performance.now();
  for (let f = f0; f < f1; f++) {
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
  await browser.close();
  if (errors.length) throw new Error(`worker ${w} page errors:\n  ${errors.join('\n  ')}`);
  return out;
}

const per = Math.ceil(frames / WORKERS);
const segs = await Promise.all(Array.from({ length: WORKERS }, (_, w) => segment(w, w * per, Math.min(frames, (w + 1) * per))));
writeFileSync('out/v2/seg/list.txt', segs.map((s) => `file '${s.replace('out/v2/seg/', '')}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'out/v2/seg/list.txt', '-c', 'copy', OUT]);
rmSync('out/v2/seg', { recursive: true, force: true });
console.log(`wrote ${OUT} (${frames} frames at ${FPS} fps, ${SUB} sub-frames each)`);
