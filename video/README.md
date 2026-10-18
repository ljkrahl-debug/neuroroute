# Neuroroute Launch-Film

20 Sekunden, komplett im Code gebaut — nach der Anleitung „How to Build a Motion
Design Studio". Kein After Effects: `index.html` zeichnet jeden Frame über
`window.seek(t)`, ein Headless-Browser macht Screenshots, ffmpeg setzt sie zu
einem MP4 zusammen. Musik und Sounds sind ebenfalls im Code synthetisiert.

**Fertige Videos:** `dist/neuroroute-launch-9x16.mp4`, `-1x1.mp4`, `-16x9.mp4`

## Die Story

| Zeit | Beats | Was passiert |
|---|---|---|
| 0–2 s | 0–4 | **Hook:** „VOLL HIN. LEER ZURÜCK." — Wort für Wort auf die Schläge |
| 2–4 s | 4–8 | Hamburg → München voll, der Rückweg leer (gestrichelt, amber) |
| 4–6 s | 8–12 | NEUROROUTE — die Kapazitätsplanung baut sich Stück für Stück auf |
| 6–8 s | 12–16 | **Feature 1:** „Leerfahrt erkannt" → Klick auf „Rückfahrt anbieten" → echtes Modal |
| 8–12 s | 16–24 | **Feature 2:** veröffentlicht, −30 %, eine andere Firma klickt „Buchen" |
| 12–14 s | 24–28 | **Feature 3:** Partner zuerst — „★ Bestes Angebot · Interner Partner" → „Annehmen" |
| 14–16 s | 28–32 | **Die Zahl:** 24 h nur für deine Partner, danach für alle |
| 16–20 s | 32–40 | Die Rückfahrt vom Anfang fährt jetzt grün und **voll** zurück · Logo · „Demo anfragen" |

Jeder UI-Moment ist ein Ausschnitt eines **echten Screenshots** aus dem
Prototyp `website/app.html` — durchgeklickt von `capture.mjs`, inklusive Modal,
Toasts und Folgezuständen. Die einzige Zahl im Film (24 h) ist das echte
Standard-Exklusivfenster aus dem Backend. Keine erfundenen Statistiken.

## Neu bauen

```bash
cd video
npm install
pip install numpy librosa soundfile      # für die Beat-Messung

node capture.mjs        # echte Screens aus dem Prototyp
node deliver.mjs        # Musik, Beats, alle drei Formate, Poster, Kontaktbogen
```

Ein Format dauert etwa 12 Minuten (60 fps, 4 Subframes für Motion Blur).
`node bench.mjs` sagt vorher, wie lange.

## Iterieren

```bash
node stills.mjs --tag v2 --strip 14,22   # Kontaktbogen + Handy-Test + Strips, ohne Video
```

Hausregeln, Verbote und die Kritikschleife stehen in `CLAUDE.md` in diesem
Ordner. Der Skill `/motion-reel` (in `.claude/skills/`) packt die ganze Pipeline
in einen Satz.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Der Film. Reine Funktion der Zeit |
| `cues.mjs` | Zeitleiste für Bild **und** Ton — Schnitt und Sound können nicht auseinanderlaufen |
| `audio.mjs` | Musik (120 BPM, Am–F–C–G) und alle Effekte, synthetisiert |
| `beats.py` | misst das Beat-Raster aus der Musik (librosa) |
| `mix.mjs` | Mix auf −14 LUFS, zwei Durchgänge |
| `render.mjs` | Frames → ffmpeg, mit Motion Blur |
| `capture.mjs` | klickt den Prototyp durch und fotografiert ihn |
| `stills.mjs` | Kontaktbögen für die Kritikrunden |
| `deliver.mjs` | alles zusammen, alle Formate |
| `lib/motion.js` | Federn statt Easing-Kurven |
