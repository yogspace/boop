# Todo

Stand: 12.10.2026

## Wünsche (als Nächstes)

- **3D-Stempel im Cartoon-Stil** (wie Adventure Time): flache Farbflächen
  statt Glanz, dazu eine schwarze Kontur. Machbar – ein Probelauf mit
  Toon-Shading (`MeshToonMaterial`, zwei Tonstufen) und Kontur
  (`OutlineEffect` aus three.js) lief in WebKit. Noch zu tun: Kontur dicker,
  Schatten flacher, Kontur auch an den Kanten des Reliefs. Betrifft die
  Materialien in `src/features/stickers/build.ts` und alle Stellen, die
  rendern (`render.ts`, `sticker-view.tsx`, `stamp-hand.tsx`). Passt zum
  Scribble-Look der Seite.
- **Rahmenmuster wählbar** (Bordüre): statt nur dem glatten Rand ein Muster,
  z. B. gestrichelt, gepunktet, Wellen, Zacken, doppelte Linie. Im Editor
  auswählen; gilt für Zeichnung, Abdruck und den erhabenen Rand am
  3D-Gummi. Am Stempel speichern wie „invertiert“ (in der Zeichnung).

- **Special-Stempel** für einmalige Erlebnisse. Entschieden:
  - Es glitzert beides: der Abdruck auf dem Tag und der 3D-Stempel.
  - Mehrmals setzbar – „besonders“, nicht auf einen Abdruck begrenzt.
  - Etwa 30 % größer als ein normaler Abdruck: spürbar, nicht riesig.
  - Noch offen: wie er in der Monatsansicht auffällt (Annahme: dort ebenfalls
    etwas größer und mit Glitzer, solange es in die Tageszelle passt).

## Offen aus der laufenden Runde

- **App ganz auf die CMS-Farben umstellen**: Farbwähler im Editor,
  Kalenderfarben, Stempelkissen und die Prüfung auf dem Server nutzen noch
  die sieben festen Farben; in den Collections sind `color`/`ink` noch
  Auswahlfelder. Bis dahin wird eine im CMS neu angelegte Farbe abgelehnt
  (bestehende ändern geht schon).
- **Scribble-Redesign ausrollen** auf Tagesansicht, Stempel-Editor und
  Stempel-Detail.
- **Aufräumen**: die alte „press“-Pose (`render.ts`, `pose()` in
  `build.ts`), sobald die Tagesansicht nur noch den Live-Stempel nutzt.

## Noch selbst prüfen

- Admin, eingeloggt: Site → Stamp colors (Farbwähler und Vorschau).
- Echtes Safari / iPhone – bisher nur WebKit ohne Fenster getestet.
- Touch: Stempeln, Drehen und der Editor mit dem Finger.

## Ideen am Rand

- Jede besuchte Kalender-Adresse (`/de/app/{id}`) wird als eigene Seite
  gecacht; ein Rewrite auf `/de/app` würde das sparen.
- Beim flachen Winkel der Stickerbilder schaut der Griff nicht mehr hervor
  (`FACE_TURN` in `render.ts`).
