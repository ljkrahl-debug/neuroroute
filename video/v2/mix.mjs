// Mix score and effects for "Füllstand" to -14 LUFS and put them under the picture.
//
//   node v2/mix.mjs                                  -> out/v2/mix.wav
//   node v2/mix.mjs out/v2/silent.mp4 dist/v2.mp4    -> also mux
//
// The music ducks under the effects (a sidechain compressor keyed by them),
// so every hit cuts through without the score being turned down overall.
// Two-pass loudnorm: measure, then apply the measured values.
import { execFileSync } from 'node:child_process';

const [, , video, output] = process.argv;
const MIX = '[0:a]volume=0.62[m];[1:a]volume=1.0,asplit=2[k][s];' +
  '[m][k]sidechaincompress=threshold=0.06:ratio=3.5:attack=6:release=220:makeup=1[md];' +
  '[md][s]amix=inputs=2:normalize=0[a]';
const IN = ['-i', 'out/v2/music.wav', '-i', 'out/v2/sfx.wav'];
const sh = (cmd) => execFileSync('sh', ['-c', cmd], { encoding: 'utf8' });
const q = (a) => a.map((x) => `'${x.replace(/'/g, "'\\''")}'`).join(' ');

const report = sh(`ffmpeg -hide_banner ${q(IN)} -filter_complex ${q([`${MIX};[a]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[o]`])} -map '[o]' -f null - 2>&1`);
const m = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
const norm = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
  `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...IN, '-filter_complex', `${MIX};[a]${norm},alimiter=limit=0.84:attack=1:release=60:level=false,aresample=48000[o]`,
  '-map', '[o]', '-c:a', 'pcm_s16le', 'out/v2/mix.wav']);

const check = sh('ffmpeg -hide_banner -i out/v2/mix.wav -af ebur128=peak=true -f null - 2>&1 | tail -12');
console.log(`out/v2/mix.wav  integrated ${check.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]} LUFS, true peak ${check.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]} dBFS`);

if (video && output) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', 'out/v2/mix.wav', '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', output]);
  console.log(`wrote ${output}`);
}
