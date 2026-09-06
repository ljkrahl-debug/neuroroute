# Deployment auf Railway

Kurze Antwort: **ja, Railway passt.** Node + PostgreSQL, Deploy direkt aus dem
Git-Repo, Datenbank per Klick daneben. Genau der Zuschnitt für einen MVP, den
5–10 Speditionen testen sollen.

Diese Anleitung führt einmal komplett durch. Es gibt **zwei Punkte, die man
vorher wissen muss** — beide stehen ganz unten unter „Was ihr entscheiden müsst",
und einer davon ist rechtlich, nicht technisch.

---

## 1. Was schon vorbereitet ist

| Datei | Zweck |
|---|---|
| `railway.json` | Build, Start, Migration vor dem Deploy, Healthcheck |
| `.node-version` | Node 22 festgenagelt, damit Railway nicht irgendwann wechselt |
| `package-lock.json` | eingecheckt — `npm ci` installiert exakt das Getestete |
| `scripts/check-deploy.js` | prüft die Produktivkonfiguration, bevor ihr live geht |

Der Code selbst ist vorbereitet auf: `PORT` von Railway, Postgres über das
private Netzwerk, `SIGTERM`-Shutdown ohne abgeschnittene Requests, sichere
Cookies über zwei Subdomains und einen Startup-Check, der bei gefährlicher
Konfiguration **gar nicht erst startet**.

---

## 2. Schritt für Schritt

### 2.1 Projekt und Datenbank anlegen

1. Auf [railway.com](https://railway.com) einloggen → **New Project**
2. **Deploy from GitHub repo** → dieses Repo wählen
3. Im Service unter **Settings → Root Directory** `backend` eintragen.
   Ohne das versucht Railway, das Repo-Root zu bauen, in dem nur die Website liegt.
4. **Region** auf **EU West (Amsterdam)** stellen — siehe Abschnitt 4.
5. Im Projekt **+ New → Database → PostgreSQL** hinzufügen.

### 2.2 Umgebungsvariablen setzen

Im API-Service unter **Variables**:

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGINS=https://neuroroute.com
PUBLIC_API_ORIGIN=https://api.neuroroute.com
COOKIE_DOMAIN=.neuroroute.com
```

`${{Postgres.DATABASE_URL}}` ist eine Referenz auf den Datenbank-Service —
so bleibt die Verbindung im privaten Netz von Railway und die Zugangsdaten
stehen nirgends doppelt.

`PORT` **nicht** setzen, das macht Railway selbst.

### 2.3 Eigene Domain verbinden (nicht optional — siehe unten)

Im API-Service **Settings → Networking → Custom Domain**: `api.neuroroute.com`.
Railway zeigt einen CNAME-Eintrag, den ihr beim Domain-Anbieter hinterlegt.

### 2.4 Ersten Admin anlegen

Die Migrationen laufen automatisch beim Deploy. Den ersten Admin gibt es
absichtlich nicht über die API — einmalig per Railway-CLI:

```bash
npm i -g @railway/cli
railway login
railway link                      # Projekt auswählen
railway run --service <api> node scripts/create-admin.js "Vorname Nachname" admin@neuroroute.com
```

Das Passwort wird einmal ausgegeben. **Sofort in einen Passwortmanager.**

### 2.5 Prüfen

```bash
railway run --service <api> npm run check:deploy
curl https://api.neuroroute.com/health
```

`check:deploy` prüft Konfiguration, Datenbank, Migrationen, ob ein Admin
existiert — und ob versehentlich Demo-Daten in der Produktivdatenbank liegen.

**`npm run seed` niemals in Produktion.** Das Skript weigert sich bei
`NODE_ENV=production`, aber trotzdem: nicht versuchen.

---

## 3. Die Cookie-Falle

Das ist der Fehler, der sonst erst nach dem Launch auffällt, weil er wie ein
zufälliger Bug aussieht: **Login klappt scheinbar, aber der Nutzer ist sofort
wieder ausgeloggt.**

Grund: Die Session steckt in einem Cookie mit `SameSite=Lax`. Läuft die App auf
`neuroroute.com` und die API auf `neuroroute-api.up.railway.app`, sind das für
den Browser **zwei verschiedene Sites**. Das Cookie wird bei jedem API-Aufruf
der App schlicht nicht mitgeschickt.

Lösung, die hier vorbereitet ist: die API auf eine **Subdomain derselben Domain**
legen (`api.neuroroute.com`) und `COOKIE_DOMAIN=.neuroroute.com` setzen. Dann
sind es dieselbe Site und alles funktioniert.

Der Startup-Check erkennt genau diese Konstellation und **verweigert den Start**
mit einer Erklärung, statt still kaputtzugehen. Wer die API partout nicht auf
eine Subdomain legen kann, setzt `COOKIE_SAMESITE=none` — funktioniert, ist aber
anfälliger für Browser-Beschränkungen bei Drittanbieter-Cookies.

---

## 4. Was ihr entscheiden müsst

### 4.1 DSGVO: Amsterdam statt Frankfurt

CLAUDE.md sagt „Daten in der EU hosten (Frankfurt)". Railways EU-Region ist
**Amsterdam, Niederlande** (`europe-west4`). Das ist EU und damit im Sinne der
DSGVO unproblematisch — aber es ist eben **nicht Frankfurt**. Wenn „Frankfurt"
in einer Zusage an Kunden oder in einem Vertragsentwurf steht, muss das
angepasst werden.

Zweiter Punkt, wichtiger: **Railway ist ein US-Unternehmen.** Damit ist es
Auftragsverarbeiter im Sinne von Art. 28 DSGVO, und ihr braucht einen
Auftragsverarbeitungsvertrag mit Standardvertragsklauseln. Ob Railway einen
anbietet und ob er reicht, kann ich nicht beurteilen — **das ist eine Frage für
Jennifer, bevor echte Kundendaten drauf liegen.**

Falls das ein Problem wird, sind Hetzner (Nürnberg/Falkenstein) oder Scaleway
(Paris) die naheliegenden EU-Alternativen. Der Code läuft dort genauso; nur
`railway.json` wäre dann eine andere Konfigurationsdatei. Nichts davon ist eine
Einbahnstraße.

### 4.2 Kosten

Railway rechnet nutzungsbasiert ab, zusätzlich zum Plan:

| Plan | Fix | Enthalten |
|---|---|---|
| Free | 0 $ | 1 $ Guthaben/Monat — zum Ausprobieren, nicht für Kunden |
| Hobby | 5 $/Monat | 5 $ Guthaben |
| Pro | 20 $/Monat je Workspace | 20 $ Guthaben |

Verbrauch danach etwa 10 $ pro GB RAM/Monat, 20 $ pro vCPU/Monat, 0,15 $ pro GB
Volume. Für dieses Backend plus kleine Datenbank ist **Hobby realistisch**, also
grob **5–15 $/Monat** am Anfang. Ein Pilot mit 5–10 Speditionen sprengt das nicht.

Für echte Kundendaten würde ich trotzdem **Pro** empfehlen, sobald es ernst wird:
Hobby hat keine SLA, und die Datenbank ist dann Geschäftsgrundlage.

> Preise ändern sich. Vor dem Buchen auf railway.com/pricing gegenprüfen —
> die Zahlen hier sind der Stand bei Erstellung dieser Datei.

### 4.3 Backups

Railway macht Datenbank-Backups, aber prüft die Einstellung im Postgres-Service
und macht einen **Restore-Test**, bevor echte Aufträge drin liegen. Angebote und
Vergaben sind Geschäftsunterlagen — ein Backup, das noch nie zurückgespielt
wurde, ist kein Backup.

---

## 5. Wenn etwas nicht geht

| Symptom | Ursache |
|---|---|
| Build findet `package.json` nicht | Root Directory steht nicht auf `backend` |
| Deploy bricht bei „pre-deploy" ab | Migration fehlgeschlagen — Logs des Postgres-Service ansehen |
| `/health` liefert 503 | API läuft, Datenbank nicht erreichbar: `DATABASE_URL` prüfen |
| Start bricht sofort ab | Startup-Check hat etwas gefunden — die Meldung nennt es genau |
| Login klappt, danach 401 | Die Cookie-Falle aus Abschnitt 3 |
| CORS-Fehler im Browser | Die Origin der App fehlt in `CORS_ORIGINS` (exakt, mit `https://`) |
