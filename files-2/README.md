# Neuroroute — Website & Prototyp

Die komplette Marketing-Website plus klickbarer Software-Prototyp für Neuroroute, die multimodale Logistikbörse.

---

## Was ist enthalten

### Marketing-Website (7 Seiten, zweisprachig DE/EN)
| Datei | Inhalt |
|-------|--------|
| `index.html` | Startseite — Plan. Connect. Move the World. |
| `platform.html` | Plattform — 6 Kernbereiche, Request-Flow, Dashboard, KI-Roadmap |
| `solutions.html` | Lösungen für Operatoren, Verlader, Dienstleister |
| `network.html` | Das Hybrid-Modell & Ökosystem |
| `tracking.html` | Tracking-System (V1/V2/V3) |
| `about.html` | Mission, Vision |
| `contact.html` | Demo-Anfrage-Formular |

### Klickbarer Prototyp
| Datei | Inhalt |
|-------|--------|
| `login.html` | Demo-Login mit Rollenauswahl |
| `app.html` | Die App mit allen 4 Rollen: Admin, Anbieter, Abnehmer, Fahrer |

### Rechtstexte (Vorlagen)
| Datei | Inhalt |
|-------|--------|
| `impressum.html` | Impressum-Vorlage |
| `datenschutz.html` | Datenschutzerklärung-Vorlage |
| `agb.html` | AGB-Vorlage |

### Gemeinsame Dateien
- `shared.css` — Styles für alle Seiten
- `shared.js` — Sprachumschaltung, Navigation, Animationen

---

## Der Prototyp — was er kann

Der Prototyp ist **voll klickbar** und die Rollen arbeiten zusammen:

- **Abnehmer** stellt einen Transportauftrag ein → er erscheint sofort
- **Anbieter** sieht die Anfrage → gibt ein Angebot ab
- **Abnehmer** sieht das Angebot → nimmt es an
- **Fahrer** meldet den Status → das Tracking aktualisiert sich
- **Admin** sieht alles, verifiziert Nutzer, sieht Provisionen

Die Daten bleiben im Browser gespeichert (auch nach dem Schließen). Über den Rollen-Umschalter oben rechts kann zwischen allen vier Rollen gewechselt werden.

> **Wichtig:** Dies ist ein Prototyp ohne echtes Backend. Die Daten liegen nur im Browser. Für die echte Software braucht es einen Server, eine Datenbank und einen Anmelde-Dienst (siehe Investitionsplan).

---

## Bei GitHub hochladen & live schalten

### Variante A — GitHub Pages (kostenlos)

1. Auf [github.com](https://github.com) einloggen, neues Repository erstellen (z.B. `neuroroute-website`)
2. Alle Dateien aus diesem Ordner hochladen (Drag & Drop im Browser geht):
   - "Add file" → "Upload files" → alle Dateien reinziehen → "Commit changes"
3. Im Repository: **Settings** → **Pages**
4. Bei "Source" → Branch `main` auswählen, Ordner `/ (root)` → **Save**
5. Nach ~1 Minute ist die Seite live unter:
   `https://DEIN-NUTZERNAME.github.io/neuroroute-website/`

Die Startseite ist automatisch `index.html`. Login erreichst du über den grünen "Login"-Button in der Navigation oder direkt unter `.../login.html`.

### Variante B — Netlify (kostenlos, noch einfacher)

1. Auf [netlify.com](https://netlify.com) einloggen
2. Den gesamten Ordner per Drag & Drop auf die Netlify-Oberfläche ziehen
3. Fertig — sofort live unter einer `*.netlify.app`-Adresse
4. Eigene Domain (neuroroute.ai) später in den Domain-Einstellungen verbinden

---

## Eigene Domain verbinden

Sobald `neuroroute.ai` registriert ist (siehe Investitionsplan):
- **GitHub Pages:** Settings → Pages → "Custom domain" → `neuroroute.ai` eintragen, dann beim Domain-Anbieter einen CNAME-Eintrag setzen
- **Netlify:** Domain settings → "Add custom domain" → DNS-Anweisungen folgen

SSL (das Schloss-Symbol) wird bei beiden automatisch eingerichtet.

---

## Nächste Schritte zur echten Software

Dieser Prototyp ist die perfekte Vorlage für die echte Entwicklung:

1. **Frontend** existiert bereits (diese Dateien)
2. **Backend** muss gebaut werden (Node.js auf Render — Luis kennt den Stack)
3. **Datenbank** anlegen (MongoDB Atlas, Frankfurt)
4. **Anmelde-Dienst** integrieren (Auth0)
5. **Rechtstexte** vom Anwalt finalisieren lassen

Details dazu im Investitionsplan-Dokument.

---

*© 2025 Neuroroute · Die Logistikbörse*
