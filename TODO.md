# Todo

Stand: 12.10.2026

## Offen

- **Stempelfarben im CMS**: Wer die Zeilen unter „Site“ → Stamp colors
  schon gespeichert hat, hat dort noch „Tinte“ als erste Farbe – von Hand
  auf Rot ändern (Schlüssel `red`, `#ee3b33`).

- **Benachrichtigungen (Web Push)** – gebaut, aber aus, bis es
  VAPID-Schlüssel gibt (`npx web-push generate-vapid-keys`, als Secrets in
  GitHub). Noch offen: Doku und `deploy.yml` mit den Namen, Abschnitt im
  Datenschutztext, der Cron für die Erinnerung (`setup-cron.sh`, bewusst noch
  nicht eingetragen), und ein Test mit echtem Push auf einem Gerät.
- **Oberflächentexte ins CMS (wie ccm)**: Global „Translations“, Felder
  aus den Schlüsseln in `dictionaries.ts`, Seeds füllen neue Texte und
  löschen verwaiste, Änderungen im Admin gewinnen. Texte mit Logik als
  Vorlagen mit Platzhaltern (Einzahl/Mehrzahl). In Arbeit.
- **Widget für Apple** (Idee): ginge nur mit einer nativen Hülle, nicht als
  PWA.
- **Datenschutztext**: Die Vorlage im Code (`features/legal/seed-content.ts`,
  DE + EN) ist auf dem Stand der App. Der Live-Text liegt im CMS und muss
  nachgezogen werden – von Hand oder über die Seeds-Seite mit „Replace“
  (überschreibt eigene Änderungen im CMS).
- **Rechtlich gegenlesen lassen**:
  - Einladungsmails an Leute ohne Konto (Werbesatz über Boop in der Mail).
  - Konten lassen sich per E-Mail-Adresse ohne Zustimmung zu einem Kalender
    hinzufügen; ihr Name wird dabei sichtbar.
  - Resend: AV-Vertrag, Drittland-Grundlage, deren Log-Fristen.
  - Server-Logfiles: Caddy schreibt kein Access-Log – der Absatz beschreibt
    womöglich Logs, die es nicht gibt. Backups fehlen im Text.
  - „Anonyme“ Statistik: „Konto erstellt“ ließe sich über den Zeitpunkt
    einem Konto zuordnen.
  - Löschvermerke bleiben unbegrenzt gespeichert.
  - Mindestalter / Kinder.

## Noch selbst prüfen

- Echtes Safari / iPhone – bisher nur WebKit ohne Fenster getestet.
- Touch: Stempeln, Drehen und der Editor mit dem Finger.
- Stempeln: der neue Ablauf (ausholen, aufschlagen, abheben) – Tempo und
  Größen stehen als `BEAT`, `RAISE`, `HOP` oben in `stamp-hand.tsx`.
- Kalender-Einstellungen gegen den Server: Mitglied entfernen, Kalender
  verlassen (eine Nachfrage), einladen, löschen (doppelte Nachfrage) – beides
  steht jetzt ganz unten im Sheet.
- Eigene Kalenderfarbe als Mitglied: gilt nur auf diesem Gerät, bis die
  persönlichen Einstellungen ans Konto wandern (mit den Benachrichtigungen).
- Farbiger Seitenhintergrund in der installierten App: Statusleiste und
  Überscrollen (`statusBarStyle` in `layout.tsx` ist noch „default“).
- Stempel umbenennen: kommt der neue Name auf dem zweiten Gerät an?
- Kalenderfarben: alle sieben einmal ansehen, vor allem Gelb und auf dem
  Phone.
- Abdruck markieren und mit Entf / ⌫ löschen – auch: ⌫ ohne Markierung
  darf im Browser nicht „zurück“ auslösen.
- Special-Tag im Monat auf dem Phone (kleine Zellen), Hover-Fleck mit dem
  Finger.
- Sprachwechsel in der App: nichts springt, kein Farbblitzer, die
  Unterstreichung gleitet; Titel des Tabs und Adresse wechseln mit.
- Konto (alles braucht den Server): Login mit und ohne „Angemeldet
  bleiben“, Konto löschen (Passwort), Daten herunterladen, abgelaufene
  Einladung.
- Tagesansicht: Stempel kommt in seiner eigenen Farbe; Namensschild beim
  Hover in der Stempelauswahl.
- Kontomenü und Sync-Notiz schließen bei Klick daneben.
- iCal (alles braucht Server und echte Apps): Abo-Adresse in den
  Kalender-Einstellungen erzeugen, in Apple Kalender und Google Kalender
  abonnieren (`webcal://` auf iPhone/Android), „.ics herunterladen“; nach
  Verlassen des Kalenders ist die Adresse tot. Google ruft nur alle paar
  Stunden ab.
- Startseite: „So einfach geht's“ als drei Zettel mit Bildgeschichte
  (Desktop nebeneinander, Phone untereinander); Sprachwechsel dort behält
  jetzt den Login-Zustand.
- Sync-Knopf in der Leiste: ohne Rahmen und grau, solange alles abgeglichen
  ist; Punkt mit Zahl bzw. Kreuz, wenn etwas wartet oder kein Netz da ist.
- Heute-, Monats- und Jahresansicht mit dem echten Router: Umschalter,
  Adresse `/de/app/{kalender}/{heute|monat|jahr}`, Zurück/Vor, alte
  Id-Adressen, Reload; offline eine noch nie geöffnete Adresse.
- Gezeichnete Linien jetzt als Vektoren (Zeichner im Browser,
  `components/scribble-draw.ts`): in echtem Safari/iPhone ansehen – Knöpfe,
  Karten, Monatstabelle, Fokusringe, Hover-Fleck. Im Dev-Modus springen die
  Rahmen kurz nach dem Laden von gerade auf gewackelt (im Build nicht).
- Tagesnotiz mit Server und zweitem Gerät: kommt sie an, gewinnt die
  spätere Änderung, schreiben zwei Geräte offline in dieselbe Notiz statt
  zwei anzulegen? Auf dem iPhone: Autokorrektur, Diktat, bleibt die Tastatur
  bei B/U offen?
- Ein alter, offener Tab hält das Datenbank-Upgrade (Version 2) auf, bis er
  zu ist – danach lädt er neu.
- Sheets scrollen in sich (Titel bleibt, ohne Scrollleiste, Fade an den
  Rändern) – auf dem iPhone: scrollt die Seite dahinter wirklich nicht mit?
- STL in einem echten Slicer: steht jetzt auf der Gummifläche, Knauf nach
  oben; größere Vertiefungen (z. B. das Innere eines Herzens) brauchen
  Stützen „nur vom Druckbett“.
- Stempel schauen dich beim Hover an (Regal, Startseite, Feature-Karten,
  Reihe in der letzten Box) – mit echter GPU und auf dem Phone (dort nichts).
- „Weiter malen“: der 3D-Stempel fliegt zurück in die Zeichnung.
- Der neue, glatte Knauf auch in der Hand beim Stempeln.
- Startseite eingeloggt: „Zur App“ statt Anmelden/Registrieren und der
  Konto-Kreis mit Menü (auch Abmelden) – ohne Flackern beim Laden; nach dem
  Abmelden wieder die Anmelde-Knöpfe. Wer schon vor diesem Stand angemeldet
  war, bekommt den Hinweis beim nächsten Öffnen der App.
- Automatisches Löschen: vor dem ersten echten Lauf einmal
  `/next/cron/cleanup?dry=1` aufrufen – der erste Lauf löscht unbestätigte
  Konten, die älter als 30 Tage sind.

## Ideen am Rand

- phone safari: kalender bar (wo die kalender sind und ich neue hinzufügen kann: scrollt sowohl auf x als auch auf y achse?. die stempel auswahl leiste genauso.
- phone: wenn ich über die heute/stempel canvas stelle scrolle (per touch) scrollt es nicht.
- phone: sobald ich 1x einen stempel gewählt und gestempelt habe, bleibt der mini 3d stempel fixed an meinem fenster kleben, bis ich hard reloade.
- kein schöner farbenfade des hintergrundes bei kalenderwechsel (auf handy).
- stempelscrollbereich auch ohne scrollbar, mit fade.
- gefährlich, was ich alles im cms sehen und verändern kann an persönlichen daten. wie machen wir das am besten?
