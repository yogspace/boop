# Todo

Stand: 13.10.2026

## Offen

- **Einladungen in der App** (als Nächstes): Popup und Liste im Konto mit
  Annehmen/Ablehnen; wer ein Konto hat, ist erst nach dem Ja Mitglied.
- **Warnung bei unsicheren Passwörtern** (nach dem nächsten Deploy): beim
  Registrieren und beim neuen Passwort.
- **Nachziehen nach Mail-Wechsel, Kästchen und Einladungs-Push**:
  - Datenschutztext (`features/legal/seed-content.ts`): Adresse in der App
    ändern, die Kästchen „Admin“ / „Nie löschen“, ausstehende Adresse im
    Export, Einladungs-Nachricht samt Abschalten im Konto.
  - Neue Texte: im CMS einmal Seeds → Translations.
- **Benachrichtigungen (Web Push)** – live: Schlüssel in GitHub, deployt,
  Cron für die Erinnerung eingetragen (alle 15 Minuten). Optional noch die
  Variable `VAPID_SUBJECT` (z. B. `mailto:…`). Fehlt nur noch:
  Auf einem Gerät testen: Kalender-Einstellungen → „Benachrichtigungen
     einschalten“ (iPhone: nur in der installierten App), zweites Konto
     stempelt → Nachricht; Erinnerung zur eingestellten Uhrzeit.
  Schlüssel nicht wechseln: neue Schlüssel machen alle bisherigen Abos stumm.
- **Ein Text noch fest im Code**: „Mein Kalender“ / „My calendar“ (der
  erste Kalender bei der Anmeldung, `calendar/membership.ts`). Die Mail an
  den Betreiber (Kontaktformular, Statistikbericht) bleibt bewusst deutsch.
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
- Kontomenü schließt bei Klick daneben.
- iPhone: die App lässt sich nicht mehr seitlich scrollen (die gezeichneten
  Linien ragten am Rand bis zu 10 px über den Bildschirm – jetzt am Rahmen
  abgeschnitten).
- Mails mit Texten aus dem CMS: eine Mail-Vorlage unter Translations →
  `mail.*` ändern, dann z. B. „Passwort vergessen“ auslösen und ansehen.
- Nach dem Deploy: im Deploy-Log „✓ Pages refreshed“ – danach zeigen die
  Seiten die Stempelfarben und Texte aus dem CMS (vorher die aus dem Code,
  weil das Image ohne Datenbank gebaut wird).
- Texte im Admin unter Content → Translations: ein Feld ändern, speichern,
  steht sofort auf der Seite; eine Vorlage mit falschem Platzhalter wird
  abgelehnt; „Seeds → Translations“ füllt die Felder mit den Code-Texten.
- Admin nach dem Dichtmachen durchklicken: Konten-Liste und -Seite (nur
  lesen, löschen, „Unlock login“), Statistik „Accounts“, Seeds-Seite; lokal
  mit `ADMIN_SUPPORT=1` das Warnband und die Leseansicht der Inhalte.
  Nebenwirkung: Wer im selben Browser im Admin eingeloggt ist, kann sich auf
  der Website nicht registrieren.
- iPhone: Kalender-Reiter und Stempel-Ablage scrollen nur waagrecht, ohne
  Scrollleiste, mit Fade; über dem Blatt scrollt Wischen die Seite, solange
  kein Stempel in der Hand ist; einen Abdruck erst antippen, dann ziehen;
  der kleine 3D-Stempel verschwindet nach dem Druck von selbst; die
  Hintergrundfarbe blendet beim Kalenderwechsel weich über.
- Jahresansicht per Tastatur: ein Tab-Stopp, Pfeiltasten Tag/Monat, Enter.
- iCal (alles braucht Server und echte Apps): Abo-Adresse in den
  Kalender-Einstellungen erzeugen, in Apple Kalender und Google Kalender
  abonnieren (`webcal://` auf iPhone/Android), „.ics herunterladen“; nach
  Verlassen des Kalenders ist die Adresse tot. Google ruft nur alle paar
  Stunden ab.
- Startseite: „So einfach geht's“ als drei Zettel mit Bildgeschichte
  (Desktop nebeneinander, Phone untereinander); Sprachwechsel dort behält
  jetzt den Login-Zustand.
- Sync-Stand jetzt im Kontomenü (mit „Jetzt abgleichen“); am Konto-Kreis
  nur eine Zahl, wenn etwas wartet, bzw. ein Kreuz ohne Netz.
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
- Zeichenwerkzeuge im Stempel-Editor (bisher nur WebKit ohne Fenster):
  Radierer (E), Auswahl (V: verschieben, skalieren, drehen, ⌥-Ziehen
  dupliziert, Pfeiltasten, ⌘D, Entf), Zentrierhilfen (⌘ schaltet sie aus),
  Strichstärke einer Auswahl ändern. Linie (L): Klick = Ecke, Ziehen =
  Kurve, ⇧ = 45°, Klick auf den ersten Punkt schließt, Enter beendet, ⌫
  nimmt den letzten Punkt weg. Punkte bearbeiten (A oder Doppelklick):
  Anker und Griffe ziehen, ⌥-Klick rund/eckig, Klick auf die Linie fügt
  einen Punkt ein. Noch nie im Browser geprüft: ⌥ beim Ziehen (Griffe
  brechen). Auf dem Phone: Punkte tippen, „Fertig“, Zwei-Finger-Gesten.
- Mail-Adresse ändern (nichts davon im Browser gesehen): „Ändern“ im
  Konto, Mail an die neue Adresse, Bestätigungsseite (löst erst auf Klick
  ein), Nachricht an die alte Adresse, Abbrechen; man bleibt angemeldet.
- CMS → Accounts: „Admin“ und „Nie löschen“ lassen sich setzen, sonst
  nichts (Name, Adresse, Passwort); „Change password“ darf nicht da sein.
  Mit „Admin“ steht im Konto „CMS öffnen“. Logo auf der Anmeldeseite und
  das Icon in der Seitenleiste.
- Sprache des Kontos (für die Mails): folgt jetzt der Sprache, in der die
  App benutzt wird – in der App auf EN stellen, im CMS steht dann „en“.
- Benachrichtigungen in einem Kalender nur für dich: „Jemand anderes …“
  lässt sich jetzt setzen (meldet sich, sobald jemand dazukommt).
- Push bei Einladung auf einem Gerät: kommt an, Tippen öffnet die App;
  Kästchen im Konto aus → nichts. Einmal aus, neu laden, an, neu laden.
- Kalender, der auf einem Gerät fehlt, obwohl der Server ihn noch hat:
  kommt jetzt beim nächsten Abgleich von selbst zurück (neu laden reicht).
- Dev-Server: Speichert jemand eine Datei, von der der Store abhängt, bleibt
  die offene App beim Logo stehen, bis man neu lädt (nur lokal, nicht im
  Build).
- Automatisches Löschen: vor dem ersten echten Lauf einmal
  `/next/cron/cleanup?dry=1` aufrufen – de r erste Lauf löscht unbestätigte
  Konten, die älter als 30 Tage sind.

## Ideen am Rand

refactor. manche files haben > 700 zeilen!
die stempel in der monats/jahresansicht etwas chaotischer machen bzw. lustiger:)