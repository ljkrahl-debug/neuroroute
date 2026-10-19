// The film's timeline, shared by the picture (film.html) and the sound
// (audio.mjs), so a transformation and its hit can never drift apart.
// Times are in beats; at 120 BPM one beat is 0.5 s. Name every event the
// picture and the sound must agree on, and use only these names in both.

export const BPM = 120;
export const BEATS = 16; // 8 s demo; a launch film is usually 40–56 beats

export const EV = {
  // 1 — a hero line draws itself; a full word slams, an empty word traces as neon
  line: 0, slam: 1, lineEnd: 2.5, neon: 2.6,
  // 2 — a glass card grows out of the line and swings in in 3D; a click
  card: 4, cursorIn: 4.6, click: 6,
  // 3 — a whip to the brand: dot, the name pulled out of it, claim, CTA; home
  whip: 7, dot: 7.6, wordmark: 8.4, claim: 9.6, cta: 10.4, retract: 13, home: 13.8,
};

// Which scene draws which beats. A scene also draws whatever is still in
// frame from the one before (until a whip carries it away), so the cut
// between scene functions is never visible.
export const SHOTS = [
  { id: 'open', from: 0, to: EV.card },
  { id: 'card', from: EV.card, to: EV.whip },
  { id: 'brand', from: EV.whip, to: BEATS },
];

// One camera for the film: [beat, value, stiffness?, damping?] per change.
// The brand lives 2200 px above the opening, so going there is a whip.
// The camera ends where it starts, so the film loops: the last spring must
// have settled by the last frame (check the seam number deliver.mjs prints).
export const CAMERA = {
  cx: [[0, 540]],
  cy: [[0, 960], [EV.whip, 960 - 2200, 190, 27], [EV.home, 960, 110, 21]],
  s: [[0, 1], [EV.card, 1.03, 30, 11], [EV.whip, 1.0, 120, 22]],
};
// [beat, px] — impacts shake the frame
export const SHAKES = [[EV.slam, 5], [EV.lineEnd, 10]];
