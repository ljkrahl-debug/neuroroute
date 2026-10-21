// "Ein Punkt." — Neuroroute brand film on the TikTok sound by uzan.x.
// The film is the sound's exact length and plays it straight from its start,
// so it can be posted with the original sound attached in the app.
// Times are in beats of the sound (108 BPM; its first beat sits at 0.027 s).
//
// Concept: alone it is a dot, connected it is a network. Grey dots twitch in
// the old way of working; in the break they fall into one cyan dot; on the
// drop the dot becomes the network; at the end the dot breaks up again into
// the grey dots of frame 0, so the film loops.

export const BPM = 108.022;
export const BEATS = 47; // 26.1 s, the sound's length

export const EV = {
  // 1 — the old way (the sound's bass intro): twitching dots, words on the beats
  w1: 1, w2: 3, w3: 5, w4: 7, w5: 9,
  // 2 — the break (no bass): everything freezes and falls into one dot
  freeze: 11, collapse: 11.15, dot: 12.3, neon: 12.6,
  // 3 — the drop: the dot becomes the network
  drop: 15, headNet: 15.3,
  // 4 — three things it stands for, each a change of the network
  partners: 21, empty: 27, fill: 28.5, modes: 33,
  // 5 — the brand
  converge: 38.6, wordmark: 39.4, claim: 40.6, url: 41.4, retract: 44.6, shatter: 45.6,
};

export const SHOTS = [{ id: 'all', from: 0, to: BEATS }];

// One camera: a slow push in the chaos, a punch on the drop, wider for the
// network, back to rest for the loop.
export const CAMERA = {
  cx: [[0, 540]],
  cy: [[0, 960]],
  s: [[0, 1.06], [EV.freeze, 1.0, 60, 15], [EV.drop, 0.96, 120, 18], [EV.converge, 1.0, 60, 15], [EV.shatter, 1.06, 40, 13]],
};
export const SHAKES = [[EV.w1, 5], [EV.w2, 5], [EV.w3, 5], [EV.w4, 5], [EV.w5, 7], [EV.drop, 14]];
