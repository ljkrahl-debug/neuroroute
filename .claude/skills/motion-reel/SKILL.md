---
name: motion-reel
description: Make a product or showreel motion video rendered from code. Use when the
  user asks for a launch video, showreel, product reel, animated explainer or motion ad
  for Neuroroute or another product.
---

# Motion reel

The studio lives in `video/`. Read `video/CLAUDE.md` first — its render contract,
banned looks and review loop apply to every film. The Neuroroute launch film in
`video/index.html` is the worked example: copy its structure, not its content.

## Inputs to collect first
Product + URL, duration, formats (9:16 / 1:1 / 16:9), brand colors + fonts,
a reference (frame, video, or image folder), music (file or "synthesize").

## Pipeline
1. Gather assets with Playwright into `video/assets/`. For Neuroroute,
   `node capture.mjs` clicks through the real flow in `website/app.html` and
   records element rectangles in `assets/layout.json`. List what you found.
2. If a reference exists, write `docs/style_guide.md` from it.
3. Write the timeline in `cues.mjs` (shots and sound cues in beats), then
   `node audio.mjs` and `python3.13 beats.py out/music.wav > beats.json`.
4. Show the shot list on the beat grid and wait for OK.
5. Build `index.html` with `window.seek(t)` using `lib/motion.js` springs.
   Look elements up by text in `layout.json` instead of hard-coding pixels.
6. `node stills.mjs --tag rN` → read `out/contact-rN.png` and `out/phone-rN.png`
   → score → fix the 3 worst problems. 3 rounds minimum, every score 8+.
   Add `--strip <beat>` around fast moments: some bugs only show between beats.
7. `node bench.mjs` to know the render time, then `node deliver.mjs`.
8. Deliver `dist/*.mp4`, `contact.png`, `poster.png`. Say what you'd improve next.

## Hard rules
- Real product UI only. Never invent screens.
- No Math.random, no timers, no CSS transitions in render mode.
- Banned: corner labels, centered title on gradient, everything fading in.
- Never scale a capture above 1.0 — capture at higher density instead.
- No invented statistics. Every number on screen comes from the product.

## Lessons from the first film
- `fetch()` refuses `file://`; load JSON as modules (`import x from './x.json' with { type: 'json' }`).
- Decode captures one at a time into `ImageBitmap`s. Large `<img>`s decoded in
  parallel failed, and undecoded ones were re-decoded on every draw.
- Fixed UI (toasts, modals) belongs to the viewport, not the page: anchor it to
  the card, not to the camera.
- `pkill -f <script>` also matches the shell running it. Wait on PIDs.
