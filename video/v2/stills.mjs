// Stills straight from window.seek, without rendering video.
//
//   node v2/stills.mjs --beats 6.3,14.4 --tag k1          full-size PNGs + a sheet
//   node v2/stills.mjs --strip 8,10,10 --tag k1           10 frames from beat 8 to 10
//   node v2/stills.mjs --contact --tag r1                 one frame per beat
//
// Output in out/v2/. Page errors are printed, never swallowed.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { BEATS, BPM } from './cues.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('tag', 'k');
const beats = (arg('beats', '') || '').split(',').filter(Boolean).map(Number);
const strip = (arg('strip', '') || '').split(',').filter(Boolean).map(Number);
const contact = process.argv.includes('--contact');
const OUT = 'out/v2';
const FR = `${OUT}/frames-${TAG}`;
rmSync(FR, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${process.cwd()}/v2/index.html`);
await page.evaluate(() => window.ready);
const at = (b) => b * 60 / BPM;
const shoot = async (t, path) => { await page.evaluate((x) => window.seek(x), t); await page.locator('#c').screenshot({ path }); };
const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);

if (beats.length) {
  for (const [i, b] of beats.entries()) await shoot(at(b), `${OUT}/${TAG}-${i + 1}-b${b}.png`);
  const inputs = beats.flatMap((b, i) => ['-i', `${OUT}/${TAG}-${i + 1}-b${b}.png`]);
  if (beats.length === 1) ff([...inputs, '-vf', 'scale=540:-1', `${OUT}/${TAG}-sheet.png`]);
  else ff([...inputs, '-filter_complex', `${beats.map((_, i) => `[${i}]scale=540:-1[s${i}]`).join(';')};${beats.map((_, i) => `[s${i}]`).join('')}hstack=${beats.length}`, `${OUT}/${TAG}-sheet.png`]);
  console.log(`wrote ${OUT}/${TAG}-sheet.png`);
}
if (strip.length) {
  const [b0, b1, n = 10] = strip;
  for (let i = 0; i < n; i++) await shoot(at(b0 + (b1 - b0) * (i / (n - 1))), `${FR}/s${String(i).padStart(2, '0')}.png`);
  ff(['-framerate', '1', '-i', `${FR}/s%02d.png`, '-vf', `scale=216:-1,drawtext=text='%{eif\\:n\\:d}':x=6:y=6:fontsize=18:fontcolor=white,tile=${n}x1:padding=3`, '-frames:v', '1', `${OUT}/${TAG}-strip-${b0}-${b1}.png`]);
  console.log(`wrote ${OUT}/${TAG}-strip-${b0}-${b1}.png`);
}
if (contact) {
  for (let b = 0; b < BEATS; b++) await shoot(at(b + 0.45), `${FR}/b${String(b).padStart(2, '0')}.png`);
  ff(['-framerate', '1', '-i', `${FR}/b%02d.png`, '-vf', `scale=200:-1,drawtext=text='%{eif\\:n\\:d}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,tile=12x${Math.ceil(BEATS / 12)}:padding=3`, '-frames:v', '1', `${OUT}/${TAG}-contact.png`]);
  console.log(`wrote ${OUT}/${TAG}-contact.png`);
}
if (errors.length) console.log('PAGE ERRORS:\n  ' + errors.join('\n  '));
await browser.close();
