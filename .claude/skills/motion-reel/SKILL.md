---
name: motion-reel
description: >-
  Make premium motion-design videos drawn entirely in code: launch films, product
  videos, TikTok / Instagram Reels / YouTube Shorts ads, app promos, animated
  explainers, logo reveals, showreels. The result is a dynamic 9:16 MP4 (1:1 and
  16:9 too) with a punchy synthesized soundtrack, recorded impact effects and a
  seamless loop, at the level of top motion-design reels. Use this skill whenever
  the user wants any kind of video, clip, reel, animation, promo, trailer, intro or
  "Werbevideo", "Launch-Video", "Produktvideo", "Erklärvideo", "TikTok-Video",
  "Reel", "Animation", "Motion Design", "Clip für Instagram" — even when they don't
  say "motion" and even when it is only a short teaser. Also use it to revise or
  extend a film made with it ("mehr Effekte", "Sound geiler", "langweilig am Anfang").
---

# Motion reel

You make a film that is a pure function of time: `film.html` paints frame *t*
when `window.seek(t)` is called, `audio.mjs` writes the soundtrack from the same
timeline, and a few scripts render, mix and check it. Everything is code, so
every frame can be inspected, every hit lands on its frame, and a fix is an edit,
not a re-shoot.

The bar is "Füllstand", the film this skill was distilled from — the user's
favourite result so far (see `references/example-fuellstand.md`): one hero object that becomes every scene,
no cuts, an effect on every interaction, sound that pulls you along, a payoff
that is the loudest moment, and a loop you cannot see. A template film that
already does all of this ships with the skill. You start from it, so the first
render already has the camera, glass, type, effects, sound engine and checks,
and your time goes into the idea.

Talk to the user in their language and tone (casual German gets casual German
back), short and concrete. Code comments and file names stay English.

## The bar — what every film must have

- **One hero object, one rule.** Find a single object the whole film is made of
  (a line, a dot, a card, a ring) and a visual rule the viewer learns in two
  seconds (Füllstand: *filled = loaded, hollow = empty*, for lines, type and UI
  alike). Every scene grows out of the previous one: the line lies down and
  becomes a route, the button grows into a panel, everything flows into the dot
  that becomes the logo. No cuts, no crossfades, no "next slide".
- **Hook in the first second.** Motion and a hit on frame 0, a big word by
  beat 1. Never a slow fade-up.
- **Something new every 2–4 seconds**, and every interaction gets an effect:
  impacts shake and send a shockwave, clicks ripple, panels swing in in 3D,
  whips smear the whole frame, full words slam, empty words trace like neon.
- **Sound that drives.** Music arranged in chapters (heartbeat intro, groove,
  build, a 1/16 of silence, drop), synthesized effects following the motion,
  recorded impacts on the big moments. The payoff must be the loudest moment
  and its build quieter.
- **True and on brand.** Real product behaviour and real numbers only; never
  invent statistics or customers. One display font, one UI font, one accent;
  extra colours only when they carry meaning.
- **Loops seamlessly.** The last frame is the first; the sound wraps too.
- **Readable on a phone.** Check at 360 px wide. Keep text out of the right
  ~140 px and the bottom ~340 px (TikTok/Reels buttons and caption).

Banned, because they read as template: centered title on a gradient, everything
fading in, crossfades, corner labels and frame borders, glow on UI chrome,
generic particle bursts, static holds over ~1.5 s, stock-photo looks, emojis as
icons. No `Math.random`, no timers, no CSS transitions: a frame must not depend
on the frame before it.

## Workflow

Keep the user in the loop at two points (concept + keyframes, and the finished
film). Otherwise decide yourself and keep going; ask only for things you
cannot know (product facts, claim, CTA, the real numbers).

### 1. Brief

Collect, from the conversation, files and the product's website or repo first:

| Input | Default if not given |
|---|---|
| Product, what it does in one sentence, the one story to show | ask |
| Brand name, claim, CTA + URL | ask for claim/CTA, propose one |
| Colours, fonts (woff2), logo | from the site / repo; template defaults otherwise |
| Length | 20–24 s (40–48 beats at 120 BPM) |
| Format | 9:16 1080×1920; 1:1 and 16:9 on request |
| On-screen language | the user's language |
| References (TikTok/Reels links, videos, stills) | none — use the bar above |
| Music | synthesized; a supplied track replaces `music` in audio.mjs |

If the product has a repo, read it before claiming any feature works a certain
way, and follow any motion rules it already has (for example a
`video/CLAUDE.md`). Write the brief into `notes/brief.md` in the film folder.

### 2. Set up

```bash
node <skill-dir>/scripts/new-film.mjs <film-folder>   # copies the template, npm install, checks the machine
cd <film-folder> && node stills.mjs --contact --tag demo   # see what the template does
```

`<skill-dir>` is the folder this SKILL.md is in. `new-film.mjs` ends by running
`scripts/doctor.mjs`, which checks Node 18+, ffmpeg (libx264 and the filters
used), Playwright's Chromium and the sound-effect download, and prints the fix
for anything missing. Fix it, or tell the user exactly what is missing — never
pretend a render happened. Without internet the film still works with
synthesized sound only (say so: the impacts are weaker).

Put the brand into `film.html` (`BRAND`: name, claim, url, colours, fonts) and
copy the brand fonts over `fonts/Display.woff2` and `fonts/UI.woff2` (keep
their licences next to them).

### 3. References

If the user gives reference videos, look at them before designing: download
(for TikTok `yt-dlp --impersonate chrome` works), tile frames at 2 fps with
ffmpeg (`fps=2,scale=240:-1,tile=8x6`) and look at the sheets. Write down the
principles, not the content: how scenes connect, camera language, type
treatment, speed and rhythm, where the effects sit, how the sound is cut. If you
cannot open a reference, say so plainly; never describe a video you did not see.

### 4. Concept, beat map, keyframes — show before you build

1. **Concept**: hero object, the rule, 4–7 chapters, the payoff, how it loops.
   Propose one strong idea (two at most), not a menu.
2. **Beat map**: a table — beat, seconds, what happens, how it becomes the next
   thing. At 120 BPM a beat is 0.5 s; chapters of 4–8 beats; the drop on a
   downbeat around 50–60 % of the film; the logo in the last quarter.
3. **Keyframes**: build just enough of `film.html` to render four stills at the
   key beats plus one transition strip (`node stills.mjs --beats 3,12,24,40
   --tag k1` and `--strip 15.6,16.8`). Look at them yourself first, fix what is
   weak, then send them with the beat map and wait for an OK. This is cheap; a
   wrong concept found after the full render is not.

If the user has said "just do it" / "mach einfach", still make the keyframes and
look at them, but carry on without waiting.

### 5. Build the picture

Edit `cues.mjs` (BPM, BEATS, `EV` event table, `SHOTS`, `CAMERA`, `SHAKES`) and
`film.html` (layout constants, scene functions in `SCENES`, `SHOCKS`, `SPLITS`).
Read `references/craft.md` before writing scenes — it has the toolkit reference
and the patterns that made Füllstand work. The essentials:

- Name every event the picture and sound share in `EV`, in beats, and use only
  those names in both files. Nothing is timed twice.
- Lay the scenes out in one world and move one camera between them; a change of
  place is a whip (spring), and `cameraSmear` / `speedLines` / `rgbSplit` react
  to its speed automatically.
- Animate with springs (`sp`, `tr`), not linear tweens. Type springs have no
  overshoot, UI a hair, shapes a little more.
- A scene keeps drawing what is still in frame from the scene before, so the
  boundaries between scene functions never show.

### 6. The effects layer

Go through the beat map and give every event its effect (all in the template):

| Event | Effect |
|---|---|
| impact / word lands | `slamWord` or `rise`, camera shake (`SHAKES`), `flash`, `shockwave` (`SHOCKS`), `rgbSplit` on the hardest (`SPLITS`) |
| empty / missing / problem | `neonWord` (traced, flickering), hollow strokes, the `warn` colour |
| something travels | `comet` head + `sparks`, a sound that follows its speed |
| panel / card appears | grows out of the hero object, `panel3D` swing, `glass` |
| click | `cursor` (named, hover, click ripple), button squash (`pulse`), small `shockwave`, `energyOutline` around the result |
| number changes | `odometer` (rolls with carry) or `rollText` (split-flap) |
| place change | camera whip: smear, speed lines and split come with it |
| payoff | the biggest of everything: hit, shockwave, split, flash, fill, the `good` colour |

Every effect ramps over at least two frames (`hit` has a 35 ms attack); a
one-frame jump is caught by the pop scan and reads as a glitch.

### 7. Sound

Read `references/sound.md` first. In short: `audio.mjs` arranges music on the
chapters (intro, groove, build with a riser and a 1/16 rest, drop with braam and
808, logo chord), places synthesized effects from `EV` (the `S` effects:
whoosh, impact, click, glass, swirl, …), drives continuous sounds from the
picture's own curves (speed of the line, fill level, slider value), and lays
recorded impacts with `rec()` on the big moments. Set levels in tiers: payoff >
big hits > transitions > UI. `node fetch-sfx.mjs` downloads the recorded
effects (Mixkit, free licence; never commit or hand out the files themselves).

### 8. Review loop — before anything is shown

1. `node stills.mjs --contact --tag r1` (one frame per beat) and look at it.
2. Score 1–10: hook in the first 2 s, readability at phone size, motion
   quality, variety, brand accuracy, sound sync (from the beat map until the
   mix exists).
3. Fix the three worst problems. Strip every transition
   (`--strip <from>,<to>`): most bugs live between beats.
4. Repeat until every score is 8+, at least three rounds.

`references/qa.md` has the rubric, the frequent bugs and their fixes.

### 9. Deliver

```bash
node deliver.mjs --name <film-name>
```

Sound, picture (≈ 1 min of rendering per second of film with 3 workers), mix
to −14 LUFS, review files in `dist/` (contact sheet, phone sheet, whip strip,
poster), then the checks: **pops** (single-frame jumps), **seam** (first vs
last frame, below ~0.3 for a clean loop), **loudness** (integrated, true peak, the
loudest moment — it must be the payoff — and momentary loudness every 0.5 s).
Fix what the checks flag and re-run (`--skip-render` when only sound changed;
`render.mjs --frames a:b` re-renders a range for inspection).

Then send the user the MP4 and the contact sheet (with the tool for sending
files, if there is one; otherwise give the paths), say in two or three lines
what the film does, and name what you would improve next. Commit the film
folder if it lives in a repo (without `out/`, `node_modules/` and the
downloaded effects).

### 10. Feedback rounds

When the user says a part is boring, make more happen there, not just faster:
an extra event, a transformation, an effect, a sound layer. Rebuild the beat
map for that stretch, show a strip of it, then re-render. Keep what they liked
untouched.

## Files in a film folder

| File | What it is |
|---|---|
| `film.html` | the film: BRAND, toolkit (keep), layout + SCENES (yours) |
| `cues.mjs` | the shared timeline: BPM, BEATS, EV, SHOTS, CAMERA, SHAKES |
| `audio.mjs` | instruments, arrangement, `S` effects, `rec()` layer, reverb → `out/music.wav`, `out/sfx.wav` |
| `mix.mjs` | sidechain ducking, two-pass loudnorm to −14 LUFS, limiter, mux |
| `render.mjs` | canvas → PNG → ffmpeg, 4 sub-frames per frame for motion blur, parallel workers; `--bench`, `--frames a:b`, `--w/--h` |
| `stills.mjs` | `--beats`, `--strip`, `--contact` sheets straight from `seek` |
| `deliver.mjs` | everything plus the checks |
| `fetch-sfx.mjs` | the recorded-effect catalogue (IDs only) and downloader |
| `lib/motion.js` | closed-form springs |

Other formats: `film.html?w=1080&h=1080` sets the canvas size; lay out from
`W`/`H` and re-check the stills per format.

## References

- `references/craft.md` — toolkit reference, transformation patterns, camera,
  type, layout and safe zones, lessons learned. Read before building scenes.
- `references/sound.md` — arrangement recipe, instruments, effect catalogue
  with measured peaks, `rec()` placement, levels, mixing. Read before audio.
- `references/qa.md` — scoring rubric, strips, the checks and what to do when
  they fire, frequent bugs. Read before the first review round.
- `references/example-fuellstand.md` — the worked example: concept, beat map,
  what the user loved and what they called boring. Read when designing the
  concept.
