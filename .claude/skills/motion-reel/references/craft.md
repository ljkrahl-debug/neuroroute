# Craft — building the picture

## Contents
1. The render contract
2. Time, springs and the shared timeline
3. One world, one camera
4. Transformations: how scenes become each other
5. Type
6. Glass, panels and UI
7. The effects toolkit (reference)
8. Layout, formats and safe zones
9. Lessons that cost a re-render

---

## 1. The render contract

`film.html` defines `window.seek(t)`: it clears the canvas and paints frame *t*
from nothing. Nothing may depend on the frame painted before: no state carried
between frames, no `Math.random` (use `hash(n)`, seeded), no timers, no CSS
transitions, no `requestAnimationFrame` in render mode. That is what makes
parallel rendering, `--frames a:b` patches, stills at any beat and the loop
possible. `window.ready` resolves once the fonts are loaded; the scripts wait
for it and fail fast (with the page error) if it never comes.

`seek` order: `background(t)` → the shot's scene function → `finish()` (grain,
vignette) → `postFX(t)` (shockwaves, colour split) → `speedLines(t)` →
`cameraSmear(t)`.

## 2. Time, springs and the shared timeline

- Everything is in **beats** (`B(beat)` → seconds). `EV` in `cues.mjs` names
  every event the picture and the sound share; both files import it, so a
  transformation and its hit can never drift apart. Change a beat in one place.
- `sp(t, beat, [k, d])` is a closed-form damped spring starting at `beat`,
  0 → 1. Presets: `TYPE = [600, 49]` (no overshoot — type must not wobble),
  `POP = [320, 24]` (UI, a hair of overshoot), `SNAP = [480, 38]`.
  Lower damping = more bounce; higher stiffness = faster.
- `tr(t, keys)` is a value with several targets, one spring per change, summed:
  `[[beat, value, k?, d?], ...]`. The camera uses it; use it for anything that
  moves more than once.
- `ramp(t, b0, b1)` is linear 0 → 1 between two beats; pass it through `E.*`
  easings for scripted moves (a line drawing itself: `E.outQuad`).
- `hit(t, beat, decay, attack)` is a one-shot envelope for flashes and kicks:
  up in 35 ms (never in one frame), then exponential decay.
- `pulse(t, beat)` is a short dip around a beat — a button squashing on a click.

Speed reads as quality: big moves 0.25–0.5 s, type 0.15–0.3 s, nothing linear
except things that *are* linear (a progress bar, a clock hand).

## 3. One world, one camera

All scenes live in one world (world units = pixels at scale 1). `CAMERA` in
`cues.mjs` gives `cx`, `cy` and `s` as `tr` keys; `SHAKES` adds decaying shakes
on impacts. Draw world things after `worldT()`, screen things after `screenT()`;
`toScreen(x, y)` converts.

- **A place change is a whip**: put the next scene 2000+ px away and spring the
  camera there fast (`k ≈ 190, d ≈ 27`). `cameraSmear` averages the frame along
  the travel direction with a 180° shutter, `speedLines` streak, `postFX` adds
  colour split by speed. The whip's sound peaks at its fastest moment
  (`WHIP_PEAK ≈ 0.07 s` after the key for that spring).
- **Push in** slowly (`s` 1 → 1.03–1.13 over a few beats) under calm scenes so
  nothing is ever static. Never scale bitmaps above 1 — everything here is
  vector, so the camera can zoom freely.
- **Lead the action**: when something moves, let the camera move with it,
  leading by ~250 px, so the motion has somewhere to go.
- The camera ends where it starts, so the film loops.

## 4. Transformations: how scenes become each other

The difference between a template and a film is that nothing appears from
nowhere. Before building a scene, write down *what it is made of from the
previous one*. Patterns that worked:

| From → to | How |
|---|---|
| line → card | the card starts zero-wide and line-long on the line's position and springs to its rect; the line fades as the card widens (template demo) |
| loop → route | the shape lies down (scale y → 0.3, rotate) and becomes the route drawn inside a card |
| button → panel | the button's rect springs to the panel's rect; the label leaves upward, the panel content rises in |
| panel → listing | the panel folds (height spring) to a row while the camera whips to where the row belongs |
| listing → big shape | the row's mini icon grows (scale spring) until it is the hero object again |
| station / node → "you" | a label rolls (`rollText`) from a place name to the viewer's role |
| everything → dot → logo | all elements spring to one point (implode), the dot pulses, the name slides out of it behind a mask |
| logo → first frame | the dot flies back to where the film starts — the loop |

Rules: one dominant motion at a time; a new element enters *from* something
(a point, an edge, another element) and leaves *into* something; scene
functions overlap by drawing what is still in frame until a whip takes it away.

## 5. Type

- Display font for headlines (2–3 words, huge: 150–260 px on 1080 wide), UI font
  for interface text. Use `fitSize(text, width, max)` to fill a column.
- `rise(t, text, x, y, {beat, size, out, stroke, glow, smear})`: type rising out
  of its own slot — a mask, never a fade — and leaving upward at `out`. The exit
  lifts by ascent + descent + 0.3·size, or a sliver stays in the slot.
- `slamWord`: a full word landing — 1.45× → 1×, blurred by its speed, white
  flash on the letters. For loaded / solid / the answer.
- `neonWord`: an empty word tracing its outline like a neon tube, flickering,
  then holding. For empty / missing / the problem.
- `fillBelow(text, …, level, …, wave)`: hollow type filling up from below with a
  sloshing surface — the payoff of an empty → full story.
- `rollText(t, from, to, …)`: split-flap, letter by letter, every quarter beat.
- `odometer(value, …)`: rolling digits with carries; the value is a pure
  function of time. Its digit span must stay 1, or the resting value shows
  half-rolled.
- Headline language matches the audience (German film → German words). No
  sentences on screen longer than ~6 words; nobody reads them in a reel.

## 6. Glass, panels and UI

- `glass(x, y, w, h, r, {blur, tint, rim, magnify, fill, alpha, shadow})`:
  frosted glass over what is already drawn — blurred, brightened, slightly
  magnified copy of the pixels behind, sheen and rim light. Draw the background
  scene first, then the glass, then the content.
- `panel3D(drawFn, rect, tilt)`: draws `drawFn` flat into a layer and lays it
  back strip by strip with perspective. Spring `tilt` from ~0.6 rad to 0 for a
  swing-in; glass inside still frosts the real frame (via `glassSrc`).
- `withDepth(fn, {blur, dim, scale})`: depth of field — what sits behind a
  focused panel gets blurred and dimmed.
- `button`, `pill`, `cursor`: UI drawn in code, so it can morph. The cursor is a
  named multiplayer cursor ("Du", a company name): it leans into its motion,
  grows on hover, dips and ripples on every click. Keys are `[beat, [x, y]]`.
- Show real product behaviour. If the product has a repo or a prototype, check
  how a feature works before animating it, and take names and numbers from its
  demo data. No invented statistics.

## 7. The effects toolkit (reference)

| Function | Use | Notes |
|---|---|---|
| `shockwave(sx, sy, r, width, strength)` | impacts, clicks, drop, logo | lens ring through the finished frame; list them in `SHOCKS()` with `at` in world coords, `r0 → r1` over `dur` |
| `rgbSplit(px, dir)` | hardest hits, whips | `SPLITS = [[beat, px]]`; whips add it automatically by camera speed; 5–9 px max |
| `flash(x, y, color, alpha, radius)` | the moment of contact | drive alpha with `hit()` |
| `comet(x, y, color, size)` | the head of anything travelling | white core, coloured bloom |
| `sparks(t, pos, from, to, color, {life, speed, count})` | trail off a moving head | born per frame from a seeded hash — deterministic |
| `burst(t, x, y, beat)` | a ring where something lands | small, quick |
| `splash(t, x, y, beat, color)` | liquid overflowing | droplets under gravity |
| `energyOutline(x, y, w, h, r, p, color)` | success: a pulse runs round the frame | p 0 → 1 over ~0.7 beat |
| `outlineSweep(…)` | an outline drawing itself | hollow = free / empty |
| `panel3D`, `glass`, `withDepth` | panels | see above |
| `cameraSmear`, `speedLines` | whips | automatic from camera speed |
| `SHAKES` (cues.mjs) | impacts | `[beat, px]`, 5–12 px |

Dose: the effect sells the *event*. Big effects on the 4–6 biggest moments,
small ones on interactions, none on calm explanation beats. If everything
shakes, nothing does.

## 8. Layout, formats and safe zones

- Master: 1080×1920 (9:16). `film.html?w=1080&h=1080` (1:1) or `?w=1920&h=1080`
  (16:9) resize the canvas; scene layouts must then read `W`/`H` (or have a
  per-format layout table). Re-check stills for every format.
- TikTok / Reels / Shorts overlay buttons on the right (~140 px) and the
  caption at the bottom (~340 px); keep text and key action out of there. The
  top ~120 px holds the status bar / "Following" tabs.
- Readability: look at the phone sheet (360 px wide). UI text below ~28 px on
  1080 is decoration, not information.
- Colour: `bg`, `ink`, one `accent`; `good` and `warn` only when they mean
  something (payoff / problem). A grain layer dithers dark gradients so H.264
  does not band them.

## 9. Lessons that cost a re-render

- A mask-rise exit must lift past ascent + descent, or letters leave a sliver.
- Split-flap rolls: travel ascent + 0.45·size, stop drawing the old letter at
  p ≥ 0.97, or a sliver flickers.
- When many things converge into one dot, hide the source at ~96 % so there is
  never a double dot.
- A wordmark built letter by letter jumbles; slide it out rigidly from the dot.
- The loop seam: draw the home state with the same screen-space sizes as
  frame 0 (the camera scale may differ) and check the seam number.
- The opening must not be empty: start close (camera s ≈ 1.1) with motion on
  frame 0.
- A layer drawn into an offscreen canvas loses the frame behind it — that is
  what `glassSrc` is for; keep it when writing new 3D layers.
- `fetch()` fails on `file://`; import data as modules
  (`import x from './x.json' with { type: 'json' }`).
- Large images: decode one at a time into `ImageBitmap`s; parallel decodes of
  big PNGs stall Chromium.
- Read frames with `canvas.toBlob` (the template does): page screenshots of a
  filtered canvas are ~4× slower.
- `pkill -f <script>` also kills the shell that runs it; wait on PIDs.
