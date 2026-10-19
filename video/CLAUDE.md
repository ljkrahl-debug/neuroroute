# Motion studio rules

Gilt für alles in `video/`. Die Projektregeln von Neuroroute stehen in `../CLAUDE.md`.

## Render contract
- Every film is a pure function of time: window.seek(t) paints frame t.
- No CSS transitions, no setTimeout, no requestAnimationFrame in render mode,
  no state carried between frames. Seeded noise only, never Math.random.
- Render with node render.mjs. Encode H.264 yuv420p, CRF 16.

## Look
- Banned: centered title on a gradient, everything fading in,
  corner labels and frame borders, glow on UI, generic particle bursts.
- One display font, one UI font. One accent color unless the brief says otherwise.
- Every 2 to 4 seconds something new must happen on screen.

## Sound
- Music and sound effects are synthesized in code unless a track is supplied.
- Place hits on the measured beat grid (beats.json). Loudness -14 LUFS.

## Loop before you show me anything
1. Render one frame per beat as a contact sheet and LOOK at it.
2. Score it 1-10 on: hook in first 2s, readability at phone size,
   motion quality, variety, brand accuracy, sound sync.
3. Fix the 3 worst problems. Repeat until every score is 8+.
4. Only then do the full render.

## Neuroroute
- Brand: Bebas Neue (display) + Outfit (UI). Background #03050a.
  Accent: cyan #00d4ff. Green #00ff9d only for "empty run turned into revenue",
  amber #ffb340 only for the empty leg itself — they are meaning, not decoration.
- V1 (`index.html`): real product UI only — crops of the screenshots in
  ./assets (captured by capture.mjs from website/app.html).
- V2 (`v2/`): the founder asked for UI drawn in code instead of screenshots,
  so it can morph and move like the references. It keeps the product's design
  language, and every feature it shows must work the way the product does
  (check backend/ before claiming one). Exception: a roadmap feature the
  founder explicitly asks for (V2.2: AI capacity forecast + tenders) — shown
  tagged "BALD" (`SOON` in v2/index.html), never as live.
- No invented statistics. Every number on screen comes from the product or
  its demo data.
