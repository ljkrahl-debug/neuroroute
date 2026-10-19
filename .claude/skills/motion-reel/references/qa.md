# QA — looking before showing

## Contents
1. The review loop
2. The scoring rubric
3. Stills, strips and sheets
4. The automatic checks in deliver.mjs
5. Frequent bugs and their fixes
6. Before sending

---

## 1. The review loop

Never show the user something you have not looked at yourself. A contact sheet
costs seconds; a full render costs ~1 minute per second of film.

1. `node stills.mjs --contact --tag rN` → one frame per beat (at beat + 0.45).
   Open the PNG and look at every cell.
2. Score it (rubric below). Write the scores and the three worst problems down.
3. Fix those three. Strip every transition you touched
   (`node stills.mjs --strip 15.6,16.8 --tag rN`, 10 frames) — most bugs live
   between beats, where a per-beat sheet never looks.
4. Repeat until every score is 8+; at least three rounds for a new film.
5. Only then `node deliver.mjs`. Afterwards, look at `dist/<name>-contact.png`
   (2 fps), `-phone.png` (1 fps at phone size) and `-strip.png` (the first whip
   at 30 fps), and read the printed checks.

## 2. The scoring rubric

| Criterion | 8+ means |
|---|---|
| Hook (first 2 s) | motion on frame 0, a big readable word by ~0.5 s, a hit; you would not swipe away |
| Readability at phone size | every headline readable on the 360 px phone sheet; nothing important in the safe zones |
| Motion quality | springs, no linear tweens; nothing pops in one frame; whips smeared; one dominant motion at a time |
| Variety | something new every 2–4 s; no static hold over ~1.5 s; no two chapters built the same way |
| Brand accuracy | brand fonts and colours, colours carry meaning, features shown work like the real product, no invented numbers |
| Sound sync | every visible event has its sound on the same frame (from `EV`); the payoff is the loudest moment |

Also ask: is there one idea (hero object + rule) and does every scene come out
of the one before? If a scene could be cut out without the next one noticing,
it is not connected yet.

## 3. Stills, strips and sheets

| Command | Gives |
|---|---|
| `node stills.mjs --beats 3,12.5,24 --tag k1` | full-size PNGs + a side-by-side sheet; the keyframes for the user |
| `node stills.mjs --strip 15.6,16.8 --tag k1` | 10 frames across a transition, numbered |
| `node stills.mjs --strip 15.6,16.8,20 --tag k1` | 20 frames |
| `node stills.mjs --contact --tag r1` | one frame per beat |
| `node render.mjs --bench` | ms per frame at points across the film |
| `node render.mjs --frames 400:460 --out out/patch.mp4` | a short range as video, to check a fast moment at full motion |

Page errors are printed by the scripts; a film that throws while loading fails
fast with the error instead of hanging.

## 4. The automatic checks in deliver.mjs

- **pops**: the mean frame-to-frame change (luma) of every frame, compared with
  its six neighbours. A frame that changes > 3× its neighbours and > 1.5 is a
  single-frame jump — something appearing, vanishing or teleporting. Find it
  by frame number / beat, strip around it, and make it ramp over 2+ frames.
  Exception: a fast counter or a hard cut on a beat can be fine — decide by
  looking, and say so if you leave one.
- **seam**: mean absolute RGB difference (0–255) between frame 0 and the
  last frame, measured on the canvas (the encoded video adds codec noise on
  the grain, ~0.4, which says nothing about the loop). Below ~0.3 is a clean
  loop. Above ~1, the end state differs from the start: a spring that has not
  settled by the last frame (make it stiffer or start it earlier), a leftover
  element, a size mismatch. If the film is not meant to loop, ignore it.
- **loudness**: integrated LUFS (−14 target), true peak (≤ −1 dB), the loudest
  momentary moment (must be the payoff), and momentary values every 0.5 s.
  If a cluster of UI sounds or a build is the loudest, thin or lower it.

## 5. Frequent bugs and their fixes

| Symptom | Cause | Fix |
|---|---|---|
| film never becomes ready, scripts time out | a JS error at load | read the printed page error; `node --check` does not see inline scripts |
| a sliver of a word stays after it leaves | exit lift too small | lift by ascent + descent + 0.3·size |
| split-flap letters flicker at the end | old glyph drawn at p ≈ 1 | stop drawing it at p ≥ 0.97; travel ascent + 0.45·size |
| two dots where one should be | source and target both visible while converging | hide the source at ~96 % |
| an element pops in on one frame | it starts at a non-zero size/alpha, or a `hit` without attack | spring from 0; keep `hit`'s 35 ms attack |
| a line or shape shows through a card | drawn behind glass but still opaque | let it become the card (fade as the card grows) or end it before |
| empty opening | camera too far, nothing moving on frame 0 | start close (s ≈ 1.1), motion from frame 0 |
| loop jumps | end state drawn at different screen size than frame 0 | draw home with screen-space sizes; check seam |
| sound early / late | sound placed by hand in seconds | place from `EV` beats; whips at `WHIP_PEAK` after the key |
| a whoosh starts before the event it belongs to | long recorded swell | lower `pre` |
| silent or clipped WAV, NaN | filter blow-up | keep the `svf` bound; check `peak before saturation` |
| drop not the loudest | build too loud / ducking too strong | lower the build; check momentary values |
| render very slow | heavy filters on full-frame layers | `--bench`, then cache static layers or lower blur radii on big areas |

## 6. Before sending

- The MP4 plays, has sound, is H.264 yuv420p (QuickTime/phone friendly).
- Contact and phone sheets looked at after the final render.
- Every check read; anything left unfixed is mentioned to the user.
- Numbers and claims on screen are true.
- Send the film and the contact sheet; two or three lines on what it does and
  what you would improve next.
