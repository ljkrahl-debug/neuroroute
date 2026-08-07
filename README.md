# Neuroroute

Multimodale Logistikplattform ("Börse für Logistik"). Verbindet Verlader, Speditionen,
Fahrer und Admins über Straße, Schiene, See und Luft — mit dem Prinzip
**"nutze zuerst dein eigenes Netzwerk"** und einem **Marktplatz für freie Kapazitäten**.

---

## Ordner-Struktur

```
neuroroute/
├── CLAUDE.md          ← WICHTIG: Kontext & Bauanleitung (zuerst lesen!)
├── README.md          ← diese Datei
├── netlify.toml       Hosting-Konfiguration (Security-Header, Caching)
├── tools/             Wartungs-Skripte (siehe unten)
│   ├── finalize_site.py    Meta-Tags, Barrierefreiheit, sitemap.xml, robots.txt
│   ├── prelaunch_check.py  Startfreigabe-Check — MUSS grün sein vor dem Livegang
│   └── browser_check.py    Lädt jede Seite im echten Browser
├── website/           ← 20 HTML-Seiten (Marketing + Prototyp) + Assets
│   ├── index.html         Startseite
│   ├── platform.html      Plattform-Übersicht
│   ├── marketplace.html   Empty Capacity Marketplace + Transport-Kategorien
│   ├── profile.html       Beispiel-Firmenprofil ("Time to Shine")
│   ├── solutions.html     Lösungen
│   ├── pricing.html       Preise (3 Pakete)
│   ├── network.html       Hybrid-Modell / Netzwerk
│   ├── tracking.html      Sendungsverfolgung
│   ├── about.html         Über uns
│   ├── contact.html       Kontakt / Demo-Anfrage
│   ├── faq.html           Häufige Fragen
│   ├── usecases.html      Anwendungsfälle
│   ├── roadmap.html       Entwicklungs-Fahrplan
│   ├── news.html          Blog / News
│   ├── login.html         Demo-Login (→ app.html)
│   ├── app.html           KLICKBARER PROTOTYP (alle 4 Rollen)
│   ├── 404.html           Fehlerseite im Seitendesign
│   ├── impressum.html     ⚠️ Platzhalter — Anwalt muss prüfen
│   ├── datenschutz.html   ⚠️ Platzhalter — Anwalt muss prüfen
│   ├── agb.html           ⚠️ Platzhalter — Anwalt muss prüfen
│   ├── assets/            Favicon, App-Icons, Vorschaubild fürs Teilen
│   ├── site.webmanifest   PWA-Manifest
│   ├── robots.txt         generiert
│   └── sitemap.xml        generiert
└── docs/
    ├── PROTOTYPE.md       Wie der Prototyp (app.html) funktioniert
    └── source/            Original CSS/JS (Design-Referenz)
        ├── shared.css
        ├── shared.js
        └── icons.js
```

## Die Website ansehen

Einfach `website/index.html` im Browser öffnen. Alles läuft ohne Server —
CSS und JS sind in jede Seite eingebettet.

Den Prototyp testen: `website/login.html` öffnen → Rolle wählen → durchklicken.

## Vor dem Livegang — Checkliste

```bash
python3 tools/prelaunch_check.py
```

Prüft Platzhalter in den Rechtstexten, tote interne Links, fehlende Assets und
fehlende Meta-Tags. Solange das Skript rot ist, **nicht** live gehen.

Aktuell rot aus genau einem Grund: **Impressum, Datenschutz und AGB enthalten
noch Platzhalter** (Firmenname, Anschrift, HRB-Nummer, USt-IdNr., Datum). Die
kann niemand erfinden — sie müssen eingetragen und von Jennifer bzw. einem
Anwalt freigegeben werden. Danach ist der Check grün.

Optional zusätzlich:

```bash
python3 tools/browser_check.py     # jede Seite im echten Browser laden
python3 tools/finalize_site.py     # Meta-Tags/sitemap nach Inhaltsänderungen neu erzeugen
```

## Website online stellen (Netlify)

Empfohlen: **Repository verbinden** (Add new site → Import from Git). `netlify.toml`
liegt im Repo-Root und setzt Publish-Verzeichnis, Security-Header und Caching
automatisch. `404.html` wird von Netlify automatisch als Fehlerseite genutzt.

Alternativ manuell: `website/`-Ordner auf netlify.com ziehen — dann greift die
`netlify.toml` allerdings nicht.

### Kontaktformular

Das Demo-Formular auf `contact.html` läuft über **Netlify Forms** — kein Backend
nötig. Netlify erkennt das Formular beim Deploy automatisch (`data-netlify="true"`).
Eingehende Anfragen stehen im Netlify-Dashboard unter *Forms*; dort sollte eine
E-Mail-Benachrichtigung eingerichtet werden, sonst merkt niemand, dass eine
Anfrage da ist.

Wird die Seite woanders gehostet, fällt das Formular automatisch auf eine
vorausgefüllte E-Mail an `hello@neuroroute.com` zurück — es geht also kein Lead verloren.

### Domain

Alle canonical-URLs und das Vorschaubild zeigen auf `https://neuroroute.com`.
Bei einer anderen Domain: `BASE_URL` in `tools/finalize_site.py` ändern und
`python3 tools/finalize_site.py` laufen lassen.

## Nächste Schritte (echte Software bauen)

Siehe **CLAUDE.md** — dort steht der komplette Fahrplan, von Backend über Auth
bis zur Matching-Engine, in sinnvoller Reihenfolge.

## Rollen im Projekt

- **Gründer** — Vision, Produkt, Geschäft
- **Luis** — Backend (Node.js)
- **Jennifer** — Recht

## Wichtiger Hinweis

Die Website ist echt und einsatzbereit. Der **Prototyp (app.html) ist eine
Browser-Simulation** — er zeigt, wie die Software funktionieren soll, ist aber
selbst noch keine verkaufsfertige Software. Der Bau der echten Plattform ist der
nächste große Schritt (siehe CLAUDE.md).
