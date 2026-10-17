# Todo

Stand: 17.10.2026

## Offen

- **Geschenk anlegen prüfen**: In einem Probelauf (`payload run`) scheiterte
  `payload.create` für `gifts` am lokalisierten Namen („Cast to Embedded“).
  Einmal ein Geschenk an alle schicken – klappt das, ist es erledigt. Dabei
  gleich: Push tippen → Regal mit Päckchen; auf dem iPhone auspacken (nichts
  abgeschnitten, flüssig); auf einem zweiten Gerät ist es danach ausgepackt.
- **Monatsansicht „gradlinig“**: Gerade Linien heißt, der Zeichner
  (`components/scribble-draw.ts`) läuft nicht. Lokal und auf boop.mxwr.de
  zeichnet er – wo genau ist es aufgefallen?
- **Web Push** – live (Schlüssel in GitHub, Cron alle 15 Minuten). Optional
  `VAPID_SUBJECT` (z. B. `mailto:…`). Schlüssel nie wechseln – das macht
  alle Abos stumm.
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

## Noch prüfen (braucht Server, zweites Konto oder echtes Gerät)

Was man beim normalen Benutzen sieht, steht hier nicht mehr – nur, was man
eigens ausprobieren muss. Streich, was du schon gesehen hast.

- **Nach dem Refactor-Deploy, installierte App offline**: einmal online
  öffnen, Flugmodus, dann Editor, Stempel-Sheet mit 3D, Konto,
  Einstellungen, Teilen, Neuer Kalender (werden jetzt nachgeladen, sollen
  trotzdem sofort aufgehen); `/de/app/stempel` offline starten; die Schrift
  ist auch beim ersten Offline-Start da. Nach dem nächsten Deploy noch mal:
  kurz online, dann offline den Editor.
- **CMS-Knopf** im Kontomenü (nur Admin) öffnet `/admin` im neuen Tab.
- **Zwei Konten**: Einladung annehmen / ablehnen / „Später“; Mitglied
  entfernen, Kalender verlassen; Push, wenn das andere Konto stempelt, und
  bei Einladung (Kästchen im Konto aus → nichts); Erinnerung zur Uhrzeit.
- **Stempel bearbeiten** mit Kopien bei anderen (Karte, Geschenk): ziehen
  nach, ihr Name bleibt.
- **Karten**: Link im Messenger (Vorschaubild), abgemeldet öffnen →
  Päckchen auspacken → anmelden → im Regal; „Zurückziehen“ macht den Link
  tot.
- **Zwei Geräte**: Notiz gleichzeitig offline schreiben; Kalenderfarbe und
  Startansicht am Handy ändern → am Desktop gleich.
- **Konto**: Mail ändern (Bestätigung erst auf Klick, Nachricht an die alte
  Adresse), Konto löschen, Daten herunterladen, abgelaufene Einladung,
  Login ohne „Angemeldet bleiben“.
- **iCal**: in Apple und Google Kalender abonnieren; nach Verlassen des
  Kalenders ist die Adresse tot.
- **STL** in einem echten Slicer: steht auf der Gummifläche, Knauf oben.
- **CMS**: Translations – falscher Platzhalter wird abgelehnt, Mail-Vorlage
  ändern und „Passwort vergessen“ auslösen; SVG-Upload (sobald fertig).
- **iPhone**: weiße Streifen beim schnellen Malen; Briefmarke – helle Nähte
  im Rand; installierte App: Statusleiste und Überscrollen
  (`statusBarStyle` in `layout.tsx` ist noch „default“).

## Gut zu wissen

- Dev-Server: Speichert man eine Datei, von der der Store abhängt, lädt die
  offene App neu (nur lokal).
- Im Dev-Modus springen die gezeichneten Rahmen nach dem Laden kurz von
  gerade auf gewackelt (im Build nicht).
- Ein alter, offener Tab hält ein Datenbank-Upgrade auf, bis er zu ist –
  danach lädt er neu.

## Ideen am Rand
