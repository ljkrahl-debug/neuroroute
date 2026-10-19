// Start a new film from the template.
//
//   node <skill>/scripts/new-film.mjs <target-folder> [--no-install]
//
// Copies assets/template (film.html, cues.mjs, audio.mjs, render/stills/mix/
// deliver scripts, fonts, lib) into the target folder, installs Playwright
// and checks the machine (doctor.mjs) unless --no-install, and prints the
// next steps. Refuses to overwrite a
// folder that already has a film.html.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target) {
  console.error('usage: node new-film.mjs <target-folder> [--no-install]');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const template = resolve(here, '..', 'assets', 'template');
const dest = resolve(target);
if (existsSync(join(dest, 'film.html'))) {
  console.error(`${dest} already has a film.html — pick another folder`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(template, dest, { recursive: true });
console.log(`template copied to ${dest}`);

if (!process.argv.includes('--no-install')) {
  try {
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dest, stdio: 'inherit' });
  } catch {
    console.log('npm install failed — run it yourself in the folder (Playwright with Chromium is needed)');
  }
  // what is missing on this machine, and how to fix it
  try { execFileSync('node', [join(here, 'doctor.mjs'), dest], { stdio: 'inherit' }); } catch { /* doctor printed the fixes */ }
}

console.log(`
next:
  cd ${target}
  node stills.mjs --contact --tag demo     # the demo film, one frame per beat → out/demo-contact.png
  node fetch-sfx.mjs                       # recorded sound effects (not stored in git)
  node deliver.mjs --name demo             # full render + sound + checks (≈ 1 min per second of film)
then replace BRAND, the layout and SCENES in film.html, and EV/SHOTS/CAMERA in cues.mjs.`);
