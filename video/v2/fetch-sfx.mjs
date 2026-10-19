// Downloads the recorded sound effects "Füllstand" layers over its synthesized
// sounds, and decodes them for audio.mjs.
//
//   node v2/fetch-sfx.mjs        -> out/v2/sfx/<id>.mp3 and <id>.f32 (48 kHz stereo float)
//
// Source: Mixkit (mixkit.co), Sound Effects Free License — free to use in
// commercial and personal projects, no attribution required, but the files
// may not be redistributed on their own. That is why they are fetched here
// instead of being committed: the repository holds only their IDs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';

export const SFX_IDS = {
  // impacts
  spaceImpact: 774, trailerImpact: 2908, epicImpact: 2901, logoImpact: 2902, deepWhooshImpact: 1143,
  bassHit: 2303, subHit: 2299, zoomImpact: 772, fastBlow: 2655, brightHit: 2180,
  // risers and whooshes
  trailerRiser: 790, fastWhoosh: 1492, laserSwoosh: 1467, longHitSwoosh: 1473, flyingSwoosh: 1469,
  windSwoosh: 1468, fastAirSweep: 168, smallSwoosh: 3115, futureSweep: 2634, metalSweep: 2636,
  gammaWhoosh: 2614, zoomMove: 2626, passBy: 169, inOutZoom: 2622, zoomOut: 2619, zoomInLong: 2621,
  // interface
  selectClick: 1109, clickTone: 2568, techSelect: 3124, optionSelect: 2573, interfaceStart: 2574,
  openInterface: 2578, boxCheck: 1120, bleepConfirm: 2520, techAffirm: 3116, positiveAlert: 3218,
  // material
  glassHit: 677, wineClink: 2936, liquidBubble: 3000, deepBubbles: 1321, soapBubble: 2925,
  buzzGlitch: 2594, powerUp: 2602, staticPowerUp: 2600, energyFlow: 2589, sparkleWhoosh: 2350, glitterShot: 2353,
};

const DIR = 'out/v2/sfx';
mkdirSync(DIR, { recursive: true });

if (process.argv[1] && process.argv[1].endsWith('fetch-sfx.mjs')) {
  let fetched = 0;
  for (const id of new Set(Object.values(SFX_IDS))) {
    const mp3 = `${DIR}/${id}.mp3`, f32 = `${DIR}/${id}.f32`;
    if (!existsSync(mp3) || statSync(mp3).size < 1000) {
      execFileSync('curl', ['-sS', '--fail', '--max-time', '30', '-o', mp3, `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`]);
      fetched++;
    }
    if (!existsSync(f32)) {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp3, '-ac', '2', '-ar', '48000', '-f', 'f32le', f32]);
    }
  }
  console.log(`sound effects ready in ${DIR} (${fetched} downloaded)`);
}
