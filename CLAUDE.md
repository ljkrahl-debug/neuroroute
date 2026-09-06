# Neuroroute — Kontext & Bauanleitung für Claude Code

> Diese Datei liest Claude Code zuerst. Sie erklärt das Projekt, den aktuellen Stand
> und was als Nächstes gebaut werden soll. Bitte vor jeder Aufgabe kurz überfliegen.

---

## 1. Was ist Neuroroute?

Neuroroute ist eine **multimodale Logistikplattform** ("Börse für Logistik").
Sie verbindet:
- **Abnehmer** (Verlader / Auftraggeber) — brauchen Transporte
- **Anbieter** (Carrier / Speditionen) — bieten Transporte & Kapazität an
- **Fahrer** — führen Transporte aus, melden Status
- **Admins** — verwalten, verifizieren, rechnen ab

Transportwege: **Straße, Schiene, See, Luft** — und Kombinationen (multimodal).

### Die Kern-Idee (das Alleinstellungsmerkmal)
**"Nutze zuerst dein eigenes Netzwerk."**
Wenn ein Abnehmer einen Transport braucht, prüft das System **zuerst seine bevorzugten
Partner**. Externe Anbieter erscheinen nur, wenn intern nichts passt. Firmen müssen also
ihre bestehenden Geschäftsbeziehungen NICHT aufgeben — das ist der Grund, warum
Speditionen die Plattform ohne Widerstand annehmen.

### Zweite Kern-Idee: Empty Capacity Marketplace
Firmen können **freie Kapazitäten und Leerfahrten mit einem Klick anbieten**.
Beispiel: Ein LKW fährt Hamburg→München voll, München→Hamburg leer. Das System erkennt
die Leerfahrt und schlägt vor, sie vergünstigt auf dem Marktplatz anzubieten.
→ Jede vermiedene Leerfahrt = direkter Umsatz. Das erzeugt den Netzwerkeffekt.

---

## 2. Aktueller Stand (was in diesem Ordner liegt)

### `/website/` — 20 fertige HTML-Seiten
Voll funktionsfähige, zweisprachige (DE/EN) Marketing-Website + klickbarer Prototyp.
**Wichtig:** CSS und JavaScript sind in JEDE HTML-Datei INLINE eingebettet. Es gibt
bewusst KEINE externen `shared.css` / `shared.js` mehr — damit beim Hosten nichts
fehlen kann. (Die Original-Quelldateien liegen separat in `/docs/source/`.)

**Marketing-Seiten:** index, platform, marketplace, profile, solutions, pricing,
network, tracking, about, contact, faq, usecases, roadmap, news
**Rechtstexte:** impressum, datenschutz, agb (⚠️ enthalten Platzhalter — Anwalt muss prüfen)
**Prototyp:** login.html + app.html
**Sonstiges:** 404.html, assets/ (Favicon + Vorschaubild), robots.txt, sitemap.xml

Die Seite ist launch-fertig: Meta-Tags/Open Graph auf allen Seiten, funktionierendes
Demo-Formular (Netlify Forms mit mailto-Fallback), Security-Header via `netlify.toml`.
**Einziger offener Punkt vor dem Livegang sind die Platzhalter in den Rechtstexten.**

### `/tools/` — Wartungs-Skripte
Weil das CSS/JS in allen 20 Seiten dupliziert liegt, werden seitenübergreifende
Dinge nicht von Hand editiert, sondern von Skripten verwaltet:
- `finalize_site.py` — Meta-Tags, ARIA/Barrierefreiheit, sitemap.xml, robots.txt.
  Idempotent, nach Inhaltsänderungen erneut laufen lassen. `--check` meldet Drift.
- `prelaunch_check.py` — Startfreigabe: Platzhalter, tote Links, fehlende Assets.
- `browser_check.py` — lädt jede Seite im echten Browser, meldet JS-Fehler.

### `app.html` — der klickbare Prototyp (WICHTIG zu verstehen)
Das ist eine **Simulation im Browser**, KEINE echte Software:
- Speichert Daten in `window.storage` (browser-lokal, kein echtes Backend)
- Alle 4 Rollen sind durchklickbar (Admin/Anbieter/Abnehmer/Fahrer)
- Cross-Rollen-Flow funktioniert: Abnehmer erstellt Auftrag → Anbieter sieht Anfrage →
  gibt Angebot → Abnehmer nimmt an → Fahrer meldet Status → Admin sieht alles
- **Zweck:** Vorlage / Referenz dafür, wie die echte Software funktionieren soll.

→ Nutze `app.html` als **funktionale Spezifikation**. Die echte App soll sich genauso
verhalten, aber mit echtem Backend statt `window.storage`.

---

## 3. Was als Nächstes gebaut werden soll (Priorität von oben nach unten)

Das Ziel ist NICHT, sofort die ganze Vision zu bauen. Ziel ist ein **schlanker Kern
(MVP)**, den 5–10 echte Speditionen benutzen können. Reihenfolge:

### Phase 1 — Fundament (MVP-Kern) ✅ ERLEDIGT — liegt in `/backend/`
1. ~~**Backend-Grundgerüst**~~ — Node.js + Express.
2. ~~**Datenbank**~~ — PostgreSQL. Schema für users, companies, requests, offers,
   capacity, marketplace_listings (+ sessions, partners).
3. ~~**Auth & Rollen**~~ — E-Mail + Passwort, 4 Rollen, serverseitige Sessions.
   Abweichung von der Empfehlung (Auth0/Clerk/Lucia) samt Begründung steht in
   `backend/README.md`.
4. ~~**Kern-Flow**~~ — Anfrage → Angebot → Annahme, mit 39 Integrationstests.

Details, API-Referenz und Demo-Zugänge: **`backend/README.md`**.

### Phase 2 — Das Besondere ✅ ERLEDIGT — liegt in `/backend/`
5. ~~**Matching-Engine**~~ — Exklusivfenster (Standard 24 h, einstellbar, vorzeitig
   zu öffnen) plus Partner-zuerst-Sortierung. Als Regel durchgesetzt, nicht nur
   als Anzeigefilter.
6. ~~**Empty Capacity Marketplace**~~ — Kapazität eintragen, Leerfahrt-Erkennung
   (explizit markiert **und** hergeleitet aus fehlender Rückfahrt), 1-Klick-Publish,
   Suche und Buchung.

### Phase 3 — Reife ← HIER GEHT ES WEITER
7. **Tracking V1** — statusbasiert (keine GPS-Hardware nötig), Fahrer tippt Status.
8. **Firmenprofile** — jede Firma bekommt eine öffentliche Profilseite (siehe profile.html).
9. **Abrechnung** — Abo + Provision auf vermittelte Transporte.

### Später / Vision (NICHT jetzt)
- KI-Empfehlungen, Nachfrageprognosen, Echtzeit-GPS (V3), Zahlungsabwicklung.

---

## 4. Technische Hinweise & Konventionen

- **Design-System** ist in den HTML-Dateien definiert (siehe `/docs/source/shared.css`).
  Farben: bg `#03050a`, cyan `#00d4ff`, green `#00ff9d`, amber `#ffb340`, indigo `#4f7cff`.
  Fonts: Bebas Neue (Überschriften) + Outfit (Text).
  Rollenfarben: Admin=indigo, Anbieter=amber, Abnehmer=cyan, Fahrer=green, Marktplatz=green.
- **Icons:** eigenes SVG-Set (siehe `/docs/source/icons.js`), KEINE Emojis verwenden.
- **Zweisprachigkeit:** Jede Seite hat DE/EN über `<span data-lang="en">` / `data-lang="de">`.
- **Beim echten Frontend:** Am besten React oder ein modernes Framework. Das aktuelle
  HTML ist statisch — es kann als Design-Referenz dienen, muss aber für die echte App
  in Komponenten überführt werden.

## 5. Wichtige Rahmenbedingungen

- Neuroroute ist ein **reiner Vermittler** — das steht so in den AGB. Kein eigener Transport.
- **DSGVO:** Daten in der EU hosten. Verschlüsselung, rollenbasierter Zugriff.
  ⚠️ Hier stand ursprünglich „Frankfurt". Railway (siehe `backend/DEPLOY-RAILWAY.md`)
  hat als EU-Region **Amsterdam** — DSGVO-konform, aber nicht Frankfurt. Falls
  „Frankfurt" gegenüber Kunden zugesagt wurde, muss das angepasst werden. Und:
  Railway ist ein US-Anbieter, also Auftragsverarbeiter nach Art. 28 DSGVO —
  **AVV von Jennifer prüfen lassen, bevor echte Kundendaten drauf liegen.**
- **Rechtstexte** (impressum/datenschutz/agb) sind nur Vorlagen mit Platzhaltern —
  ein Anwalt muss sie finalisieren, bevor die Seite live geht.

## 6. Wer ist wer

- **Gründer** — Vision, Produkt, Geschäft
- **Luis** — Backend-Entwicklung (Node.js)
- **Jennifer** — Recht

---

## 7. Erste sinnvolle Aufgabe für Claude Code

Wenn du nicht weißt, wo du anfangen sollst, schlage dies vor:

> "Lass uns Phase 1 starten: ein minimales Backend (Node.js + Express + PostgreSQL)
> mit echtem Login und dem Kern-Flow (Anfrage → Angebot → Annahme), genau so wie es
> app.html simuliert. Wir bauen erst diesen schlanken Kern, den echte Nutzer testen können."

Frage den Gründer dann, welche konkrete Funktion zuerst dran ist.
