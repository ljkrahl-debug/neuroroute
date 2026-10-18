// V2 timeline, shared by the picture (index.html) and the sound (audio.mjs),
// so a transformation and its hit can never drift apart. Times are in beats;
// at 120 BPM one beat is 0.5 s.
//
// Concept "Füllstand": fill = load. A solid line, solid type and a solid bar
// carry freight; hollow ones run empty. One line carries the whole film, and
// every scene is made out of the previous one — no fades, at most two cuts.

export const BPM = 120;
export const BEATS = 52; // 26 s

export const SHOTS = [
  { id: 'loop', from: 0, to: 8 },        // VOLL HIN. — the line comes back hollow: LEER ZURÜCK.
  { id: 'card', from: 8, to: 13 },       // the loop lies down and becomes the card's route; empty leg detected
  { id: 'offer', from: 13, to: 16 },     // click: the button unfolds into the offer panel, drag the discount
  { id: 'market', from: 16, to: 20.5 },  // the panel folds into a listing, whips up into the marketplace, gets booked
  { id: 'payoff', from: 20.5, to: 26 },  // back to the loop: the empty leg fills green, LEER rolls to VOLL (drop on 24)
  { id: 'network', from: 26, to: 36 },   // your network first: 24 h for partners, then everyone
  { id: 'logo', from: 36, to: 52 },      // the accepted offer becomes the brand dot, wordmark, CTA, back to frame 0
];

// The four keyframes shown for approval before the full build.
export const KEYFRAMES = [
  { beat: 6.3, name: 'hook' },
  { beat: 14.4, name: 'offer' },
  { beat: 24.5, name: 'payoff' },
  { beat: 30.5, name: 'network' },
];
