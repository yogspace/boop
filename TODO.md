# Todo

Stand: 12.10.2026

## Wünsche (als Nächstes)

- **3D-Stempel im Cartoon-Stil rendern** – nur die 3D-Elemente, nicht die
  Seite. Gemeint ist der „gezeichnete“ Look von 3D-Renderfiltern (Referenz:
  3D-Szenen mit Tuschelinien, nur als Stilvorlage): ganz flache Farben ohne
  Glanz und Verlauf, dazu kräftige schwarze Linien – am Umriss UND innen,
  zwischen den Teilen (Griff, Block, Gummi) und an den Kanten des Reliefs –,
  leicht unruhig wie von Hand gezogen.
  - Zwei Probeläufe in WebKit (außerhalb des Repos): flache Farben gehen
    sofort (unbeleuchtetes Material). Die einfache Kontur über aufgeblasene
    Rückseiten (`OutlineEffect`) reicht nicht: dünn ist sie zu zaghaft, dick
    franst sie am Relief aus und verdoppelt Linien.
  - Richtiger Weg: die Linien im Bild finden statt am Modell – ein zweiter
    Durchgang, der Kanten aus Tiefe, Flächenrichtung und Teil-Kennung zieht
    (Kantenfilter) und als gleichmäßig dicke Tuschelinie über die flachen
    Farben legt; dann leicht verwackeln (wie die Scribble-Rahmen).
  - Betrifft alles, was Stempel rendert: Bilder (`render.ts`), die Ansicht
    im Editor (`sticker-view.tsx`), den Stempel am Cursor
    (`stamp-hand.tsx`); die Materialien kommen aus `build.ts`.
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

- **CMS-Farben: im Code komplett umgestellt, aber noch nicht im Browser
  getestet.** Zuerst prüfen: Registrieren (legt den persönlichen Kalender
  an) und einen neuen Kalender/Stempel anlegen – die Standardfarbe kommt
  jetzt aus einem Feld-Default, der das Site-Global liest
  (`calendar/color-field.ts`); greift der nicht, schlägt das Anlegen fehl.
  Danach: im Admin eine Farbe neu anlegen, eine ändern, eine löschen und
  schauen, ob Farbwähler, Stempelkissen, Abdrücke und 3D-Stempel folgen.
  Bekannt: schon gerenderte Stickerbilder wechseln die Farbe erst nach
  einem Reload.
- **Scribble-Redesign ausrollen** auf Tagesansicht (`day-sheet.tsx`),
  Stempel-Editor (`stamp-drawer.tsx`), Stempel-Detail (`stamp-sheet.tsx`)
  und die 3D-Bühne (`sticker-view.tsx`) – die nutzen noch die alten
  Farbklassen. Bausteine dafür: die `scribble…`-Klassen in `styles.css` und
  `ROUND_BUTTON`, `PILL`, `BADGE`, `FIELD_BOX` aus `components/ui.tsx`.
  Danach die Übergangs-Aliasse (`*-soft`, `shadow-sticker*`) löschen.
- **Altes Lila außerhalb der Seite**: `themeColor`, Web-Manifest, OG-Bild,
  `icon.svg`.

## Noch selbst prüfen

- Admin, eingeloggt: Site → Stamp colors (Farbwähler und Vorschau).
- Echtes Safari / iPhone – bisher nur WebKit ohne Fenster getestet.
- Touch: Stempeln, Drehen und der Editor mit dem Finger.

## Ideen am Rand

- Jede besuchte Kalender-Adresse (`/de/app/{id}`) wird als eigene Seite
  gecacht; ein Rewrite auf `/de/app` würde das sparen.
- Beim flachen Winkel der Stickerbilder schaut der Griff nicht mehr hervor
  (`FACE_TURN` in `render.ts`).
