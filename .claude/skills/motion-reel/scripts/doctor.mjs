// Checks that this machine can render a film, and says how to fix what is missing.
//
//   node <skill>/scripts/doctor.mjs [film-folder]
//
// Needs: Node 18+, ffmpeg with libx264 and the filters the scripts use,
// Playwright with a Chromium it can launch (from the film folder), and —
// optional — internet access to mixkit.co for the recorded sound effects.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = resolve(process.argv[2] ?? '.');
const results = [];
const ok = (name, detail) => results.push(['ok  ', name, detail]);
const bad = (name, detail, fix) => results.push(['MISS', name, `${detail}\n        fix: ${fix}`]);
const warn = (name, detail) => results.push(['warn', name, detail]);

const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok('node', process.versions.node);
else bad('node', `${process.versions.node} is too old`, 'install Node 18 or newer');

try {
  const v = execFileSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' }).split('\n')[0];
  const filters = execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
  const encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const need = ['tmix', 'tblend', 'drawtext', 'tile', 'ebur128', 'loudnorm', 'sidechaincompress', 'alimiter'];
  const lacking = need.filter((f) => !new RegExp(`\\s${f}\\s`).test(filters));
  if (!/libx264/.test(encoders)) lacking.push('libx264 encoder');
  if (lacking.length) bad('ffmpeg', `${v} lacks ${lacking.join(', ')}`, 'install a full build (apt install ffmpeg, brew install ffmpeg, or a static build from johnvansickle.com)');
  else ok('ffmpeg', v);
} catch {
  bad('ffmpeg', 'not on PATH', 'apt install ffmpeg / brew install ffmpeg');
}

let playwright = null;
try {
  const req = createRequire(join(folder, 'package.json'));
  const mod = await import(pathToFileURL(req.resolve('playwright')).href);
  playwright = mod.chromium ? mod : mod.default;
  ok('playwright', 'installed in the film folder');
} catch {
  bad('playwright', `not installed in ${folder}`, `cd ${folder} && npm install`);
}
if (playwright) {
  try {
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    const fine = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      return typeof g.filter === 'string' && typeof c.toBlob === 'function';
    });
    await browser.close();
    if (fine) ok('chromium', 'launches, canvas filters and toBlob work');
    else bad('chromium', 'canvas filter or toBlob missing', 'use the Chromium Playwright installs (npx playwright install chromium)');
  } catch (e) {
    bad('chromium', String(e.message).split('\n')[0], `cd ${folder} && npx playwright install chromium   (or set PLAYWRIGHT_BROWSERS_PATH to an installed one)`);
  }
}

try {
  execFileSync('curl', ['-sS', '--fail', '--max-time', '10', '-o', '/dev/null', 'https://assets.mixkit.co/active_storage/sfx/1109/1109-preview.mp3'], { stdio: 'pipe' });
  ok('sound effects', 'mixkit.co reachable');
} catch {
  warn('sound effects', 'mixkit.co not reachable — the film still renders, with synthesized sound only (weaker impacts)');
}

for (const [s, name, detail] of results) console.log(`${s} ${name.padEnd(14)} ${detail}`);
const missing = results.filter(([s]) => s === 'MISS').length;
console.log(missing ? `\n${missing} thing(s) missing — fix them before rendering.` : '\nready to render.');
process.exit(missing ? 1 : 0);
