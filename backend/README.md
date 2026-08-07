# Neuroroute Backend — Phase 1

Node.js + Express + PostgreSQL. Enthält das, was CLAUDE.md als Phase 1 definiert:
Grundgerüst, Datenbank, Auth mit 4 Rollen und den Kern-Flow
**Anfrage → Angebot → Annahme**, genau so wie `website/app.html` ihn simuliert —
nur mit echter Datenbank statt `window.storage`.

---

## Schnellstart

```bash
cd backend
cp .env.example .env

docker compose up -d          # PostgreSQL 16
npm install
npm run migrate               # Schema anlegen
npm run seed                  # Demo-Daten (siehe unten)
npm run dev                   # http://localhost:3000
```

Kurzer Funktionstest:

```bash
curl http://localhost:3000/health
```

### Demo-Zugänge nach `npm run seed`

Alle mit dem Passwort `neuroroute-demo-2026`:

| E-Mail | Rolle | Firma |
|---|---|---|
| `admin@neuroroute.com` | Admin | — |
| `abnehmer@demo.test` | Abnehmer | Werk Süd GmbH |
| `anbieter@demo.test` | Anbieter | Spedition Nord (bevorzugter Partner) |
| `extern@demo.test` | Anbieter | Fremdfracht AG (außerhalb des Netzwerks) |
| `fahrer@demo.test` | Fahrer | Spedition Nord |
| `neuling@demo.test` | Anbieter | Neuling Logistik (**nicht verifiziert**) |

Der letzte Zugang ist Absicht: damit lässt sich testen, dass eine unverifizierte
Firma nicht handeln kann.

### Tests

```bash
npm run test:setup            # Testdatenbank migrieren (einmalig)
npm test
```

39 Integrationstests gegen eine echte PostgreSQL-Datenbank — keine Mocks.

---

## Der Kern-Flow

Was PROTOTYPE.md als Ablauf beschreibt, in Endpunkten:

```
1. Abnehmer legt Anfrage an          POST /api/requests
2. Anbieter sieht sie                GET  /api/requests          ← Partner zuerst
3. Anbieter gibt Angebot ab          POST /api/requests/:id/offers
4. Abnehmer sieht Angebote           GET  /api/requests/:id/offers
5. Abnehmer nimmt an                 POST /api/offers/:id/accept
   → Anfrage wird "assigned", alle anderen Angebote werden abgelehnt
6. Anbieter sieht seinen Auftrag     GET  /api/requests?view=assigned
7. Admin sieht alles                 GET  /api/admin/stats
```

**„Nutze zuerst dein eigenes Netzwerk"** steckt in Schritt 2 und 4: Ein Abnehmer
pflegt unter `/api/partners` seine bevorzugten Anbieter. Deren Anfragen stehen im
Anbieter-Feed oben (`isPreferredPartner: true`), und in der Angebotsliste des
Abnehmers werden Partner-Angebote vor externen einsortiert.

> Die vollständige Matching-Engine aus Phase 2 — Anfragen für ein Zeitfenster
> **exklusiv** nur an Partner zu zeigen und erst danach für den offenen Markt zu
> öffnen — ist bewusst noch nicht drin. Phase 1 sortiert, Phase 2 filtert.

---

## API

Authentifizierung über ein httpOnly-Session-Cookie. Alle Requests brauchen
`credentials: 'include'`. Fehler haben immer die Form
`{ "error": { "code": "...", "message": "..." } }`.

### Auth

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| POST | `/api/auth/register` | alle | Firma + erster Nutzer (nur `shipper`/`carrier`) |
| POST | `/api/auth/login` | alle | Anmelden |
| POST | `/api/auth/logout` | alle | Abmelden |
| GET | `/api/auth/me` | angemeldet | Aktueller Nutzer |
| POST | `/api/auth/password` | angemeldet | Passwort ändern (meldet andere Geräte ab) |

### Nutzer & Firmen

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| GET | `/api/users` | angemeldet | Kollegen der eigenen Firma |
| POST | `/api/users` | Anbieter, Abnehmer | Kollegen/Fahrer anlegen |
| POST | `/api/users/:id/disable` | Anbieter, Abnehmer, Admin | Zugang sperren |
| GET | `/api/companies` | angemeldet | Verifizierte Firmen (Partnersuche) |
| GET | `/api/companies/:id` | angemeldet | Firmenprofil |
| PATCH | `/api/companies/:id` | eigene Firma, Admin | Stammdaten ändern |

### Partner

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| GET | `/api/partners` | Abnehmer | Bevorzugte Anbieter |
| POST | `/api/partners` | Abnehmer | Partner hinzufügen |
| DELETE | `/api/partners/:carrierCompanyId` | Abnehmer | Partner entfernen |

### Anfragen & Angebote

| Methode | Pfad | Wer | Zweck |
|---|---|---|---|
| POST | `/api/requests` | Abnehmer | Transportanfrage anlegen |
| GET | `/api/requests` | alle | Rollenabhängiger Feed (`?status=`, `?view=assigned`) |
| GET | `/api/requests/:id` | Beteiligte | Einzelne Anfrage |
| POST | `/api/requests/:id/cancel` | Abnehmer | Stornieren (nur solange offen) |
| POST | `/api/requests/:id/offers` | Anbieter | Angebot abgeben |
| GET | `/api/requests/:id/offers` | Abnehmer sieht alle, Anbieter nur eigene | Angebote |
| GET | `/api/offers` | Anbieter | Eigene Angebote |
| POST | `/api/offers/:id/accept` | Abnehmer | Angebot annehmen |
| POST | `/api/offers/:id/withdraw` | Anbieter | Angebot zurückziehen |

### Admin

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/admin/companies` | Firmen, offene Verifizierungen zuerst |
| POST | `/api/admin/companies/:id/verification` | Freischalten / ablehnen |
| GET | `/api/admin/users` | Alle Nutzer |
| GET | `/api/admin/stats` | Kennzahlen fürs Dashboard |

### Beispiel

```bash
# Anmelden, Cookie merken
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"abnehmer@demo.test","password":"neuroroute-demo-2026"}'

# Anfrage anlegen
curl -b cookies.txt -X POST http://localhost:3000/api/requests \
  -H 'Content-Type: application/json' \
  -d '{"origin":"Hamburg","destination":"München","mode":"road",
       "cargo":"18 Paletten","weightKg":12400,"pickupDate":"2026-09-01"}'
```

---

## Entscheidungen, die von CLAUDE.md abweichen

**Sessions selbst gebaut statt Auth0 / Clerk / Lucia.** CLAUDE.md empfiehlt einen
fertigen Anbieter. Dagegen sprachen drei Dinge: Lucia wurde inzwischen eingestellt,
der Autor empfiehlt genau das hier umgesetzte Muster. Auth0 und Clerk sind
Auftragsverarbeiter — zusätzlicher AVV, Kosten und personenbezogene Daten außerhalb
der eigenen Infrastruktur, während CLAUDE.md EU-Hosting verlangt. Und ein Logout
oder eine Sperrung muss **sofort** wirken; ein signiertes JWT gilt bis es abläuft,
egal was die Datenbank sagt.

Konkret: undurchsichtige Zufalls-Tokens (256 Bit), in der Datenbank liegt nur ihr
SHA-256-Hash, Passwörter über `scrypt` aus der Node-Standardbibliothek mit
Parametern im Hash-String (später erhöhbar, ohne bestehende Passwörter zu
entwerten). Wenn SSO für Firmenkunden dazukommt, ist ein Anbieter wieder eine
sinnvolle Option.

**Express statt Fastify.** Beides ist in CLAUDE.md genannt; Express ist
verbreiteter, und Luis findet dafür mehr Material.

---

## Aufbau

```
backend/
├── src/
│   ├── index.js          Start, Shutdown, Session-Aufräumen
│   ├── app.js            Express-App, Middleware-Kette, Routen
│   ├── config.js         Konfiguration aus Umgebungsvariablen
│   ├── db.js             Verbindungspool, transaction()
│   ├── auth/             Passwörter, Sessions, Rollen-Guards, Rate-Limit
│   ├── routes/           Ein Router je Themengebiet
│   └── lib/              Fehlertypen, Validierung (zod)
├── db/
│   ├── migrate.js        Migrationsrunner (--reset, --status)
│   └── migrations/       Nummerierte SQL-Dateien
├── scripts/              seed.js, create-admin.js
└── tests/                Integrationstests
```

### Wo die Regeln sitzen

Wichtige Invarianten stehen **in der Datenbank**, nicht nur im Anwendungscode —
ein Bug in einem Handler kann sie dann nicht umgehen:

- `offers_one_accepted_per_request` — pro Anfrage kann höchstens ein Angebot
  angenommen sein. Das macht doppelte Vergabe auch bei gleichzeitigen Requests
  unmöglich; ein Test provoziert genau diesen Fall.
- `offers_one_live_per_carrier` — ein Anbieter hat pro Anfrage höchstens ein
  aktives Angebot, kann aber zurückziehen und neu bieten.
- `requests_assignment_consistent` — eine Anfrage ist entweder unvergeben oder
  vollständig vergeben. Kein Zustand mit Anbieter, aber ohne Preis.

Beträge liegen als **ganze Cent** in `bigint`-Spalten. Nie als Fließkommazahl:
`0.1 + 0.2` ist nicht `0.3`, und Frachtpreise landen in Rechnungen.

---

## Admin anlegen

Admins lassen sich absichtlich nicht über die API registrieren:

```bash
ADMIN_PASSWORD='...' node scripts/create-admin.js "Vorname Nachname" admin@neuroroute.com
```

Ohne `ADMIN_PASSWORD` wird ein Passwort erzeugt und einmalig ausgegeben.

---

## Vor dem Produktivbetrieb

Nicht vergessen, sonst geht es beim ersten echten Kunden schief:

- `NODE_ENV=production` setzen — schaltet `secure`-Cookies und knappe
  Fehlermeldungen ein und sperrt `migrate --reset` sowie den Seed.
- `DATABASE_URL` auf eine EU-Datenbank mit TLS (Frankfurt, siehe CLAUDE.md).
- `CORS_ORIGINS` auf die echte Domain, ohne `localhost`.
- Das Login-Rate-Limit liegt im Arbeitsspeicher. Bei mehr als einer Instanz
  muss es nach Redis oder Postgres wandern, sonst multipliziert es sich.
- Backups der Datenbank. Angebote und Vergaben sind Geschäftsunterlagen.

## Was als Nächstes kommt (Phase 2)

Die Tabellen `capacity` und `marketplace_listings` sind bereits angelegt und
werden vom Seed gefüllt — die Endpunkte dazu sind der nächste Schritt:

1. Matching-Engine: Exklusivfenster für bevorzugte Partner, danach offener Markt.
2. Empty Capacity Marketplace: Kapazität eintragen, Leerfahrt erkennen,
   mit einem Klick veröffentlichen.
