// Everything for "Füllstand", start to finish.
//
//   node v2/deliver.mjs                 sound, picture, mux, review files, pop scan
//   node v2/deliver.mjs --skip-render   reuse out/v2/silent.mp4
//
// Output in dist/: neuroroute-fuellstand-9x16.mp4 plus fuellstand-contact.png,
// -strip.png, -phone.png and -poster.png. The pop scan lists any frame whose
// change from the previous frame is three times that of its neighbours — the
// single-frame jumps a contact sheet cannot show.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { BPM, EV } from './cues.mjs';

const skipRender = process.argv.includes('--skip-render');
const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit' });
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
mkdirSync('dist', { recursive: true });

run('node', ['v2/audio.mjs']);
if (!skipRender || !existsSync('out/v2/silent.mp4')) run('node', ['v2/render.mjs']);
const FILM = 'dist/neuroroute-fuellstand-9x16.mp4';
run('node', ['v2/mix.mjs', 'out/v2/silent.mp4', FILM]);

// review files
ff(['-i', FILM, '-vf', 'fps=2,scale=216:-1,tile=8x6:padding=3', '-frames:v', '1', 'dist/fuellstand-contact.png']);
ff(['-ss', String(EV.whipUp * 60 / BPM - 0.1), '-i', FILM, '-vf', 'fps=30,scale=216:-1,tile=10x1:padding=3', '-frames:v', '1', 'dist/fuellstand-strip.png']);
ff(['-i', FILM, '-vf', 'fps=1,scale=360:-1,tile=6x4:padding=4', '-frames:v', '1', 'dist/fuellstand-phone.png']);
{
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${process.cwd()}/v2/index.html`);
  await page.evaluate(() => window.ready);
  await page.evaluate((t) => window.seek(t), (EV.cta + 1.2) * 60 / BPM);
  await page.locator('#c').screenshot({ path: 'dist/fuellstand-poster.png' });
  await browser.close();
}

// pop scan: mean luma difference between consecutive frames
const log = execFileSync('sh', ['-c',
  `ffmpeg -hide_banner -i out/v2/silent.mp4 -vf "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 | grep -o "YAVG=[0-9.]*"`],
  { encoding: 'utf8', maxBuffer: 1 << 26 });
const d = log.trim().split('\n').map((l) => Number(l.slice(5)));
const pops = [];
for (let i = 3; i < d.length - 3; i++) {
  const around = (d[i - 3] + d[i - 2] + d[i - 1] + d[i + 1] + d[i + 2] + d[i + 3]) / 6;
  if (d[i] > 1.5 && d[i] > 3 * around) pops.push(`frame ${i + 1} (${((i + 1) / 60).toFixed(2)} s, beat ${((i + 1) / 60 / (60 / BPM)).toFixed(2)}): ${d[i].toFixed(1)} vs ${around.toFixed(1)}`);
}
console.log(pops.length ? `POPS:\n  ${pops.join('\n  ')}` : 'pop scan: no single-frame jumps');
console.log(`wrote ${FILM} and dist/fuellstand-{contact,strip,phone,poster}.png`);
