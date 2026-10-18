// The film's timeline, shared by the picture (index.html) and the sound
// (audio.mjs) so a cut and its hit can never drift apart. Times are in beats;
// at 120 BPM one beat is 0.5 s and a bar is 2 s. Every shot starts on a
// downbeat (a multiple of 4).

export const BPM = 120;
export const BEATS = 40; // 20 s

// Story, per Step 4 of the guide: hook, product, three features with a cursor
// doing a real action, one real number, logo + call to action.
export const SHOTS = [
  { id: 'hook', from: 0, to: 4 },          // "VOLL HIN. LEER ZURÜCK."
  { id: 'route', from: 4, to: 8 },         // Hamburg → München, the way back runs empty
  { id: 'product', from: 8, to: 12 },      // capacity planner assembles itself
  { id: 'detect', from: 12, to: 16 },      // feature 1: empty run detected, click "Rückfahrt anbieten"
  { id: 'market', from: 16, to: 24 },      // feature 2: on the marketplace, click "Buchen"
  { id: 'partners', from: 24, to: 28 },    // feature 3: own network first, click "+ Partner hinzufügen"
  { id: 'number', from: 28, to: 32 },      // "24 H" exclusive for partners (the real default window)
  { id: 'logo', from: 32, to: 40 },        // lockup + CTA
];

// Sound effects, each on the grid. [beat, type, gain]
// Each line names what it lands on in the picture.
export const SFX = [
  [0, 'impact', 1.0],    // VOLL HIN.
  [2, 'thump', 0.9],     // LEER ZURÜCK.
  [3.5, 'whoosh', 0.55],
  [4, 'pop', 0.5],       // Hamburg
  [5, 'pop', 0.5],       // München
  [6, 'tick', 0.45],     // full truck arrives
  [7, 'thump', 0.6],     // the way back: LEER
  [7.5, 'whoosh', 0.55],
  [8, 'thump', 0.75],    // NEUROROUTE
  [9, 'pop', 0.45],      // planner: header + stats
  [10, 'pop', 0.45],     // planner: planned transports
  [11, 'pop', 0.5],      // planner: "Leerfahrt erkannt"
  [11.5, 'whoosh', 0.5],
  [12, 'pop', 0.55],     // LEERFAHRT ERKANNT.
  [13, 'tick', 0.4],     // camera onto the leg
  [14, 'click', 0.9],    // "Rückfahrt anbieten"
  [14.5, 'pop', 0.55],   // the real modal opens
  [16, 'click', 0.9],    // "Auf Marktplatz veröffentlichen"
  [16, 'whoosh', 0.45],  // peaks on the cut at 16.5
  [17, 'pop', 0.6],      // toast: veröffentlicht
  [18, 'pop', 0.5],      // −30 %
  [19.5, 'whoosh', 0.5],
  [20, 'pop', 0.5],      // the shipper's marketplace
  [22, 'click', 0.9],    // "Buchen"
  [22.5, 'pop', 0.6],    // toast: gebucht
  [23.5, 'whoosh', 0.55],
  [24, 'pop', 0.5],      // preferred partners
  [25, 'pop', 0.55],     // offers, partner on top
  [26, 'click', 0.9],    // "Annehmen"
  [26.5, 'pop', 0.6],    // toast: vergeben
  [28, 'impact', 0.9],   // 24 H
  [30, 'pop', 0.5],      // Danach für alle.
  [31.5, 'whoosh', 0.6],
  [32, 'impact', 1.0],   // logo
  [34, 'pop', 0.5],      // tagline
  [36, 'pop', 0.55],     // call to action
];

// The riser that leads into the number.
export const RISER = { from: 26, to: 28 };
