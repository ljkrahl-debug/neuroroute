// V2 timeline, shared by the picture (index.html) and the sound (audio.mjs),
// so a transformation and its hit can never drift apart. Times are in beats;
// at 120 BPM one beat is 0.5 s.
//
// Concept "Füllstand": fill = load. A solid line, solid type and a solid bar
// carry freight; hollow ones run empty. One line carries the whole film, and
// every scene is made out of the previous one — no fades, no cuts.

export const BPM = 120;
export const BEATS = 48; // 24 s, and the last frame is the first: it loops

// Every event the picture and the sound agree on.
export const EV = {
  // 1 — the loop: full there, empty back
  launch: 0, voll: 0.5, hin: 1.5, arriveM: 3, turn: 3.5, leer: 4.5, zurueck: 5.5, arriveH: 7,
  // 2 — the loop lies down and becomes the card's route; the empty leg is detected
  morph: 8, cardTitle: 8.75, cardSub: 8.9, cardBtn: 9.15, scan: 9.4, tag: 9.95, headA: 10, headB: 10.3,
  // 3 — the carrier offers the empty leg
  spedIn: 11.6, spedArrive: 12.05, hover1: 12.5, click1: 13, unfold: 13.05, headPrice: 13.2,
  grab: 13.75, dragFrom: 13.8, dragTo: 14.8, release: 14.85, hover2: 15.25, click2: 15.5,
  // 4 — the panel folds into a listing and whips up into the marketplace; a shipper books it
  fold: 15.65, whipUp: 15.9, land: 16.3, headMarket: 16.5, verlIn: 17.3, hover3: 18.6, click3: 19, booked: 19.05,
  headBooked: 19.3,
  // 5 — back down: the booking fills the empty leg; LEER rolls to VOLL on the drop
  whipDown: 19.65, outRedraw: 20.2, words2: 20.7, fillFrom: 21.5, roll: 23, drop: 24,
  // 6 — your network first: 24 h for partners, then the market
  collapse: 25.2, hub: 25.85, headNet: 26.1, partners: [26.6, 27.0, 27.4], marketDots: 26.3, request: 28.5,
  sweepFrom: 28.75, sweepTo: 32.5, headMarkt: 32.5, offersBack: 33.4, offerCard: 34.4, headPartner: 34.5,
  verlIn2: 34.7, click4: 35.5,
  // 7 — everything becomes the brand dot; wordmark, claim, CTA; home to Hamburg
  converge: 36.2, wordmark: 37, tagline: 38.5, cta: 40, duIn: 40.9, click5: 42, outro: 43.5, retract: 44,
  home: 45, homeLabel: 46.5,
};

export const SHOTS = [
  { id: 'loop', from: 0, to: EV.morph },
  { id: 'card', from: EV.morph, to: EV.click1 },
  { id: 'offer', from: EV.click1, to: EV.fold },
  { id: 'market', from: EV.fold, to: EV.whipDown },
  { id: 'payoff', from: EV.whipDown, to: EV.collapse },
  { id: 'network', from: EV.collapse, to: EV.converge },
  { id: 'logo', from: EV.converge, to: BEATS },
];
