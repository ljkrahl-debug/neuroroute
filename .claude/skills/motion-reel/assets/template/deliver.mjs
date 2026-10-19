// Everything, start to finish, with the checks that decide whether it ships.
//
//   node deliver.mjs                 sound, picture, mux, review files, checks
//   node deliver.mjs --skip-render   reuse out/silent.mp4
//   node deliver.mjs --name launch   output dist/launch-9x16.mp4 (default: folder name)
//   node deliver.mjs --w 1080 --h 1080   another format → dist/<name>-1x1.mp4
//
// Checks printed at the end:
//   pops      frames whose change from the previous frame is 3x their
//             neighbours' — single-frame jumps a contact sheet cannot show
//   seam      first vs last frame (should be ~0 if the film loops)
//   loudness  momentary loudness every 0.5 s, and where the loudest moment is
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright';
import { BPM, BEATS, EV } from './cues.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const NAME = arg('name', basename(process.cwd()));
const skipRender = process.argv.includes('--skip-render');
const FW = Number(arg('w', 1080)), FH = Number(arg('h', 1920));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const FORMAT = `${FW / gcd(FW, FH)}x${FH / gcd(FW, FH)}`;
const SILENT = FORMAT === '9x16' ? 'out/silent.mp4' : `out/silent-${FORMAT}.mp4`;
const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit' });
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const sh = (cmd) => execFileSync('sh', ['-c', cmd], { encoding: 'utf8', maxBuffer: 1 << 26 });
mkdirSync('dist', { recursive: true });

run('node', ['fetch-sfx.mjs']);
run('node', ['audio.mjs']);
if (!skipRender || !existsSync(SILENT)) run('node', ['render.mjs', '--w', String(FW), '--h', String(FH), '--out', SILENT]);
const FILM = `dist/${NAME}-${FORMAT}.mp4`;
const REVIEW = FORMAT === '9x16' ? `dist/${NAME}` : `dist/${NAME}-${FORMAT}`;
run('node', ['mix.mjs', SILENT, FILM]);

// review files: 2 fps contact sheet, 1 fps at phone size, a strip over the first whip, a poster
const beat = (b) => b * 60 / BPM;
const SECS = beat(BEATS);
const stripAt = EV.whip ?? EV.whipUp ?? BEATS / 3;
const posterAt = EV.poster ?? (EV.cta != null ? EV.cta + 1.2 : BEATS * 0.8);
ff(['-i', FILM, '-vf', `fps=2,scale=216:-1,tile=8x${Math.ceil(SECS * 2 / 8)}:padding=3`, '-frames:v', '1', `${REVIEW}-contact.png`]);
ff(['-i', FILM, '-vf', `fps=1,scale=360:-1,tile=6x${Math.ceil(SECS / 6)}:padding=4`, '-frames:v', '1', `${REVIEW}-phone.png`]);
ff(['-ss', String(Math.max(0, beat(stripAt) - 0.1)), '-i', FILM, '-vf', 'fps=30,scale=216:-1,tile=10x1:padding=3', '-frames:v', '1', `${REVIEW}-strip.png`]);
{
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: FW, height: FH } });
  await page.goto(`file://${process.cwd()}/film.html?w=${FW}&h=${FH}`);
  await page.evaluate(() => window.ready);
  await page.evaluate((t) => window.seek(t), beat(posterAt));
  await page.locator('#c').screenshot({ path: `${REVIEW}-poster.png` });
  await browser.close();
}

// pops
const d = sh(`ffmpeg -hide_banner -i ${SILENT} -vf "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 | grep -o "YAVG=[0-9.]*"`)
  .trim().split('\n').map((l) => Number(l.slice(5)));
const pops = [];
for (let i = 3; i < d.length - 3; i++) {
  const around = (d[i - 3] + d[i - 2] + d[i - 1] + d[i + 1] + d[i + 2] + d[i + 3]) / 6;
  if (d[i] > 1.5 && d[i] > 3 * around) pops.push(`frame ${i + 1} (${((i + 1) / 60).toFixed(2)} s, beat ${((i + 1) / 60 / (60 / BPM)).toFixed(2)}): ${d[i].toFixed(1)} vs ${around.toFixed(1)}`);
}

// seam: mean absolute difference between the first and the last frame, 0–255
const gray = (sel) => execFileSync('ffmpeg', ['-v', 'error', '-i', SILENT, '-vf', `select=${sel},format=gray,scale=270:-1`, '-vframes', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
const nFrames = d.length + 1;
const f0 = gray('eq(n\\,0)'), f1 = gray(`eq(n\\,${nFrames - 1})`);
let seam = 0;
for (let i = 0; i < f0.length; i++) seam += Math.abs(f0[i] - f1[i]);
seam /= f0.length;

// loudness
const mom = sh(`ffmpeg -hide_banner -i out/mix.wav -af ebur128=metadata=1,ametadata=print:key=lavfi.r128.M -f null - 2>&1 | grep -o "lavfi.r128.M=[-0-9.]*"`)
  .trim().split('\n').map((l) => Number(l.split('=')[1]));
const steps = mom.filter((_, i) => (i + 1) % 5 === 0).map((v, i) => [((i + 1) * 0.5).toFixed(1), v]);
const loudest = steps.reduce((a, b) => (b[1] > a[1] ? b : a));
const total = sh('ffmpeg -hide_banner -i out/mix.wav -af ebur128=peak=true -f null - 2>&1 | tail -12');

console.log('\n================ checks');
console.log(pops.length ? `pops:\n  ${pops.join('\n  ')}` : 'pops: none');
console.log(`seam: ${seam.toFixed(3)} (first vs last frame; ~0 means it loops cleanly)`);
console.log(`loudness: integrated ${total.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]} LUFS, true peak ${total.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]} dBFS`);
console.log(`loudest moment: ${loudest[0]} s (beat ${(loudest[0] / (60 / BPM)).toFixed(1)}) at ${loudest[1]} LUFS — is that the payoff?`);
console.log('momentary, every 0.5 s:\n  ' + steps.map(([s, v]) => `${s}s ${v.toFixed(1)}`).join(' | '));
console.log(`\nwrote ${FILM} and ${REVIEW}-{contact,phone,strip,poster}.png`);
