# Todo

Stand: 12.10.2026

## Offen

- **Mails noch im alten Look**: `lib/mail-layout.ts` (Papier, Tinte,
  Button noch lila) – auf Papierweiß/Tinte wie die Seite.
- **Im Admin gelöschte Kalender** räumen ihre Abdrücke nicht ab – das tut
  nur das Löschen über die App (`sync/apply.ts`). Ein Hook an `calendars`
  (beim Löschen oder `deleted` setzen) fehlt.
- **Stickerbilder** werfen noch einen Schatten im alten Tintenton
  (`sticker.tsx`, `rgba(29,27,58,…)`) – passt nicht zu „keine Schatten“.
- **Stempelfarben im CMS**: Wer die Zeilen unter „Site“ → Stamp colors
  schon gespeichert hat, hat dort noch „Tinte“ als erste Farbe – von Hand
  auf Rot ändern (Schlüssel `red`, `#ee3b33`).

## Noch selbst prüfen

- Echtes Safari / iPhone – bisher nur WebKit ohne Fenster getestet.
- Touch: Stempeln, Drehen und der Editor mit dem Finger.

## Ideen am Rand

- Jede besuchte Kalender-Adresse (`/de/app/{id}`) wird als eigene Seite
  gecacht; ein Rewrite auf `/de/app` würde das sparen.
- Beim flachen Winkel der Stickerbilder schaut der Griff nicht mehr hervor
  (`FACE_TURN` in `render.ts`).
