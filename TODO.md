# Todo

Stand: 12.10.2026

## Offen

- **Stempelfarben im CMS**: Wer die Zeilen unter „Site“ → Stamp colors
  schon gespeichert hat, hat dort noch „Tinte“ als erste Farbe – von Hand
  auf Rot ändern (Schlüssel `red`, `#ee3b33`).

- **Benachrichtigungen (PWA, Web Push)**:
  - Tägliche Erinnerung ans Stempeln.
  - Nachricht, wenn jemand in einem geteilten Kalender gestempelt hat.
  - Beides je Kalender abschaltbar (Einstellungen pro Kalender).
  - Braucht: Push-Abo im Service Worker, VAPID-Schlüssel, Abos am Account,
    einen Cron für die Erinnerung; auf dem iPhone nur als installierte App.
- **Widget für Apple** (Idee): ginge nur mit einer nativen Hülle, nicht als
  PWA.

## Noch selbst prüfen

- Echtes Safari / iPhone – bisher nur WebKit ohne Fenster getestet.
- Touch: Stempeln, Drehen und der Editor mit dem Finger.

## Ideen am Rand

- Jede besuchte Kalender-Adresse (`/de/app/{id}`) wird als eigene Seite
  gecacht; ein Rewrite auf `/de/app` würde das sparen.
- Beim flachen Winkel der Stickerbilder schaut der Griff nicht mehr hervor
  (`FACE_TURN` in `render.ts`).
