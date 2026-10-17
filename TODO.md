# Todo

Stand: 17.10.2026

## Als Nächstes

1. **Deploy** – danach im Deploy-Log „✓ Pages refreshed“ (erst dann zeigen
   die Seiten Farben, Formen und Texte aus dem CMS; das Image wird ohne
   Datenbank gebaut). Dann im CMS:
   - Seeds → Translations (neue Texte). Falls unter Translations schon
     gespeichert: `app.settings.own.colorMember` und `startText` (de/en)
     anpassen – gilt jetzt „auf all deinen Geräten“.
   - Seeds → „Imprint & privacy“ mit „Replace“ – neu darin u. a. bearbeitete
     Stempel (Kopien ziehen mit), Kalender-Einstellungen am Konto, Bilder
     der 3D-Stempel auf dem Gerät.
   - Seeds → „Stamp shapes“ und „Drawing templates“ je einmal „Fill“ – jetzt
     eigene Collections unter Content; Fill übernimmt die Listen aus Site.
     Bis dahin zeigt die App die Formen aus dem Code.
   - Site → Stamp colors: Sonderfarben anlegen, „Public“ aus, „Finish“
     setzen – z. B. Gold `#d4a72c` (metal), Glitzer `#c264d6` (glitter).
2. **Refactor** – Dateien über 700 Zeilen aufteilen (`stamp-drawer.tsx`,
   `day-page.tsx`, `boop-app.tsx`, `month-grid.tsx`, `store.ts` …).
   Performance dabei: Server-Komponenten wo es geht, Client nur in kleinen
   Hüllen; schwere Teile (three.js, Editor, Sheets) erst bei Bedarf laden.
   Die App selbst lebt offline von den Daten auf dem Gerät – der Server kann
   dort nur das Gerüst vorrendern.
3. **Geschenke als 3D-Päckchen im Regal** – ein Geschenk von Boop kommt
   eingepackt an: im Regal als Päckchen (3D, Schleife, im Ton des Stempels),
   auf dem Stempelhaufen neben „Hallo Max!“ obenauf. Antippen → auspacken
   (Deckel fliegt, Glitzer, der Stempel steigt heraus) → normaler Stempel.
   Kein Popup mehr beim Öffnen der App; Push führt ins Regal. Eingepackt
   nicht in der Ablage zum Stempeln. „Ausgepackt“ am Stempel (synct); alte
   Geschenke gelten als ausgepackt. Karten bleiben, wie sie sind.

## Offen

- **Geschenk anlegen prüfen**: In einem Probelauf (`payload run`) scheiterte
  `payload.create` für `gifts` am lokalisierten Namen („Cast to Embedded“).
  Kann am Probelauf liegen – nach dem Deploy einmal ein Geschenk an alle
  schicken; klappt das, ist es erledigt.
- **Monatsansicht „gradlinig“**: Gerade Linien heißt, der Zeichner
  (`components/scribble-draw.ts`) läuft nicht. Lokal und auf boop.mxwr.de
  (Startseite) zeichnet er – wo genau ist es aufgefallen?
- **Web Push** – live (Schlüssel in GitHub, Cron alle 15 Minuten). Auf einem
  Gerät testen: Kalender-Einstellungen → „Benachrichtigungen einschalten“
  (iPhone: nur in der installierten App), zweites Konto stempelt →
  Nachricht; Erinnerung zur eingestellten Uhrzeit; Einladung → Push, Tippen
  öffnet die App, Kästchen im Konto aus → nichts. Optional `VAPID_SUBJECT`
  (z. B. `mailto:…`). Schlüssel nie wechseln – das macht alle Abos stumm.
- **Automatisches Löschen**: vor dem ersten echten Lauf einmal
  `/next/cron/cleanup?dry=1` aufrufen – der erste Lauf löscht unbestätigte
  Konten, die älter als 30 Tage sind.
- **Rechtlich gegenlesen lassen**:
  - Einladungsmails an Leute ohne Konto (Werbesatz über Boop in der Mail).
  - Resend: AV-Vertrag, Drittland-Grundlage, deren Log-Fristen.
  - Server-Logfiles: Caddy schreibt kein Access-Log – der Absatz beschreibt
    womöglich Logs, die es nicht gibt. Backups fehlen im Text.
  - „Anonyme“ Statistik: „Konto erstellt“ ließe sich über den Zeitpunkt
    einem Konto zuordnen.
  - Löschvermerke bleiben unbegrenzt gespeichert.
  - Mindestalter / Kinder.

## Auf echten Geräten prüfen

Bisher fast alles nur in WebKit ohne Fenster getestet – vor allem echtes
Safari / iPhone und die installierte App.

### Tagesseite und Stempeln

- Breit zwei Spalten: links Blatt, darunter Rückgängig / Wiederholen /
  Entfernen, dann die Notiz (B/I/U links); rechts Stempelkissen, Drehen,
  Hinweis, Ablage. Handy: Schalter „Blatt/Notiz“ neben dem Datum und
  Wischen zwischen beiden.
- Ablage: „Neuer Stempel“ am Ende, „Alle Stempel →“ führt ins Regal (aus dem
  Tages-Sheet: schließt es sauber), Sortieren, Namen unter den Stempeln
  (Touch), Namensschild beim Hover (Chrome, gescrollte Seite).
- Gradzahl antippen → Drehung auf 0° (in der Hand und beim Abdruck, mit
  Rückgängig).
- Stempeln: ausholen, aufschlagen, abheben – Tempo und Größen als `BEAT`,
  `RAISE`, `HOP` oben in `stamp-hand.tsx`; der kleine 3D-Stempel verschwindet
  nach dem Druck; der glatte Knauf auch in der Hand.
- Abdruck erst antippen, dann ziehen; mit Entf / ⌫ löschen (⌫ ohne
  Markierung löst im Browser kein „Zurück“ aus). Über dem Blatt scrollt
  Wischen die Seite, solange kein Stempel in der Hand ist.
- Tages-Sheet aus Monat/Jahr auf großen Bildschirmen: breiter, vier Stempel
  pro Reihe, alle Stempelkissen in einer Zeile.
- Tagesnotiz mit Server und zweitem Gerät: kommt sie an, gewinnt die
  spätere Änderung, zwei Geräte offline in dieselbe Notiz? iPhone:
  Autokorrektur, Diktat, bleibt die Tastatur bei B/U offen?

### Monat und Jahr

- Kalender in voller Breite, der Monat höchstens so breit, dass alle Wochen
  ins Fenster passen. Abdrücke als Haufen, „+n“ im Kalenderton.
- Special-Tag im Monat auf dem Phone (kleine Zellen), Hover-Fleck mit dem
  Finger.
- Jahresansicht per Tastatur: ein Tab-Stopp, Pfeiltasten Tag/Monat, Enter.

### Editor

- Speichern auf dem Handy: zeichnen, ganz runter, „Fertig – mach ihn 3D“ →
  Titel, 3D-Stempel, „Weiter malen“, Name, Speichern sichtbar; Return auf
  der Tastatur speichert. Ebenso „Änderungen speichern“ beim Bearbeiten.
  Stört der kleine Sprung (~48 px) beim Wechsel in diesen Schritt?
- Beim Malen scrollen: Zeichenfläche und Leiste darunter (Rückgängig /
  Wiederholen links, Papierkorb rechts) bleiben oben, der Rest läuft
  darunter weg; zwei Finger zoomen, Lupe geht weiter.
- Punkte antippen (Ring drum) und ziehen, Griff neben einem Anker greifen.
  Lupe darf über den Rand, springt nicht, gleitet oben unter Uhr/Notch zur
  Seite. Noch weiße Streifen beim schnellen Malen?
- Formwechsel morpht wieder. Briefmarke: helle Nähte im Rand? (WebKit zeigt
  die ab ~256 Punkten, ihr Umriss hat 685.)
- Werkzeuge: Radierer (E), Auswahl (V: verschieben, skalieren, drehen,
  ⌥-Ziehen dupliziert, Pfeiltasten, ⌘D, Entf), Zentrierhilfen (⌘ aus),
  Strichstärke einer Auswahl. Linie (L): Klick = Ecke, Ziehen = Kurve, ⇧ =
  45°, Klick auf den ersten Punkt schließt, Enter beendet, ⌫ nimmt den
  letzten Punkt weg. Punkte bearbeiten (A / Doppelklick): ⌥-Klick
  rund/eckig, Klick auf die Linie fügt einen Punkt ein, ⌥ beim Ziehen bricht
  Griffe. Apple Pencil (Finger zoomen dann).
- Neue Formen (Oval, Blume, Herz, Wolke, Stern, Ticket, Briefmarke) in 2D,
  3D und im STL-Slicer; Vorlagen hineinziehen (Desktop) bzw. antippen.
- „Weiter malen“: der 3D-Stempel fliegt zurück in die Zeichnung.

### Regal, Stempel, Karten, Geschenke

- Stempelhaufen neben „Hallo Max!“: 3D-Bilder blenden ruhig ein, fächern
  beim Hover auf; „Hallo Maximilian!“ bricht um, der Haufen bleibt rechts.
- Regal-Seite `/de/app/stempel`: „← Kalender“ führt zum zuletzt gezeigten
  Kalender, Wisch-Zurück dazwischen, in der installierten App (kein
  Browser-Zurück) und offline starten. Sortieren (u. a. „Nach Person“, erst
  mit Stempeln von anderen).
- 3D-Stempel laden ohne Ruckeln; nach dem Neuladen sofort da.
- Stempel schauen dich beim Hover an (Regal, Startseite, Feature-Karten) –
  mit echter GPU; auf dem Phone nicht.
- Stempel bearbeiten: Stempel-Sheet → „Bearbeiten“ → „Änderungen
  speichern“; alle Abdrücke ändern sich mit; Kopien bei anderen (Karte,
  Geschenk) ziehen nach, ihr Name bleibt. Zurück / Reload in
  `…/stempel-bearbeiten`; die Frage beim Schließen nur nach Änderungen.
- Stempel umbenennen: kommt der Name auf dem zweiten Gerät an?
- Stempel-Karten: „Als Karte verschicken“, Link im Messenger (Vorschaubild),
  Kartenseite mit Tapete auf dem iPhone, „In meine Stempel“ (abgemeldet:
  erst anmelden), „Für den 3D-Drucker (STL)“, „Geteilt mit“, „Ansehen“,
  „Zurückziehen“ macht den Link tot.
- Geschenk von Boop: als Admin in Sonderfarbe zeichnen (Picker zeigt sie
  nur dir), Stempel-Sheet → „Geschenk von Boop“ → „An alle verschicken“;
  Popup in der App, Push; im CMS unter Content → Gifts. Glitzer und Metall
  in 3D (`stickers/ink.ts`).
- STL im echten Slicer: steht auf der Gummifläche, Knauf oben; größere
  Vertiefungen brauchen Stützen „nur vom Druckbett“.

### Kalender, Einladungen, Konto

- Eigene Kalenderfarbe und Startansicht jetzt am Konto: auf dem Handy
  ändern, auf dem Desktop neu laden – gleich?
- Kalender-Einstellungen gegen den Server: Mitglied entfernen, verlassen
  (eine Nachfrage), einladen, löschen (doppelte Nachfrage, rot).
- Kalenderfarben: alle einmal ansehen, vor allem Gelb und auf dem Phone;
  der Hintergrund blendet beim Wechsel weich über; in der installierten App
  Statusleiste und Überscrollen (`statusBarStyle` in `layout.tsx` ist noch
  „default“).
- Einladung zwischen zwei Konten: Popup beim Öffnen, „Später“, Liste oben
  im Konto, Annehmen springt in den Kalender, Ablehnen verschwindet beim
  Besitzer aus „ausstehend“; Mail-Link tritt bei, Anmelden allein nicht.
- Konto-Kreis: Zahl = offene Einladungen; Punkt erst, wenn Änderungen
  länger als 5 s warten; Kreuz ohne Netz. Menü schließt bei Klick daneben.
- Konto-Sheet: Profil, App (Sprache, Abgleich mit „Jetzt abgleichen“),
  Benachrichtigungen, Deine Daten; „Konto löschen“ rot.
- Konto gegen den Server: Login mit und ohne „Angemeldet bleiben“, Konto
  löschen (Passwort), Daten herunterladen, abgelaufene Einladung, Mail
  ändern (Mail an die neue Adresse, Bestätigung erst auf Klick, Nachricht
  an die alte, Abbrechen, man bleibt angemeldet).
- Passwort-Warnung beim Registrieren und Zurücksetzen (z. B.
  „Passwort123!“), verschwindet bei einem langen.
- Sprachwechsel in der App: nichts springt, kein Farbblitzer, Titel und
  Adresse wechseln mit; die Kontosprache (für Mails) folgt der App.
- Benachrichtigungen in einem Kalender nur für dich: „Jemand anderes …“
  lässt sich setzen.
- Startseite eingeloggt: „Zur App“ und der Konto-Kreis mit Menü, ohne
  Flackern; nach dem Abmelden wieder Anmelden/Registrieren. „So einfach
  geht's“ als drei Zettel.

### Adressen, Sync, Offline

- Adressen mit dem echten Router (iPhone-Wischgeste zurück):
  `/de/app/{kalender}/{heute|monat|jahr}`, Tag `…/monat/2026-10-13`,
  `…/einstellungen`, `…/teilen`, `…/konto`, `…/neuer-stempel`,
  `/de/app/stempel`. Zurück schließt, Vor öffnet wieder, ein Link öffnet
  direkt, Reload, alte Id-Adressen, offline eine nie geöffnete Adresse. Im
  Editor mit etwas Gezeichnetem fragt Zurück (auch Wischen), X und Escape
  erst „Zeichnung verwerfen?“.
- Ein Kalender „Stempel“ bekommt `…/stempel-2`.
- Kalender, der auf einem Gerät fehlt, obwohl der Server ihn hat: kommt
  beim nächsten Abgleich zurück (neu laden reicht).
- iCal: Abo-Adresse in den Kalender-Einstellungen, in Apple und Google
  Kalender abonnieren (`webcal://`), „.ics herunterladen“; nach Verlassen
  ist die Adresse tot. Google ruft nur alle paar Stunden ab.
- iPhone: nichts scrollt seitlich; Kalender-Reiter und Ablage scrollen nur
  waagrecht, ohne Scrollleiste, mit Fade; Sheets scrollen in sich, die Seite
  dahinter nicht.
- Gezeichnete Linien (`components/scribble-draw.ts`) in echtem Safari:
  Knöpfe, Karten, Monatstabelle, Fokusringe, Hover-Fleck.

### CMS und Admin

- Stamp shapes und Drawing templates unter Content: Vorschau in der Liste,
  ändern → steht gleich in der App.
- Translations: Feld ändern → sofort auf der Seite; falscher Platzhalter
  wird abgelehnt; Mail-Vorlage (`mail.*`) ändern, „Passwort vergessen“
  auslösen und ansehen.
- Accounts: nur „Admin“ und „Nie löschen“ setzbar, kein „Change password“;
  mit „Admin“ steht im Konto „CMS öffnen“. Logo auf der Anmeldeseite, Icon
  in der Seitenleiste.
- Durchklicken: Konten-Liste und -Seite (lesen, löschen, „Unlock login“),
  Statistik „Accounts“, Seeds-Seite; lokal mit `ADMIN_SUPPORT=1` Warnband
  und Leseansicht. Wer im selben Browser im Admin eingeloggt ist, kann sich
  auf der Website nicht registrieren.

## Gut zu wissen

- Dev-Server: Speichert man eine Datei, von der der Store abhängt, bleibt
  die offene App beim Logo stehen, bis man neu lädt (nur lokal).
- Im Dev-Modus springen die gezeichneten Rahmen nach dem Laden kurz von
  gerade auf gewackelt (im Build nicht).
- Ein alter, offener Tab hält ein Datenbank-Upgrade auf, bis er zu ist –
  danach lädt er neu.

## Ideen am Rand
