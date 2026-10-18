// node render.mjs --fps 60 --dur 15 --sub 4 [--w 1080 --h 1920 --out out/silent.mp4]
// From the guide, plus --w/--h/--out so one timeline renders every format.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 60)), DUR = Number(arg('dur', 15)), SUB = Number(arg('sub', 4));
const W = Number(arg('w', 1080)), H = Number(arg('h', 1920)), OUT = arg('out', 'out/silent.mp4');
mkdirSync('out', { recursive: true });

// index.html loads its modules, fonts and JSON from disk, which Chromium only
// allows over file:// with this flag
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files'],
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`file://${process.cwd()}/index.html?w=${W}&h=${H}`);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.ready);

const vf = `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`;
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', OUT],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round(DUR * FPS * SUB);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.seek(t), i / (FPS * SUB));
  const png = await page.locator('#c').screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
