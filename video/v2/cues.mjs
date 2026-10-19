// V2 timeline, shared by the picture (index.html) and the sound (audio.mjs),
// so a transformation and its hit can never drift apart. Times are in beats;
// at 120 BPM one beat is 0.5 s.
//
// Concept "Füllstand": fill = load. A solid line, solid type and a solid bar
// carry freight; hollow ones run empty. One line carries the whole film, and
// every scene is made out of the previous one — no fades, no cuts.

export const BPM = 120;
export const BEATS = 68; // 34 s, and the last frame is the first: it loops

// V2.2 put the capacity-planning chapter (6) in after the payoff; the network
// and the brand (7, 8) moved PLAN beats later and are otherwise unchanged.
export const PLAN = 20;

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
  // 6 — weeks ahead: the full loop becomes this week in a row of weeks; the AI
  // forecasts each one; free and excess capacity go out to tender; a shipper
  // enters volumes and fills the free weeks, a carrier takes the excess
  planFrom: 25.2, weeksIn: 25.5, headWeeks: 25.85, scanFrom: 28, scanTo: 30, headKI: 28.2, tags: 30.1,
  tender: 31.4, headTender: 31.7, verlIn3: 33, field: 33.9, typeFrom: 34.1, typeTo: 35.1, click6: 35.6,
  pourFrom: 36.1, pourTo: 37.3, spedIn2: 36.6, click7: 38.1, takeFrom: 38.2, takeTo: 39,
  cardAway: 39.3, allFull: 40, merge: 42.6, labelsBack: 43.8,
  // 7 — your network first: 24 h for partners, then the market
  collapse: 45.2, hub: 45.85, headNet: 46.1, partners: [46.6, 47.0, 47.4], marketDots: 46.3, request: 48.5,
  sweepFrom: 48.75, sweepTo: 52.5, headMarkt: 52.5, offersBack: 53.4, offerCard: 54.4, headPartner: 54.5,
  verlIn2: 54.7, click4: 55.5,
  // 8 — everything becomes the brand dot; wordmark, claim, CTA; home to Hamburg
  converge: 56.2, wordmark: 57, tagline: 58.5, cta: 60, duIn: 60.9, click5: 62, outro: 63.5, retract: 64,
  home: 65, homeLabel: 66.5,
};

export const SHOTS = [
  { id: 'loop', from: 0, to: EV.morph },
  { id: 'card', from: EV.morph, to: EV.click1 },
  { id: 'offer', from: EV.click1, to: EV.fold },
  { id: 'market', from: EV.fold, to: EV.whipDown },
  { id: 'payoff', from: EV.whipDown, to: EV.planFrom },
  { id: 'plan', from: EV.planFrom, to: EV.collapse },
  { id: 'network', from: EV.collapse, to: EV.converge },
  { id: 'logo', from: EV.converge, to: BEATS },
];
