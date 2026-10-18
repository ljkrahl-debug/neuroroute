// Renders every format and the review files the guide asks for (Steps 4 and 9).
//
//   node deliver.mjs                 all formats
//   node deliver.mjs 9x16            just one
//   node deliver.mjs --skip-render   re-mux and re-check from existing renders
//
// Output in dist/: one MP4 per format with the -14 LUFS mix, plus poster.png,
// contact.png, strip.png, phone.png and loop_check.mp4 from the 9:16 cut.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const FORMATS = {
  '9x16': [1080, 1920],
  '1x1': [1080, 1080],
  '16x9': [1920, 1080],
};
const args = process.argv.slice(2);
const only = args.filter((a) => FORMATS[a]);
const skipRender = args.includes('--skip-render');
const formats = only.length ? only : Object.keys(FORMATS);

mkdirSync('dist', { recursive: true });
const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit' });

// sound first: synthesize, measure the beat grid, mix to -14 LUFS
run('node', ['audio.mjs']);
execFileSync('sh', ['-c', 'python3.13 beats.py out/music.wav > beats.json || python3 beats.py out/music.wav > beats.json']);
run('node', ['mix.mjs']);

for (const f of formats) {
  const [w, h] = FORMATS[f];
  const silent = `out/silent-${f}.mp4`;
  if (!skipRender || !existsSync(silent)) {
    console.log(`\n== rendering ${f} (${w}x${h})`);
    run('node', ['render.mjs', '--fps', '60', '--dur', '20', '--sub', '4', '--w', String(w), '--h', String(h), '--out', silent]);
  }
  run('node', ['mix.mjs', silent, `dist/neuroroute-launch-${f}.mp4`]);
}

// review files from the vertical cut — the commands from Step 9
const main = 'dist/neuroroute-launch-9x16.mp4';
if (existsSync(main)) {
  const ff = (a) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
  ff(['-i', main, '-vf', 'fps=2,scale=270:-1,tile=6x7', '-frames:v', '1', 'dist/contact.png']);
  ff(['-ss', '6.9', '-i', main, '-vf', 'fps=20,scale=320:-1,tile=12x1', '-frames:v', '1', 'dist/strip.png']);
  ff(['-i', main, '-vf', 'fps=1,scale=360:-1,tile=5x4', '-frames:v', '1', 'dist/phone.png']);
  ff(['-stream_loop', '1', '-i', main, '-c', 'copy', 'dist/loop_check.mp4']);

  // poster: the end card, painted directly at full resolution
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${process.cwd()}/index.html?w=1080&h=1920`);
  await page.evaluate(() => window.ready);
  await page.evaluate(() => window.seek(window.GRID.offset + 38.5 * window.GRID.period));
  await page.locator('#c').screenshot({ path: 'dist/poster.png' });
  await browser.close();
  console.log('wrote dist/contact.png, strip.png, phone.png, loop_check.mp4, poster.png');
}
