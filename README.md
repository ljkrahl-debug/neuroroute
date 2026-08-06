# Neuroroute

Multimodale Logistikplattform ("Börse für Logistik"). Verbindet Verlader, Speditionen,
Fahrer und Admins über Straße, Schiene, See und Luft — mit dem Prinzip
**"nutze zuerst dein eigenes Netzwerk"** und einem **Marktplatz für freie Kapazitäten**.

---

## Ordner-Struktur

```
neuroroute_package/
├── CLAUDE.md          ← WICHTIG: Kontext & Bauanleitung (zuerst lesen!)
├── README.md          ← diese Datei
├── website/           ← 19 fertige HTML-Seiten (Marketing + Prototyp)
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
│   ├── impressum.html     ⚠️ Platzhalter — Anwalt muss prüfen
│   ├── datenschutz.html   ⚠️ Platzhalter — Anwalt muss prüfen
│   └── agb.html           ⚠️ Platzhalter — Anwalt muss prüfen
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

## Website online stellen (Netlify)

1. Auf netlify.com einloggen → "Add new site" → "Deploy manually"
2. Den **ganzen `website/`-Ordner** ins Feld ziehen
3. Fertig — `index.html` ist automatisch die Startseite

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
