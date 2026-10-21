# Neuroroute — „Füllstand“ (Launch-Film V2)

34 Sekunden, 9:16, komplett im Code: `index.html` zeichnet jeden Frame über
`window.seek(t)`, Musik und Sounds sind synthetisiert. Gebaut nach dem
Mega-Prompt (Referenzen: zwei TikTok-Motion-Design-Videos) — deren Prinzipien,
nicht deren Inhalte.

**Fertiger Film:** `../dist/neuroroute-fuellstand-9x16.mp4` (loopt nahtlos:
der letzte Frame ist der erste)

## Die Idee

**Füllstand: gefüllt = beladen, hohl = leer.** Eine einzige Linie trägt den
ganzen Film. Die Hinfahrt ist eine gefüllte Röhre, die Rückfahrt dieselbe
Röhre, nur hohl — und genauso die Schrift (gefüllt / Outline) und die
Oberfläche (hohle Kante = freie Kapazität). Jede Szene entsteht aus der
vorherigen, es gibt keinen einzigen Schnitt und keine Überblendung.

| Takt | Zeit | Was passiert | Übergang |
|---|---|---|---|
| 0–8 | 0–4 s | Linie Hamburg → München gefüllt: **VOLL HIN.** Zurück hohl: **LEER ZURÜCK.** | — |
| 8–13 | 4–6,5 s | Die Schleife legt sich hin und wird zur Route in einer Glas-Karte; Scan, „Leerfahrt erkannt“ | Schleife → Route |
| 13–15,6 | 6,5–7,8 s | Cursor „Spedition“ klickt, Button wird zum Angebots-Panel; Rabatt-Regler auf 30 %, Preis rollt 1.700 → 1.190 | Button → Panel |
| 15,6–19,6 | 7,8–9,8 s | Panel faltet sich zum Inserat, Kamera-Whip nach oben in den Marktplatz, Cursor „Verlader“ bucht | Panel → Inserat, Whip |
| 19,6–25 | 9,8–12,5 s | Whip zurück: die Mini-Route des Inserats wächst zur großen Schleife, die Rückfahrt läuft grün voll, LEER rollt zu **VOLL** — Drop auf Takt 24 | Inserat → Schleife |
| 25–45 | 12,5–22,5 s | **Kapazitätsplanung (V2.2):** die Schleife wird zu „KW 44“ in einer Reihe von Wochen, **NÄCHSTE WOCHEN?** Die KI-Prognose läuft als Scan darüber, jede Woche füllt sich auf ihre Prognose: voll, hohl (freie Kapazität) oder über den Rand (mehr Fracht als LKW). **AUTOMATISCH AUSGESCHRIEBEN.** — die Ausschreibung schwingt hoch; ein Verlader tippt seine Menge ein (20 Ladungen) und füllt die freien Wochen, eine andere Spedition übernimmt den Überschuss. **ALLES VOLL GEPLANT.** — die Wochen gleiten zurück in die eine große Schleife | Schleife → Wochen → Ausschreibung → Schleife |
| 45–56 | 22,5–28 s | Die Schleife rollt sich in Hamburg ein, Hamburg wird zu „DU“: **ERST DEIN NETZWERK.** 24 Stunden nur Partner, dann der Markt; Partner-Angebot wird angenommen | Station → Hub, Hub → Karte |
| 56–68 | 28–34 s | Alles fließt in den cyanen Punkt, NEUROROUTE wird aus ihm herausgezogen, Claim, „Demo anfragen“; der Punkt fährt heim nach Hamburg | Karte → Punkt → Station |

### V2.1 — Effekte

Nach dem ersten Feedback (Anfang und Payoff zu ruhig, mehr Effekte auf den
Karten und im Kreis) liegt eine Effekt-Ebene über dem Film:

- **Opening:** die Kamera startet ganz nah an der Hamburg-Station und fährt
  mit dem leuchtenden Kopf der Linie mit (Funken, Kometenschweif). Volle
  Wörter schlagen ein (groß, bewegungsunscharf, weißer Lichtblitz), leere
  Wörter zeichnen sich selbst wie eine flackernde Neonröhre. Am Ende fliegt
  die Kamera zurück in die Station — der Film loopt weiter nahtlos.
- **Payoff:** die Flüssigkeit steigt mit Blasen und leuchtender Front, die
  Oberfläche in den Buchstaben schwappt, oben spritzt sie über.
- **Treffer:** Schockwellen laufen durch das Bild (Aufprall, jeder Klick,
  Drop, Markt-Öffnung, Logo), Farbspaltung auf den härtesten Treffern und in
  den Whips, Speed-Streifen in den Whips.
- **Karten:** Panels schwenken in 3D ein, der Regler zündet pro Prozent einen
  Strich, Buchen und Annehmen schicken einen Energie-Impuls um den Rahmen.
- **Kreis:** das Netzwerk kommt schräg und gedreht herein und schwenkt nach
  vorn; die 24 h laufen als Radar mit Lichtkeil, Sonar-Pings pro Takt; beim
  Öffnen läuft die Schockwelle nach außen und jeder Knoten blitzt auf.

### V2.2 — Kapazitätsplanung

Auf Wunsch des Gründers: ein eigenes Kapitel (+10 s) dafür, dass Über- und
Unterkapazitäten per KI Wochen im Voraus berechnet und über Ausschreibungen
angeboten werden — Verlader tragen ihre Mengen ein, Speditionen übernehmen,
was zu viel ist. Die Kapazitätsplanung selbst (künftige Transporte,
Auslastung, Leerfahrt-Erkennung) gibt es im Produkt; **KI-Prognose und
Ausschreibungen stehen noch auf der Roadmap** (Website: „Künftige KI“). Der
Film markiert die Prognose deshalb mit „BALD“ — ein Schalter (`SOON` in
`index.html`) nimmt den Hinweis heraus, sobald es live ist. Die Mengen (20
Ladungen, 12 / 8 frei, +8 zu viel) sind Beispielwerte, keine Statistik.

Musik: nach dem Drop ein ruhigerer Halftime-Teil (F – C – G), dessen
Arpeggio sich mit dem Scan öffnet, Aufbau auf E mit Snare-Roll und 1/16
Stille, Mini-Drop auf „ALLES VOLL GEPLANT“ (bewusst leiser als der Drop auf
Takt 24). Jede Woche „singt“ ihren Füllstand, wenn der Scan sie erreicht;
Tastatur-Ticks beim Eintippen; Einschenken beim Befüllen.

Wahr bleiben: Die 24 h Partner-Vorrang gelten im Backend nur für
Transportanfragen (`backend/src/routes/requests.js`), nicht für
Marktplatz-Inserate — darum zwei getrennte Kapitel. Preise und Firmennamen
sind die Beispieldaten aus dem Prototyp `website/app.html`.

### Version mit TikTok-Sound (uzan.x)

Auf Wunsch des Gründers gibt es eine zweite Fassung auf dem TikTok-Sound
„original sound“ von **uzan.x** (Musik-ID 7689903372249402134, 26 s). Weil
der ganze Film in Takten geschrieben ist, läuft er dafür einfach im Tempo des
Sounds (108 BPM, 37,8 s); `track.mjs` legt den Sound taktgenau darunter:

- Der Sound beginnt mitten im Takt und hat vor seinem Drop nur 15 Takte,
  unser Film 24. Davor laufen deshalb zwei Takte seines eigenen Bass-Intros.
- Sein Break (ein Takt ohne Bass) fällt genau auf die Phase, in der die
  Rückfahrt vollläuft, sein Drop auf unseren Drop (Takt 24), ein neuer
  8-Takt-Abschnitt auf „ALLES VOLL GEPLANT“.
- Unter dem Logo läuft noch einmal sein Intro mit Break — der Film loopt.
- Unsere Effekte bleiben, der Song liegt vorn (Mix-Werte in `cues.mjs`).

```bash
TRACK=uzan node v2/deliver.mjs --music <sound.mp3>   # → dist/neuroroute-fuellstand-uzan-9x16.mp4
```

**Rechte:** Der Sound gehört uzan.x. TikTok führt ihn als kommerziell
nutzbar (`is_commerce_music`) — das gilt nur innerhalb von TikTok. Darum
liegt er nicht im Repository, und die fertige Fassung auch nicht
(`.gitignore`). Außerhalb von TikTok (Website, LinkedIn, Instagram) die
Fassung mit unserem eigenen Score verwenden.

## Ton

Alles synthetisiert in `audio.mjs`, platziert aus derselben Tabelle `EV` in
`cues.mjs`, die auch das Bild liest. Die fortlaufenden Sounds folgen den
Bewegungskurven des Bildes:

- die Linie „zischt“ mit ihrer Geschwindigkeit; die hohle Rückfahrt pfeift
  wie Wind durch eine leere Röhre
- leere Wörter klingen hohl (Klopfen auf einen leeren Behälter), volle schwer
- der Rabatt-Regler rastet einmal pro Prozent ein, genau wenn der Knopf es passiert
- die Flüssigkeit steigt in der Tonhöhe, während die Röhre volläuft (wie eine Flasche)
- 24 Uhr-Ticks, während der Ring die 24 Stunden abläuft
- Whips erreichen ihren Höhepunkt, wenn die Kamera am schnellsten ist

Darüber liegt eine Ebene aus **aufgenommenen Effekten** (Mixkit, Sound
Effects Free License: kommerziell frei, ohne Nennung, aber nicht einzeln
weitergeben — darum lädt `fetch-sfx.mjs` sie per ID, das Repo enthält nur die
IDs). Jeder Sound wird mit seinem gemessenen lautesten Moment auf sein
Ereignis gelegt; Swells vor dem Peak sind gekappt, damit sie nicht über das
vorherige Ereignis laufen. Lautstärke in drei Stufen: Drop, Markt-Öffnung und
Logo am lautesten, Whips und Übergänge darunter, Klicks und UI-Sounds leise.

Musik: 120 BPM, a-Moll. Herzschlag-Intro, Groove ab der Karte, Aufbau auf E
(Dominante) mit Snare-Roll und einer 1/16 Stille, Drop auf a-Moll, Logo auf
Am(add9). Ein Braam und ein 808 tragen den Drop. Mix: Musik duckt unter den Effekten (Sidechain), −14 LUFS,
True Peak unter −1 dB.

## Bauen

```bash
cd video
npm install
node v2/fetch-sfx.mjs        # aufgenommene Effekte laden (einmalig, nicht im Repo)
node v2/deliver.mjs          # Ton, Bild (≈ 30 min), Mux, Review-Bilder, Pop-Scan
node v2/stills.mjs --contact --tag r4          # ein Bild pro Takt
node v2/stills.mjs --strip 15.6,16.8 --tag r4  # 10 Bilder über einen Übergang
node v2/render.mjs --bench                     # Kosten pro Frame
```

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Der Film. Reine Funktion der Zeit |
| `cues.mjs` | Zeitleiste für Bild **und** Ton (`EV`, `SHOTS`) |
| `audio.mjs` | Musik und synthetisierte Effekte, plus die aufgenommenen, nach Peak platziert |
| `fetch-sfx.mjs` | lädt die aufgenommenen Effekte per ID (Mixkit) |
| `mix.mjs` | Sidechain-Ducking, zwei Durchgänge Loudnorm, Limiter, Mux |
| `render.mjs` | Canvas → PNG → ffmpeg, Sub-Frames für Motion Blur, parallele Worker |
| `stills.mjs` | Keyframes, Kontaktbögen, Übergangs-Strips |
| `deliver.mjs` | alles zusammen, plus Pop-Scan |
| `track.mjs` | legt einen gelieferten Sound taktgenau als Musik unter den Film (`TRACK=…`) |
