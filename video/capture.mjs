// Films the real product for the launch video. Every UI moment in the film is
// a crop of one of these screenshots — nothing is redrawn from imagination.
//
//   node capture.mjs
//
// It clicks through the actual flow in website/app.html, the same way a user
// would: carrier spots the empty run → "Rückfahrt anbieten" → fills in the real
// modal → publishes → shipper books it → accepts the partner's offer. Phone
// layout, used by every format. Next to each screenshot it records where
// panels, rows, buttons and toasts are, so the film crops exact rectangles.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = 'file://' + resolve('../website/app.html');

const fontCss = `
@font-face{font-family:'Bebas Neue';src:url(data:font/woff2;base64,${readFileSync('fonts/BebasNeue.woff2').toString('base64')}) format('woff2');}
@font-face{font-family:'Outfit';font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync('fonts/Outfit.woff2').toString('base64')}) format('woff2');}`;

const SETS = {
  // phone layout, used by every format of the film. Tall enough that the
  // capacity page fits without scrolling, so fixed overlays (modal, toast) land
  // where they really are. 4x density so the camera can frame a single button
  // and still never scale text up.
  m: { viewport: { width: 430, height: 1100 }, dpr: 4 },
};

const layout = {};
mkdirSync('assets', { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

for (const [set, opts] of Object.entries(SETS)) {
  // a fresh context means fresh localStorage, so the prototype starts from its seed data
  const ctx = await browser.newContext({ viewport: opts.viewport, deviceScaleFactor: opts.dpr, reducedMotion: 'reduce' });
  await ctx.route('**://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: fontCss }));
  await ctx.route('**://fonts.gstatic.com/**', (r) => r.abort());

  async function snap(page, name) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `assets/${set}-${name}.png` });
    layout[`${set}-${name}`] = await page.evaluate((dpr) => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * dpr));
      };
      const list = (sel) => [...document.querySelectorAll(sel)]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => ({ box: box(el), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) }));
      return {
        size: [innerWidth * dpr, innerHeight * dpr],
        main: list('#main'),
        stats: list('#main .stat'),
        panels: list('#main .panel'),
        rows: list('#main .row'),
        buttons: list('button'),
        inputs: list('.modal input'),
        modal: list('.modal'),
        offers: list('.modal .offer'),
        toast: list('.toast'),
      };
    }, opts.dpr);
    console.log(`captured ${set}-${name}`);
  }

  async function toastGone(page) {
    await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 })
      .catch(() => page.evaluate(() => document.querySelector('.toast')?.remove()));
  }

  async function open(hash, pageId) {
    const page = await ctx.newPage();
    await page.goto(`${APP}#${hash}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.evaluate((p) => window.goPage(p), pageId);
    return page;
  }

  // carrier: capacity planner with the detected empty run
  const carrier = await open('anbieter', 'capacity');
  await snap(carrier, 'capacity');

  // click the real "Rückfahrt anbieten" and fill in the real modal
  await carrier.getByRole('button', { name: 'Rückfahrt anbieten' }).first().click();
  await snap(carrier, 'modal-empty');
  await carrier.fill('#mk_old', '1700');
  await carrier.fill('#mk_disc', '30');
  await carrier.fill('#mk_cap', '6 Container');
  await snap(carrier, 'modal-filled');

  // publish: the prototype closes the modal, toasts and opens the marketplace
  await carrier.getByRole('button', { name: /Auf Marktplatz veröffentlichen/ }).click();
  await snap(carrier, 'published');
  // the same screen once the toast has gone, so the film can spring the toast
  // in on the beat instead of having it there from the first frame
  await toastGone(carrier);
  await snap(carrier, 'published-clean');
  await carrier.close();

  // shipper: the new listing is on the marketplace; book it
  const shipper = await open('abnehmer', 'marketplace');
  await snap(shipper, 'market');
  await shipper.getByRole('button', { name: 'Buchen' }).first().click();
  await snap(shipper, 'booked');
  // let the booking toast run out before moving on, so it is not in the next shot
  await toastGone(shipper);
  await shipper.evaluate(() => window.goPage('partners'));
  await snap(shipper, 'partners');

  // own network first: the offers on an open request, partner marked and on top
  await shipper.evaluate(() => window.goPage('myrequests'));
  await shipper.waitForTimeout(300);
  await shipper.getByRole('button', { name: 'Angebote' }).first().click();
  await snap(shipper, 'offers');
  await shipper.getByRole('button', { name: 'Annehmen' }).first().click();
  await snap(shipper, 'accepted');
  await toastGone(shipper);
  await snap(shipper, 'accepted-clean');
  await shipper.close();

  await ctx.close();
}

writeFileSync('assets/layout.json', JSON.stringify(layout, null, 1));
await browser.close();
