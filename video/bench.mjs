// How long one frame takes, split into painting and capturing — run before a
// full render to know whether it is minutes or hours.
//   node bench.mjs [--w 1080 --h 1920]
import { chromium } from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const W = Number(arg('w', 1080)), H = Number(arg('h', 1920));

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(`file://${process.cwd()}/index.html?w=${W}&h=${H}`);
await page.evaluate(() => window.ready);

const samples = [1, 5, 9.5, 13.5, 17.5, 21.5, 25.5, 29, 34];
let seekMs = 0, shotMs = 0;
for (const s of samples) {
  const a = Date.now();
  await page.evaluate((t) => window.seek(t), s);
  const b = Date.now();
  await page.locator('#c').screenshot({ type: 'png' });
  shotMs += Date.now() - b;
  seekMs += b - a;
}
const per = (seekMs + shotMs) / samples.length;
console.log(`${W}x${H}: seek ${Math.round(seekMs / samples.length)} ms + capture ${Math.round(shotMs / samples.length)} ms = ${Math.round(per)} ms/frame`);
console.log(`full render at 60 fps x 4 sub (4800 frames): ~${Math.round(per * 4800 / 60000)} min`);
await browser.close();
