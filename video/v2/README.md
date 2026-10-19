# Neuroroute — „Füllstand“ (Launch-Film V2)

24 Sekunden, 9:16, komplett im Code: `index.html` zeichnet jeden Frame über
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
| 25–36 | 12,5–18 s | Die Schleife rollt sich in Hamburg ein, Hamburg wird zu „DU“: **ERST DEIN NETZWERK.** 24 Stunden nur Partner, dann der Markt; Partner-Angebot wird angenommen | Station → Hub, Hub → Karte |
| 36–48 | 18–24 s | Alles fließt in den cyanen Punkt, NEUROROUTE wird aus ihm herausgezogen, Claim, „Demo anfragen“; der Punkt fährt heim nach Hamburg | Karte → Punkt → Station |

Wahr bleiben: Die 24 h Partner-Vorrang gelten im Backend nur für
Transportanfragen (`backend/src/routes/requests.js`), nicht für
Marktplatz-Inserate — darum zwei getrennte Kapitel. Preise und Firmennamen
sind die Beispieldaten aus dem Prototyp `website/app.html`.

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

Musik: 120 BPM, a-Moll. Herzschlag-Intro, Groove ab der Karte, Aufbau auf E
(Dominante) mit Snare-Roll und einer 1/16 Stille, Drop auf a-Moll, Logo auf
Am(add9). Mix: Musik duckt unter den Effekten (Sidechain), −14 LUFS,
True Peak unter −1 dB.

## Bauen

```bash
cd video
npm install
node v2/deliver.mjs          # Ton, Bild (≈ 13 min), Mux, Review-Bilder, Pop-Scan
node v2/stills.mjs --contact --tag r4          # ein Bild pro Takt
node v2/stills.mjs --strip 15.6,16.8 --tag r4  # 10 Bilder über einen Übergang
node v2/render.mjs --bench                     # Kosten pro Frame
```

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Der Film. Reine Funktion der Zeit |
| `cues.mjs` | Zeitleiste für Bild **und** Ton (`EV`, `SHOTS`) |
| `audio.mjs` | Musik und alle Effekte, synthetisiert |
| `mix.mjs` | Sidechain-Ducking, zwei Durchgänge Loudnorm, Limiter, Mux |
| `render.mjs` | Canvas → PNG → ffmpeg, Sub-Frames für Motion Blur, parallele Worker |
| `stills.mjs` | Keyframes, Kontaktbögen, Übergangs-Strips |
| `deliver.mjs` | alles zusammen, plus Pop-Scan |
