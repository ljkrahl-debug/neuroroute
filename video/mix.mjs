// Mix music + effects to -14 LUFS and put them under the picture.
//
//   node mix.mjs                         -> out/mix.wav
//   node mix.mjs out/silent.mp4 out/final.mp4   -> also mux
//
// Two-pass loudnorm: the first pass measures, the second applies the measured
// values, which hits the target far more precisely than a single pass.
import { execFileSync } from 'node:child_process';

const [, , video, output] = process.argv;
const MIX = '[0:a]volume=0.85[m];[1:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0[a]';

function ff(args) {
  return execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let measure;
try {
  ff(['-i', 'out/music.wav', '-i', 'out/sfx.wav', '-filter_complex',
    `${MIX};[a]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-']);
} catch (err) {
  measure = err.stderr;
}
// ffmpeg writes the loudnorm report to stderr and still exits 0, so read both
measure = measure ?? '';
if (!measure.includes('input_i')) {
  measure = execFileSync('sh', ['-c',
    `ffmpeg -hide_banner -i out/music.wav -i out/sfx.wav -filter_complex "${MIX};[a]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[o]" -map "[o]" -f null - 2>&1`],
    { encoding: 'utf8' });
}
const m = JSON.parse(measure.slice(measure.lastIndexOf('{'), measure.lastIndexOf('}') + 1));

const norm = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
  `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ff(['-i', 'out/music.wav', '-i', 'out/sfx.wav', '-filter_complex', `${MIX};[a]${norm},aresample=48000[o]`,
  '-map', '[o]', '-c:a', 'pcm_s16le', 'out/mix.wav']);

const check = execFileSync('sh', ['-c', 'ffmpeg -hide_banner -i out/mix.wav -af ebur128=peak=true -f null - 2>&1 | tail -12'], { encoding: 'utf8' });
const lufs = check.match(/I:\s+(-?[\d.]+) LUFS/)?.[1];
const peak = check.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1];
console.log(`out/mix.wav  integrated ${lufs} LUFS, true peak ${peak} dBFS`);

if (video && output) {
  ff(['-i', video, '-i', 'out/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', output]);
  console.log(`wrote ${output}`);
}
