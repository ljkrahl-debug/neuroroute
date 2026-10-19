# Sound — the half of the film people feel

## Contents
1. What "mitreißend" means in practice
2. The arrangement recipe
3. Instruments (music track)
4. Synthesized effects (`S`)
5. Recorded effects (`rec`) and the catalogue
6. Levels in tiers
7. Mixing and the loudness checks
8. A supplied track
9. Licences

---

## 1. What "mitreißend" means in practice

The verdict on Füllstand's first, synth-only version: the sound did not carry
you. What fixed it:

- **Weight on the big moments**: recorded impacts (trailer hits, sub drops,
  logo hits) layered under the synth, with a braam and an 808 on the drop.
- **A build you feel**: riser, snare roll accelerating, the chord sitting on the
  dominant — then a 1/16 of silence right before the drop.
- **The picture plays the sound**: a line zips with its own speed, an empty word
  knocks hollow, liquid rises in pitch as it fills, a slider clicks once per
  step, the whip's whoosh peaks at the camera's fastest frame.
- **Contrast**: the payoff is the loudest moment of the film, and the bar before
  it is clearly quieter. Measure it; do not trust the ear on laptop speakers.

## 2. The arrangement recipe

At 120 BPM (one beat = 0.5 s), shape the score on the film's chapters:

| Part | Typical beats (48-beat film) | Content |
|---|---|---|
| Intro / hook | 0–8 | heartbeat kick on every beat, pad, a plucked figure that "mickey-mouses" the hero object |
| Groove | 8–20 | kick + offbeat hats + bass on the chord root; chords pumping (`pump: true`) |
| Build | the 2–4 beats before the drop | the dominant chord (E in A minor), snare roll 1/8 → 1/16, riser, reverse crash, gains climbing |
| Rest | the last 1/16 before the drop | silence in the music; only the effect swell |
| Drop / payoff | on a downbeat at ~50–60 % | tonic chord, braam, 808, crash, recorded trailer impact, loudest moment |
| Second groove | after the drop | sparser variation; can slow to half-time |
| Logo | last quarter | a ringing chord (add9), shimmer, logo impact, then calm so the loop restarts cleanly |

`chordAt(b)` maps beats to chords; `CH` holds voicings, `ROOT` the bass roots.
Write the arrangement as plain loops over beats (see the demo section in
`audio.mjs`).

## 3. Instruments (music track)

All synthesized, all seeded (`mulberry32`), placed in beats:

| Function | Sound |
|---|---|
| `kick(beat, gain)` | punchy sine kick with click |
| `clap`, `snare`, `hat(beat, open, gain, pan)` | percussion; `snare` for rolls |
| `crash(beat, gain, reverse, len)` | cymbal; `reverse: true` swells *into* a beat |
| `bassNote(beat, len, midi, gain, bright)` | filtered saw bass |
| `chord(beat, len, notes, gain, {cutoff, pump, attack})` | supersaw chord; `pump` ducks it on the beat |
| `pad(beat, len, notes, gain)` | soft background pad |
| `pluck(beat, midi, pan, gain, decay)` | plucked lead; melodic figures |
| `breath(beat, len, midi, pan, gain)` | airy, hollow tone |
| `braam(beat, lenSec, notes, gain)` | big detuned brass-like hit for the drop and logo |
| `bass808(beat, len, midi, gain)` | pitch-dropping saturated sub under the payoff |

`svf()` is a Chamberlin state-variable filter (lp/bp/hp). Keep its frequency
below the stability bound the template enforces — at high cutoff with low Q it
blows up to Infinity and the WAV is silent or clipped.

## 4. Synthesized effects (`S`)

Each takes beats (except `whoosh`, which takes the absolute second of its peak)
and lands on an `EV` event:

| Effect | Use |
|---|---|
| `S.travel(b0, b1, ease, 'full'/'hollow', panFrom, panTo)` | something travelling: loudness and pitch follow its speed (pass the same easing as the picture) |
| `S.word(beat, 'solid'/'hollow')` | a word landing: heavy thock / knock on an empty container |
| `S.impact(beat, gain, pan)` | synthetic impact |
| `S.whoosh(peakSec, {pre, post, lo, hi, q, panFrom, panTo})` | whips and fast moves; peak = fastest frame |
| `S.swirl(beat, dur)` | something turning or lying down |
| `S.glass(beat)` | glass materialising |
| `S.blip`, `S.tick`, `S.click`, `S.thunk` | UI: blips, ticks per step, clicks, soft landings |
| `S.scan(b0, b1)` | something being analysed |
| `S.alert(beat)` | a warning tag |
| `S.swish(beat)` | a cursor gliding in |
| `S.pour(b0, b1, ease, {from, to})` | liquid filling; pitch rises with the level |
| `S.flap(beat)` | a split-flap letter (`rollText`) |
| `S.chime(beat, notes)` | success |
| `S.ping(beat, midi)` | nodes lighting up |
| `S.send(beat)` | something sent outwards |
| `S.riser(b0, b1)` | build into the drop |
| `S.implode(beatEnd)` | everything sucked into one point |
| `S.shimmer(beat)` | the logo |
| `S.glide(b0, b1, hz0, hz1)` | a soft travel home (the loop) |

Pan by screen position (`xpan(x)`): a sound on the left of the frame is on the
left of the mix.

## 5. Recorded effects (`rec`) and the catalogue

`rec(name, atSec, {gain, pan, rate, reverse, align, len, send, pre, wrap})`
places a recorded effect so that its **loudest 50 ms lands on `atSec`**
(`align: 'start'` for one-shots whose attack is the event). Every file is
loudness-matched first, so gains are a mix decision, not a repair.

- `pre` (default 0.7 s) cuts the swell before the peak and fades it in, so a
  long whoosh cannot spill over the event before it. Raise it (1.0–1.3) for the
  payoff so its swell builds.
- `rate < 1` plays lower and longer (heavier); `reverse` turns a hit into a
  swell that peaks at `atSec`; `len` trims.
- `wrap` (default): anything running past the start or end wraps round — a swell
  before frame 0 is heard at the end, so the loop is seamless.
- Missing files (no internet) are skipped with a warning; the synth layer then
  carries the film alone.

Catalogue (`fetch-sfx.mjs`), measured: duration, where the peak is, the
character (spectral centroid: low < 900 Hz, mid, bright > 3500 Hz):

| Name | ID | Dur s | Peak at s | Character | Good for |
|---|---|---|---|---|---|
| trailerImpact | 2908 | 4.9 | 1.01 | low, huge, long tail | **the payoff / drop** |
| logoImpact | 2902 | 6.0 | 1.25 | low-mid, ringing | the logo |
| epicImpact | 2901 | 5.1 | 1.43 | mid, cinematic | second biggest hit |
| spaceImpact | 774 | 5.0 | 0.08 | low boom, instant | an impact on contact (`align: 'start'`) |
| deepWhooshImpact | 1143 | 4.1 | 0.55 | very low whoosh-boom | the film's launch, frame 0 |
| subHit | 2299 | 1.1 | 0.09 | pure sub | under any big hit |
| bassHit | 2303 | 2.8 | 0.22 | low punch | words slamming |
| zoomImpact | 772 | 1.2 | 0.51 | mid, zooming | slam / camera punch |
| fastBlow | 2655 | 1.3 | 0.16 | low-mid air hit | quick hits |
| brightHit | 2180 | 2.0 | 0.15 | bright, quiet | sparkly accent |
| trailerRiser | 790 | 2.6 | 2.52 | rising, peak at the end | into the drop (peak on the drop) |
| fastWhoosh | 1492 | 1.3 | 1.09 | bright | fast moves, flying home |
| laserSwoosh | 1467 | 1.4 | 0.34 | mid | panels swinging in |
| longHitSwoosh | 1473 | 1.0 | 0.19 | mid, punchy | whip with a hit |
| flyingSwoosh | 1469 | 1.6 | 0.52 | bright | something flying past |
| windSwoosh | 1468 | 1.3 | 0.31 | mid, airy | soft moves |
| fastAirSweep | 168 | 0.9 | 0.33 | mid | small transitions |
| smallSwoosh | 3115 | 0.6 | 0.12 | bright, small | UI moves |
| futureSweep | 2634 | 2.3 | 1.72 | mid, synthetic | camera whips |
| metalSweep | 2636 | 1.0 | 0.33 | mid, metallic | hard transitions |
| gammaWhoosh | 2614 | 1.5 | 0.96 | bright | sci-fi moves |
| zoomMove | 2626 | 2.2 | 0.62 | mid | zooms |
| passBy | 169 | 3.1 | 0.80 | mid | long pass |
| inOutZoom | 2622 | 1.3 | 0.19 | bright | zoom in/out |
| zoomOut / zoomInLong | 2619 / 2621 | 1.2 | 0.34 / 0.27 | very bright, quiet | subtle zooms |
| selectClick | 1109 | 1.1 | 0.08 | mid, solid | **the** click |
| clickTone | 2568 | 0.2 | 0.02 | bright, tiny | small UI clicks |
| techSelect | 3124 | 0.5 | 0.01 | bright | selections |
| optionSelect | 2573 | 1.6 | 0.14 | mid | toggles |
| interfaceStart | 2574 | 2.4 | 0.15 | low-mid | CTA appearing |
| openInterface | 2578 | 1.1 | 0.21 | mid | a panel opening |
| boxCheck | 1120 | 0.2 | 0.12 | low, tiny | checkmarks |
| bleepConfirm | 2520 | 0.6 | 0.20 | bright | confirmations |
| techAffirm | 3116 | 2.1 | 0.08 | bright, quiet | soft confirmations |
| positiveAlert | 3218 | 2.0 | 0.23 | bright | success |
| glassHit | 677 | 4.7 | 0.07 | mid, ringing | glass appearing |
| wineClink | 2936 | 1.2 | 0.02 | bright | a clink |
| liquidBubble / deepBubbles / soapBubble | 3000 / 1321 / 2925 | 1–6 | ~0.1 | low–mid | liquid, filling |
| buzzGlitch | 2594 | 1.0 | 0.13 | very bright | neon flicker, glitch |
| powerUp / staticPowerUp | 2602 / 2600 | 5.0 / 2.8 | 0.26 / 0.70 | bright | charging, switching on |
| energyFlow | 2589 | 7.4 | 1.71 | mid-bright | energy running round an outline |
| sparkleWhoosh / glitterShot | 2350 / 2353 | 3.5 / 4.8 | 0.45 / 1.01 | very bright | logo sparkle |

To add an effect: find it on mixkit.co/free-sound-effects, take the number from
its preview URL, add `name: id` to `SFX_IDS`, run `node fetch-sfx.mjs`. Listen
to it in context, not alone.

## 6. Levels in tiers

Decide the tier of every sound before setting gains, then keep the tiers apart:

1. **Payoff** (drop, logo): recorded trailer/logo impact at 1.0–1.2 + braam +
   808 + crash. The loudest moment of the film.
2. **Big hits** (first slam, line end, whips): 0.6–1.0.
3. **Transitions** (swishes, swirls, glass, panel moves): 0.4–0.6.
4. **UI** (clicks, ticks, blips, chimes): 0.3–0.8 but short; they must be
   heard, not felt.

Thin out clusters: four sounds landing within 100 ms read as one mush and
push the loudness meter up where the picture is not the climax.

## 7. Mixing and the loudness checks

`mix.mjs`: music is ducked by the effects (sidechain compressor, threshold 0.1,
ratio 2.5, 8 ms attack, 200 ms release), both summed, then two-pass `loudnorm`
to −14 LUFS integrated, true peak −1 dB, and an `alimiter`. `audio.mjs` writes
the stems with a soft saturator (`tanh`) and a 30 ms edge fade so the loop
restart never clicks.

`deliver.mjs` prints momentary loudness every 0.5 s and the loudest moment.
Read it: the loudest moment must be the payoff; the second before it should be
3+ LU quieter. If the build is louder than the drop, lower the build (snare
roll, riser, recorded swells) rather than pushing the drop into the limiter.

## 8. A supplied track

If the user gives a song: decode it to 48 kHz stereo float, put it in the
`music` track instead of the arrangement, measure its beat grid (librosa beat
tracking, then a least-squares fit for BPM and offset) and set `BPM` and an
offset in `cues.mjs` so `EV` beats land on the music. Cut the length to whole
bars; find the drop in the song and put the payoff there. Keep the effects
layer — it is what makes the picture feel physical. The user must own or have
licensed the song.

## 9. Licences

Mixkit sound effects: free for commercial and personal use, no attribution,
but the files may not be redistributed on their own. Hence they are downloaded
by ID and never committed or attached; only the finished film contains them.
The template fonts (Bebas Neue, Outfit) are under the SIL Open Font License;
their licence files sit next to them.
