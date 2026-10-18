// Contact sheets straight from window.seek, without rendering video
// (house rules: "Render one frame per beat as a contact sheet and LOOK at it").
//
//   node stills.mjs [--w 1080 --h 1920] [--tag v1]
//
// Writes out/contact-<tag>.png (one frame per beat, taken just before the next
// beat so entrances have landed), out/phone-<tag>.png (the same at 360 px wide)
// and out/strip-<tag>-<beat>.png for any --strip beats (12 frames across one beat).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = Number(arg('w', 1080)), H = Number(arg('h', 1920)), TAG = arg('tag', 'v1');
const STRIPS = (arg('strip', '') || '').split(',').filter(Boolean).map(Number);
const BEATS = 40;

mkdirSync('out/frames', { recursive: true });
rmSync('out/frames', { recursive: true, force: true });
mkdirSync('out/frames', { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${process.cwd()}/index.html?w=${W}&h=${H}`);
await page.evaluate(() => window.ready);
const grid = await page.evaluate(() => window.GRID);
const at = (beat) => grid.offset + beat * grid.period;

async function frame(t, path) {
  await page.evaluate((x) => window.seek(x), t);
  await page.locator('#c').screenshot({ path });
}

for (let b = 0; b < BEATS; b++) {
  await frame(at(b + 0.45), `out/frames/b${String(b).padStart(2, '0')}.png`);
}
const cols = W > H ? 5 : 8;
const tileW = W > H ? 384 : 270;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', 'out/frames/b%02d.png',
  '-vf', `scale=${tileW}:-1,drawtext=text='%{eif\\:n\\:d}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${Math.ceil(BEATS / cols)}:padding=4:color=0x222222`,
  '-frames:v', '1', `out/contact-${TAG}.png`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', 'out/frames/b%02d.png',
  '-vf', `scale=360:-1,tile=8x5:padding=4`, '-frames:v', '1', `out/phone-${TAG}.png`]);
console.log(`wrote out/contact-${TAG}.png and out/phone-${TAG}.png`);

for (const beat of STRIPS) {
  for (let i = 0; i < 12; i++) {
    await frame(at(beat - 0.1) + i * (grid.period / 10), `out/frames/s${String(i).padStart(2, '0')}.png`);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', 'out/frames/s%02d.png',
    '-vf', `scale=${W > H ? 320 : 220}:-1,tile=12x1:padding=3`, '-frames:v', '1', `out/strip-${TAG}-${beat}.png`]);
  console.log(`wrote out/strip-${TAG}-${beat}.png`);
}

if (errors.length) console.log('PAGE ERRORS:\n  ' + errors.join('\n  '));
await browser.close();
