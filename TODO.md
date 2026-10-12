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
- Startseite eingeloggt: „Zur App“ statt Anmelden/Registrieren und der
  Konto-Kreis mit Menü (auch Abmelden) – ohne Flackern beim Laden; nach dem
  Abmelden wieder die Anmelde-Knöpfe. Wer schon vor diesem Stand angemeldet
  war, bekommt den Hinweis beim nächsten Öffnen der App.
- Automatisches Löschen: vor dem ersten echten Lauf einmal
  `/next/cron/cleanup?dry=1` aufrufen – der erste Lauf löscht unbestätigte
  Konten, die älter als 30 Tage sind.

## Ideen am Rand

- reminder mail, bevor account gelöscht wird
- keine pixeligen styles, sondern abgerundete (svg drawing, nicht pixel). der style ist komplett super, aber die pixelkanten sind doof.
- cursor-pointer, wo sinnvoll
- stl stempel ist auf dem kopf!? kugel und griff sind nicht glatt verbunden
- ui stempel sollen look at bei hover bekommen (stempel regal, startseite usw)
- weiter malen: 3d stempel fliegt wieder so wie beim start, faded aus.
- jeder tag bekommt ein textfeld, was gemacht wurde (sehr simples richtext, mit underline, bold & zeilenumbrüche)
- das textfeld wird auch in der übersicht berücksichtigt (also skribble text linie zickzack oder so)
- auf der startseite sollte eher today gezeigt werden und dann der monat als übersicht. also so wie jetzt, aber today bekommt extra nochmal eine eigene view (es gibt einen toggle je kalender, today ist aber zuerst ausgewählt)
- die slug des kalenders ergibt sich aus dem namen. man muss aber nach account auflösen, weil ja mehrere accounts die gleichen namen nutzen. also das muss schon sinn ergeben
- die ansicht (heute / monat) steht als slug dahinter in der adresse: `/de/app/{kalender}/{heute|monat}` – so bleibt sie beim neu laden und lässt sich verlinken
- meantime habe ich die google url bestätigungsfile in public gelegt

- Jede besuchte Kalender-Adresse (`/de/app/{id}`) wird als eigene Seite
  gecacht; ein Rewrite auf `/de/app` würde das sparen.
- Beim flachen Winkel der Stickerbilder schaut der Griff nicht mehr hervor
  (`FACE_TURN` in `render.ts`).
