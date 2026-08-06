# Prototyp-Dokumentation (app.html)

Diese Datei erklärt, wie der klickbare Prototyp funktioniert — als **funktionale
Spezifikation** für die echte Software.

## Grundprinzip

`app.html` ist eine Single-Page-Simulation. Sie speichert alles in `window.storage`
(browser-lokal). Kein Backend, kein Server, keine echte Datenbank. Beim echten Bau
wird `window.storage` durch echte API-Calls an ein Backend ersetzt.

## Die 4 Rollen und ihre Seiten

### Admin (Farbe: indigo)
- **dashboard** — Übersicht über alle Aktivitäten
- **users** — Nutzerverwaltung
- **verify** — Firmen verifizieren (Freischaltung)
- **orders** — alle Aufträge im System
- **billing** — Abrechnung & Provisionen

### Anbieter / Carrier (Farbe: amber)
- **dashboard** — Übersicht
- **requests** — eingehende Transportanfragen (kann Angebote abgeben)
- **myorders** — übernommene Aufträge
- **capacity** — Kapazitätsplanung (zukünftige Transporte, Leerfahrt-Erkennung)
- **marketplace** — eigene Kapazität anbieten + fremde durchsuchen
- **fleet** — Flotte & Fahrer verwalten
- **profile** — eigenes Firmenprofil

### Abnehmer / Verlader (Farbe: cyan)
- **dashboard** — Übersicht
- **neworder** — neuen Transportauftrag erstellen
- **myrequests** — eigene Anfragen verfolgen
- **marketplace** — vergünstigte Kapazitäten finden
- **partners** — bevorzugte Partner verwalten

### Fahrer (Farbe: green)
- **dashboard** — aktuelle Tour
- **history** — vergangene Fahrten

## Der zentrale Flow (Cross-Rollen)

Das ist das Herzstück — die echte Software muss genau das können:

```
1. ABNEHMER erstellt Transportauftrag (neworder)
        ↓
2. System matcht: zuerst bevorzugte PARTNER, dann externe ANBIETER
        ↓
3. ANBIETER sieht die Anfrage (requests) und gibt ein Angebot ab
        ↓
4. ABNEHMER sieht das Angebot (myrequests) und nimmt es an
        ↓
5. FAHRER bekommt die Tour (dashboard) und meldet Status-Updates
        ↓
6. Status läuft ins TRACKING zurück — alle Beteiligten sehen den Fortschritt
        ↓
7. ADMIN sieht alles, verifiziert, rechnet Provisionen ab (billing)
```

## Der Marktplatz-Flow (Empty Capacity)

```
1. ANBIETER trägt zukünftige Transporte ein (capacity)
        ↓
2. System erkennt Leerfahrten (z.B. leere Rückfahrt)
        ↓
3. System fragt: "Freie Kapazität auf dem Marktplatz anbieten?"
        ↓
4. Mit 1 Klick wird die Kapazität veröffentlicht (marketplace)
        ↓
5. Andere Firmen (Abnehmer + Anbieter) sehen & buchen sie vergünstigt
```

## Daten-Objekte im Prototyp

Diese Strukturen zeigen, welche Felder das echte Datenbank-Schema braucht:

- **request** (Transportanfrage): id, from, to, mode, cargo, shipper, carrier,
  status, accepted (Preis), stage
- **offer** (Angebot): id, requestId, carrier, price
- **user/company**: id, name, type, status (verified/pending/review)
- **capacity** (geplanter Transport): id, from, to, date, mode, cap, util,
  recurring, returnEmpty
- **market_listing** (Marktplatz-Angebot): id, from, to, mode, detail, price,
  old (Normalpreis), disc (Rabatt %), by (Firma)

## Wichtig beim echten Bau

- Der Rollen-Umschalter oben rechts ist nur zum Testen — in echt hat jeder Nutzer
  genau eine Rolle (oder wenige), festgelegt durch sein Konto.
- Die Seed-Daten (Beispieldaten) im Prototyp sind erfunden — dienen nur der Demo.
- Das Verhalten und die Abläufe sind aber real gemeint: So soll die Software laufen.
