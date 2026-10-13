import type { SiteLinks } from "@/features/site/defaults";
import type { Locale } from "@/i18n/config";

/**
 * The imprint and privacy policy as the code writes them, as Lexical JSON –
 * what the Seeds page fills the “Imprint & privacy” global with (seed.ts),
 * and what the page shows while a language has no text (get-legal.ts).
 *
 * Written with a few small helpers instead of raw JSON: the nodes are the
 * ones the admin's editor writes itself (global.ts). Address, contact form
 * and the link to mxwr.de are blocks – address and link come from the
 * “Site” global.
 */

/**
 * When these texts were last changed – the “Last updated” date while the
 * page shows them straight from the code.
 */
export const LEGAL_SEED_DATE = "2026-10-12";

type Node = Record<string, unknown>;

const text = (value: string): Node => ({
  type: "text",
  text: value,
  format: 0,
  style: "",
  mode: "normal",
  detail: 0,
  version: 1,
});

const element = (type: string, children: Node[], extra: Node = {}): Node => ({
  type,
  children,
  direction: "ltr",
  format: "",
  indent: 0,
  version: 1,
  ...extra,
});

const h2 = (value: string) => element("heading", [text(value)], { tag: "h2" });
const h3 = (value: string) => element("heading", [text(value)], { tag: "h3" });

/** A paragraph; strings are text, nodes (an inline block) go in as they are. */
const p = (...parts: (string | Node)[]) =>
  element(
    "paragraph",
    parts.map((part) => (typeof part === "string" ? text(part) : part)),
    { textFormat: 0, textStyle: "" }
  );

let counter = 0;
/** Block ids as Payload makes them – 24 hex digits, unique within a seed. */
const id = () => (counter++).toString(16).padStart(24, "0");

const block = (blockType: string): Node => ({
  type: "block",
  format: "",
  version: 2,
  fields: { id: id(), blockName: "", blockType },
});

const inlineBlock = (blockType: string, fields: Node = {}): Node => ({
  type: "inlineBlock",
  version: 1,
  fields: { id: id(), blockName: "", blockType, ...fields },
});

const address = () => block("address");
const contactForm = () => block("contactForm");
const updated = () => inlineBlock("updated");
const siteLink = (link: keyof SiteLinks, label: string) =>
  inlineBlock("siteLink", { link, label });

const root = (children: Node[]) => ({
  root: element("root", children),
});

const german = () =>
  root([
    h2("Impressum"),
    h3("Angaben gemäß § 5 DDG"),
    address(),
    h3("Kontakt"),
    contactForm(),
    h3("Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV"),
    address(),

    h2("Datenschutz"),
    p(
      "Boop ist ein kleiner Stempelkalender. Hier steht in einfachen Worten, welche Daten dabei anfallen, wofür ich sie brauche, wie lange ich sie behalte und was du tun kannst."
    ),
    h3("Verantwortlicher"),
    p("Verantwortlich für die Verarbeitung deiner Daten ist:"),
    address(),
    p(
      "Du erreichst mich über das Kontaktformular im Impressum oben. Name, E-Mail-Adresse und Nachricht gehen dabei per E-Mail an mich – verschickt über Resend (siehe „E-Mails über Resend“); auf der Website wird davon nichts gespeichert. Ich nutze die Angaben nur, um dir zu antworten, und lösche die Mail, wenn die Sache erledigt ist (Art. 6 Abs. 1 lit. b und f DSGVO). Gegen Missbrauch hält der Server deine IP-Adresse dabei im Arbeitsspeicher fest, höchstens zehn Minuten nach deiner letzten Nachricht (siehe „Hosting und Server-Logfiles“)."
    ),

    h3("Hosting und Server-Logfiles"),
    p(
      "Boop läuft auf einem Server der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland; mit Hetzner besteht ein Vertrag zur Auftragsverarbeitung. Dort liegt auch die Datenbank mit allem, was in Boop gespeichert wird."
    ),
    p(
      "Bei jedem Aufruf verarbeitet der Server technisch notwendige Daten – IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browsertyp und Betriebssystem – in Server-Logfiles, um die Website auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein berechtigtes Interesse ist ein sicherer, funktionierender Betrieb."
    ),
    p(
      "Um Missbrauch zu bremsen – zu viele Registrierungen, Nachrichten oder Zählimpulse von einer Adresse –, hält der Server IP-Adressen außerdem im Arbeitsspeicher fest: bei der Statistik höchstens eine Minute, beim Kontaktformular höchstens zehn Minuten und bei der Registrierung höchstens eine Stunde nach der letzten Anfrage von dieser Adresse. Danach vergisst er sie von selbst; auf einen Datenträger geschrieben werden sie nie. Rechtsgrundlage ist auch hier Art. 6 Abs. 1 lit. f DSGVO."
    ),
    p(
      "Solange die App geöffnet ist, hält sie eine Verbindung zum Server offen, über die sie erfährt, wenn sich in deinen Kalendern etwas geändert hat – so ist sie gleich auf dem neuesten Stand. Dafür werden keine zusätzlichen Daten gespeichert."
    ),

    h3("Dein Konto"),
    p(
      "Um Boop zu nutzen, legst du ein Konto an. Dafür speichere ich deine E-Mail-Adresse, deinen Anzeigenamen und die Sprache, die du gewählt hast. Dein Passwort speichere ich nie im Klartext, sondern nur als gesalzenen Hash – daraus lässt es sich nicht zurückgewinnen, auch nicht von mir. Dazu kommen technische Angaben, die die Anmeldung braucht: ob deine E-Mail-Adresse bestätigt ist, wann das Konto angelegt und zuletzt geändert wurde, für jede Anmeldung auf einem Gerät ein Eintrag mit Beginn und Ablauf (ohne Angaben zum Gerät), zum Schutz vor dem Ausprobieren von Passwörtern die Zahl der letzten Fehlversuche – nach zu vielen ist die Anmeldung für eine Viertelstunde gesperrt – und, für die Löschfristen unten, wann du Boop zuletzt benutzt hast (höchstens einmal am Tag notiert, beim Anmelden und wenn die App sich mit dem Server abgleicht) und gegebenenfalls, wann ich dich per E-Mail an die Löschung erinnert habe."
    ),
    p(
      "Nach der Registrierung bekommst du eine E-Mail mit einem Link, mit dem du deine Adresse bestätigst; bestätigst du sie nicht innerhalb von 30 Tagen, lösche ich die Anmeldung wieder. Hast du dein Passwort vergessen, kannst du dir eine E-Mail mit einem Link zum Zurücksetzen schicken lassen; er gilt eine Stunde. Newsletter oder Werbung verschicke ich nicht."
    ),
    p(
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO: Ohne diese Angaben kann ich dir kein Konto anbieten."
    ),

    h3("Deine Kalender, Stempel und Tage"),
    p(
      "Was du in Boop anlegst, wird in deinem Konto gespeichert: deine Kalender (Name und Farbe), die Stempel, die du zeichnest (Name, Form, Farbe und die Zeichnung selbst), und deine Abdrücke – also welcher Stempel an welchem Tag in welchem Kalender liegt, wo, wie groß und wie gedreht, in welcher Farbe und von wem gesetzt. Lädst du für einen Stempel eine SVG-Datei hoch, wird sie in deinem Browser in eine Zeichnung umgewandelt; die Datei selbst wird nicht übertragen. So ist alles auf jedem Gerät da, auf dem du angemeldet bist."
    ),
    p(
      "Zu jedem Tag eines Kalenders kann eine kurze Notiz gespeichert werden. Sie ist für alle Mitglieder des Kalenders sichtbar, wird mit dem Konto gespeichert, das sie zuletzt geändert hat, und mit dem Kalender gelöscht. Löschst du dein Konto, bleiben deine Notizen in Kalendern anderer erhalten; der Bezug zu dir wird entfernt."
    ),
    p(
      "Einen Kalender kannst du mit anderen Boop-Konten teilen. Wer Mitglied eines Kalenders ist, sieht seinen Inhalt – die Tage und alle Abdrücke darauf, samt der Stempel, mit denen sie gemacht wurden – und die Anzeigenamen der anderen Mitglieder; ihre E-Mail-Adressen zeigt Boop niemandem. Die Zeichnung eines Stempels liegt damit auch auf den Geräten der Mitglieder. Stempel, die du für einen Kalender freigibst, können dessen Mitglieder außerdem selbst benutzen und als Datei für den 3D-Druck herunterladen. Teile einen Kalender also nur mit Menschen, die das sehen sollen. Einen Kalender, den du nicht teilst, siehst nur du."
    ),
    p(
      "Geteilt wird über die E-Mail-Adresse: Gibt es zu der Adresse, die jemand eingibt, ein bestätigtes Boop-Konto, wird es dem Kalender sofort hinzugefügt, und wer teilt, sieht dessen Anzeigenamen. Wer deine E-Mail-Adresse kennt, kann dich also zu einem Kalender hinzufügen; du kannst ihn jederzeit wieder verlassen. Damit sich auf diesem Weg nicht reihenweise Adressen ausprobieren lassen, ist die Zahl der Versuche begrenzt."
    ),
    p(
      "Du kannst auch jemanden einladen, der noch kein Boop-Konto hat. Dann speichere ich die E-Mail-Adresse, die du angibst, zusammen mit dem Kalender und mit der Angabe, wer eingeladen hat, und schicke an diese Adresse eine Einladungsmail (über Resend, siehe unten) – eine je Einladung, ohne Erinnerungen. Wer eingeladen wird, kann die Mail einfach ignorieren – ohne Konto passiert sonst nichts. Eine Einladung gilt 14 Tage; das steht auch in der Mail. Meldet sich in dieser Zeit jemand mit genau dieser Adresse bei Boop an, tritt das Konto dem Kalender bei. Die Einladung wird gelöscht, sobald sie angenommen oder von dir zurückgezogen wird, sonst nach Ablauf der 14 Tage. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist, dass du deinen Kalender mit Menschen teilen kannst, die du selbst auswählst."
    ),
    p(
      "Einen Kalender kannst du auch in deiner Kalender-App abonnieren, etwa in Apple Kalender oder Google Kalender. Dafür erzeugst du in seinen Einstellungen eine private Abo-Adresse; gespeichert werden dazu dein Konto, der Kalender, wann du die Adresse erzeugt hast und wann sie zuletzt abgerufen wurde (höchstens einmal am Tag notiert). Über die Adresse holt sich die Kalender-App – bei manchen, etwa Google Kalender, der Server ihres Anbieters – regelmäßig die Tage des Kalenders: die Namen der Stempel darauf und die Notizen, in einem geteilten Kalender auch die der anderen Mitglieder. Die Adresse braucht keine Anmeldung: Wer sie kennt, liest mit – gib sie also nicht weiter. Du kannst sie jederzeit zurückziehen oder durch eine neue ersetzen; die alte gilt dann sofort nicht mehr, ebenso, wenn du den Kalender verlässt, daraus entfernt wirst oder er gelöscht wird. Was die Kalender-App und ihr Anbieter mit den abgerufenen Daten tun, regeln deren Datenschutzbestimmungen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Einträge der anderen Mitglieder lit. f – dein Interesse, den gemeinsamen Kalender neben deinen Terminen zu sehen."
    ),
    p(
      "Suchmaschinen finden nur die öffentlichen Seiten von Boop, etwa die Startseite und diese Seite. Deine Kalender und Stempel sind nicht öffentlich und tauchen dort nicht auf."
    ),
    p(
      "Zum Verwalten von Boop sehe ich als Betreiber von deinem Konto deine E-Mail-Adresse, deinen Anzeigenamen, deine Sprache, ob die Adresse bestätigt ist, und technische Zeitpunkte (angelegt, zuletzt benutzt, ggf. die Erinnerung vor der Löschung). Ändern kann ich dort nichts davon, auch nicht dein Passwort – ich kann ein Konto nur löschen oder eine Anmeldesperre aufheben. Deine Kalender, Stempel, Abdrücke, Notizen, Einladungen und Benachrichtigungseinstellungen sind im Verwaltungsbereich nicht einsehbar. Nur im Einzelfall – um einen Fehler zu beheben oder auf deine Anfrage hin – schalte ich auf dem Server eine Leseansicht dafür frei und danach wieder ab. Unabhängig davon kann, wer den Server betreibt, technisch auf die Datenbank zugreifen; das tue ich nur, wenn Betrieb oder Sicherheit es erfordern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO."
    ),

    h3("E-Mails über Resend"),
    p(
      "Die E-Mails zur Bestätigung deiner Adresse, zum Zurücksetzen deines Passworts, mit Einladungen zu Kalendern und zur Erinnerung, bevor ein lange ungenutztes Konto gelöscht wird, sowie die Nachrichten aus dem Kontaktformular verschicke ich über den Versanddienst Resend (Resend, Inc., USA), der sie in meinem Auftrag zustellt (Auftragsverarbeitung). Resend erhält dafür die beteiligten E-Mail-Adressen und den Inhalt der jeweiligen Mail. Dabei können Daten in die USA übermittelt werden; abgesichert ist das durch die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Rechtsgrundlage für den Versand ist Art. 6 Abs. 1 lit. b DSGVO, bei Einladungen lit. f (siehe oben)."
    ),

    h3("Benachrichtigungen"),
    p(
      "Wenn du sie in den Einstellungen eines Kalenders einschaltest, kann Boop dir Benachrichtigungen schicken: eine Erinnerung, wenn du heute noch nicht gestempelt hast, eine Nachricht, wenn jemand anderes im Kalender gestempelt hat, und – nur wenn du das eigens einschaltest – eine, wenn jemand anderes dort etwas ändert (eine Notiz, Abdrücke, den Namen oder wer dabei ist). Dafür fragt dein Browser bzw. Gerät dich zuerst um Erlaubnis. Gespeichert werden dann die Adresse, unter der dein Gerät Nachrichten empfängt, samt ihrer Schlüssel, die Zeitzone und Sprache des Geräts, deine Einstellungen je Kalender und die Uhrzeit der Erinnerung."
    ),
    p(
      "Zugestellt werden die Nachrichten über den Push-Dienst des Herstellers deines Browsers bzw. Geräts (z. B. Apple, Google, Mozilla oder Microsoft). Der Inhalt – etwa „Anna hat in ‚Familie‘ gestempelt“ – geht verschlüsselt dorthin; der Dienst stellt ihn zu, kann ihn aber nicht lesen. Er sieht, dass deinem Gerät eine Nachricht zugestellt wird. Du kannst die Benachrichtigungen jederzeit in den Einstellungen eines Kalenders ausschalten oder deinem Browser die Erlaubnis entziehen; beim Abmelden und beim Löschen deines Kontos wird das Abo entfernt. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit widerrufen kannst."
    ),

    h3("Cookies und Speicher auf deinem Gerät"),
    p(
      "Boop setzt nur Cookies, die für die Anmeldung nötig sind. Das Anmelde-Cookie enthält ein signiertes Token, an dem der Server erkennt, dass du angemeldet bist; es gilt 30 Tage. Wählst du beim Anmelden „Angemeldet bleiben“ ab, gilt es nur, bis du den Browser schließt, höchstens aber einen Tag – und daneben steht ein zweites Cookie, das nichts enthält als den Hinweis, dass diese Anmeldung mit dem Browser endet. Beim Abmelden werden beide gelöscht. Weil dein Konto ohne sie nicht funktioniert, sind sie unbedingt erforderlich und brauchen keine Einwilligung (§ 25 Abs. 2 Nr. 2 TDDDG). Solange du nicht angemeldet bist, setzt Boop gar keine Cookies."
    ),
    p(
      "Boop ist eine Web-App, die du installieren kannst und die auch ohne Internet funktioniert. Dafür legt Boop die Kalender, Stempel und Abdrücke deines Kontos im lokalen Speicher deines Browsers ab (IndexedDB) – dazu deinen Namen und deine E-Mail-Adresse, die Anzeigenamen der Mitglieder deiner Kalender und Änderungen, die noch nicht beim Server angekommen sind –, und ein Service Worker speichert die Dateien der App zwischen, damit sie sich auch ohne Verbindung öffnet. Was du offline änderst, wird an den Server geschickt, sobald du wieder online bist."
    ),
    p(
      "Außerdem merkt sich dein Browser ein paar Kleinigkeiten (localStorage): das zuletzt gewählte Stempelkissen, eine Einladung, die du vor dem Anmelden geöffnet hast – bis zur Anmeldung –, und ob deine Anmeldung mit dem Schließen des Browsers endet."
    ),
    p(
      "Diese Daten bleiben auf deinem Gerät. Beim Abmelden und wenn du dein Konto löschst, werden die dort gespeicherten Daten deines Kontos gelöscht, und über die Einstellungen deines Browsers kannst du alles jederzeit selbst entfernen. Läuft deine Anmeldung nur ab, bleiben sie auf dem Gerät, bis sich dort wieder jemand anmeldet – auf einem Gerät, das du mit anderen teilst, solltest du dich deshalb immer abmelden. Auch dieser Speicher ist für die Funktion, die du nutzt, unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG)."
    ),
    p(
      "Weitere Cookies gibt es nicht – keine Tracking- oder Werbe-Cookies und keine Analyse- oder Tracking-Dienste Dritter."
    ),

    h3("Anonyme Statistik"),
    p(
      "Damit ich sehe, ob und wie Boop genutzt wird, meldet die Seite beim Aufruf einer Seite und bei einigen Aktionen – zum Beispiel „Konto erstellt“, „Stempel gesetzt“ oder „Kalender geteilt“ – eine kurze Nachricht an meinen Server. Gespeichert werden nur grobe Angaben: die aufgerufene Seite (die App zählt als eine einzige Seite; welcher Kalender offen ist, wird nicht übertragen), die grobe Herkunft (etwa „Google“ oder „direkt“, nie die vollständige Adresse), die Geräteklasse (Handy, Tablet oder Computer), Betriebssystem und Browser mit Hauptversion, bei einer Aktion ihre Art – nie ihr Inhalt – sowie der Zeitpunkt."
    ),
    p(
      "Dafür werden keine Cookies gesetzt, keine IP-Adressen gespeichert und keine Kennungen vergeben – einzelne Einträge lassen sich weder einer Person noch einem Konto zuordnen und auch nicht miteinander verknüpfen. Die Einträge werden nach 90 Tagen gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein berechtigtes Interesse ist, Boop zu verbessern. Sendet dein Browser das Signal „Global Privacy Control“, wird nichts gezählt."
    ),

    h3("Speicherdauer und Löschung"),
    p(
      "Deine Kontodaten und alles, was du in Boop anlegst, bleiben gespeichert, solange es dein Konto gibt. Für alles andere gelten die Fristen, die oben jeweils genannt sind: Einladungen 14 Tage, die anonyme Statistik 90 Tage, Nachrichten aus dem Kontaktformular, bis die Sache erledigt ist."
    ),
    p(
      "Damit keine Daten liegen bleiben, die niemand mehr braucht, räumt Boop einmal am Tag auf: Eine Registrierung, deren E-Mail-Adresse nicht innerhalb von 30 Tagen bestätigt wurde, wird gelöscht. Ein Konto, das 24 Monate lang nicht benutzt wurde – keine Anmeldung, kein Öffnen der App mit Verbindung –, wird gelöscht; 30 Tage vorher bekommst du eine E-Mail. Einmal anmelden genügt, dann bleibt alles, wie es ist. Gelöscht wird nur, wenn diese E-Mail auch verschickt werden konnte und du danach die vollen 30 Tage nicht da warst. Gelöscht wird dabei genauso wie beim Löschen von Hand (siehe unten). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO in Verbindung mit dem Grundsatz der Speicherbegrenzung (Art. 5 Abs. 1 lit. e DSGVO)."
    ),
    p(
      "Dein Konto kannst du jederzeit selbst löschen: in der App unter „Konto“ → „Konto löschen“. Zur Sicherheit fragt Boop dabei nach deinem Passwort. Gelöscht wird dann alles, was dazugehört: deine Kalender mit allen Abdrücken darauf – auch für ihre Mitglieder –, deine Stempel mit allen Abdrücken, die damit gemacht wurden, alles, was du in den Kalendern anderer gestempelt hast, und die Einladungen, die du verschickt hast. In Kalendern anderer bist du danach kein Mitglied mehr. Auf dem Gerät, auf dem du löschst, wird auch die dort gespeicherte Kopie entfernt."
    ),
    p(
      "Damit die Geräte der anderen Mitglieder das Gelöschte ebenfalls entfernen, bleibt davon ein technischer Löschvermerk gespeichert. Er enthält weder deinen Namen noch deine E-Mail-Adresse noch deine Zeichnungen."
    ),

    h3("Deine Rechte"),
    p(
      "Du hast das Recht auf Auskunft über deine Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen, die auf einem berechtigten Interesse beruhen (Art. 21 DSGVO)."
    ),
    p(
      "Zwei davon erledigst du direkt in der App unter „Konto“: Mit „Daten herunterladen“ bekommst du die Daten deines Kontos als Datei (JSON) – dein Konto, deine Kalender und Mitgliedschaften, deine Stempel, deine Abdrücke und die offenen Einladungen, die du verschickt hast. Mit „Konto löschen“ löschst du dein Konto samt allem, was dazugehört. Für alles andere – etwa eine andere E-Mail-Adresse – schreib mir einfach über das Kontaktformular oben."
    ),
    p(
      "Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren, zum Beispiel bei der deines Wohnorts."
    ),

    h3("Keine automatisierten Entscheidungen"),
    p(
      "Boop trifft keine automatisierten Entscheidungen über dich und erstellt kein Profil von dir (Art. 22 DSGVO)."
    ),

    h3("Änderungen"),
    p(
      "Wenn sich Boop ändert, passe ich diesen Text an. Es gilt die hier veröffentlichte Fassung."
    ),
    p("Stand: ", updated()),

    h2("Rechte"),
    p(
      "Software und Gestaltung von Boop sind von mir – alle Rechte vorbehalten. Was du selbst zeichnest, gehört dir. Mehr von mir findest du auf ",
      siteLink("website", "mxwr.de"),
      "."
    ),
  ]);

const english = () =>
  root([
    h2("Legal notice"),
    h3("Information pursuant to § 5 DDG (German Digital Services Act)"),
    address(),
    h3("Contact"),
    contactForm(),
    h3("Responsible for content pursuant to § 18 (2) MStV"),
    address(),

    h2("Privacy"),
    p(
      "Boop is a little stamp calendar. Here you'll find, in plain words, which data comes up along the way, what I need it for, how long I keep it and what you can do."
    ),
    h3("Controller"),
    p("The controller responsible for processing your data is:"),
    address(),
    p(
      "You can reach me through the contact form in the legal notice above. Your name, email address and message reach me by email – sent through Resend (see “Emails via Resend”); nothing of it is stored on the site. I use the details only to answer you and delete the mail once the matter is settled (Art. 6 (1) (b) and (f) GDPR). Against abuse the server holds your IP address in memory as it does so, for at most ten minutes after your last message (see “Hosting and server logs”)."
    ),

    h3("Hosting and server logs"),
    p(
      "Boop runs on a server of Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany, under a data processing agreement. The database with everything stored in Boop is there too."
    ),
    p(
      "With every request the server processes technically necessary data – IP address, date and time, requested address, browser type and operating system – in server logs, to deliver the site and protect it from attacks. Legal basis: Art. 6 (1) (f) GDPR; my legitimate interest is a secure, working service."
    ),
    p(
      "To slow down abuse – too many sign-ups, messages or counting signals from one address – the server also holds IP addresses in memory: for the statistics at most one minute, for the contact form at most ten minutes and for signing up at most one hour after the last request from that address. Then it forgets them by itself; they are never written to disk. Legal basis, here too: Art. 6 (1) (f) GDPR."
    ),
    p(
      "While the app is open, it keeps a connection to the server open, through which it learns when something has changed in your calendars – so it is up to date right away. No extra data is stored for this."
    ),

    h3("Your account"),
    p(
      "To use Boop, you create an account. For it I store your email address, your display name and the language you chose. I never store your password in plain text, only as a salted hash – it cannot be recovered from that, not even by me. Added to that are the technical details logging in needs: whether your email address is confirmed, when the account was created and last changed, an entry for every login on a device with its start and its end (nothing about the device), against guessing passwords the number of recent failed tries – after too many, logging in is locked for a quarter of an hour – and, for the deletion periods below, when you last used Boop (noted once a day at most, when you log in and when the app syncs with the server) and, if it came to that, when I reminded you by email that the account would be deleted."
    ),
    p(
      "After signing up you get an email with a link to confirm your address; if you don't confirm it within 30 days, I delete the sign-up again. If you forget your password, you can have an email sent to you with a link to reset it; it is valid for one hour. I don't send newsletters or advertising."
    ),
    p(
      "Legal basis: Art. 6 (1) (b) GDPR – without these details I can't offer you an account."
    ),

    h3("Your calendars, stamps and days"),
    p(
      "What you create in Boop is stored in your account: your calendars (name and color), the stamps you draw (name, shape, color and the drawing itself), and your prints – that is, which stamp sits on which day in which calendar, where, how big and turned how, in which color and placed by whom. If you upload an SVG file for a stamp, it is turned into a drawing in your browser; the file itself is not transferred. So everything is there on every device you're logged in on."
    ),
    p(
      "A short note can be kept for each day of a calendar. It is visible to all members of the calendar, stored with the account that changed it last, and deleted with the calendar. If you delete your account, your notes in other people's calendars stay; the link to you is removed."
    ),
    p(
      "You can share a calendar with other Boop accounts. Whoever is a member of a calendar sees its content – the days and all the prints on them, with the stamps they were made with – and the other members' display names; Boop shows their email addresses to nobody. A stamp's drawing is therefore on the members' devices too. Stamps you share with a calendar can also be used by its members themselves, and downloaded as a file for 3D printing. So only share a calendar with people who should see it. A calendar you don't share is seen only by you."
    ),
    p(
      "Sharing goes by email address: if there is a confirmed Boop account for the address someone enters, it is added to the calendar at once, and whoever shares sees its display name. So anyone who knows your email address can add you to a calendar; you can leave it again at any time. So that addresses can't be tried out in rows this way, the number of tries is limited."
    ),
    p(
      "You can also invite someone who doesn't have a Boop account yet. Then I store the email address you enter, together with the calendar and who sent the invitation, and send that address an invitation email (via Resend, see below) – one per invitation, no reminders. Whoever is invited can simply ignore the mail – without an account, nothing else happens. An invitation is valid for 14 days; the mail says so too. If someone logs in to Boop with exactly this address in that time, the account joins the calendar. The invitation is deleted once it is accepted or taken back by you, otherwise when the 14 days are over. Legal basis: Art. 6 (1) (f) GDPR; the legitimate interest is that you can share your calendar with people you choose yourself."
    ),
    p(
      "You can also subscribe to a calendar in your calendar app, such as Apple Calendar or Google Calendar. For that you create a private subscription address in its settings; stored with it are your account, the calendar, when you created the address and when it was last fetched (noted once a day at most). Through the address the calendar app – for some, such as Google Calendar, its provider's server – regularly fetches the calendar's days: the names of the stamps on them and the notes, in a shared calendar those of the other members too. The address needs no login: anyone who knows it can read along – so don't pass it on. You can take it back or replace it with a new one at any time; the old one then stops working at once, as it does when you leave the calendar, are removed from it or it is deleted. What the calendar app and its provider do with the data they fetch is governed by their privacy policies. Legal basis: Art. 6 (1) (b) GDPR, for the other members' entries (f) – your interest in seeing the shared calendar next to your appointments."
    ),
    p(
      "Search engines only find Boop's public pages, such as the home page and this page. Your calendars and stamps are not public and don't show up there."
    ),
    p(
      "To run Boop, I as the operator see your account's email address, display name, language, whether the address is confirmed, and technical dates (created, last used, the reminder before deletion if any). I can't change any of it there, nor your password – I can only delete an account or lift a login lock. Your calendars, stamps, prints, notes, invitations and notification settings can't be viewed in the admin area. Only in a single case – to fix a bug or at your request – do I switch on a read-only view of them on the server, and off again afterwards. Regardless of this, whoever runs the server can technically access the database; I only do so when running the service or keeping it secure requires it. Legal basis: Art. 6 (1) (b) GDPR."
    ),

    h3("Emails via Resend"),
    p(
      "I send the emails to confirm your address, to reset your password, to invite people to calendars and to remind you before a long unused account is deleted, as well as the messages from the contact form, through the mail service Resend (Resend, Inc., USA), which delivers them on my behalf (data processing). For this, Resend receives the email addresses involved and the content of the mail. Data may be transferred to the USA in the process; this is safeguarded by the European Commission's standard contractual clauses (Art. 46 (2) (c) GDPR). Legal basis for sending: Art. 6 (1) (b) GDPR, for invitations Art. 6 (1) (f) GDPR (see above)."
    ),

    h3("Notifications"),
    p(
      "If you switch them on in a calendar's settings, Boop can send you notifications: a reminder when you haven't stamped yet today, a message when someone else has stamped in the calendar, and – only if you switch it on separately – one when someone else changes something there (a note, prints, the name or who's in it). Your browser or device asks for your permission first. Stored then are the address at which your device receives messages, with its keys, the device's time zone and language, your settings per calendar and the time of the reminder."
    ),
    p(
      "The messages are delivered through the push service of your browser's or device's maker (e.g. Apple, Google, Mozilla or Microsoft). Their content – such as “Anna stamped in ‘Family’” – goes there encrypted; the service delivers it but can't read it. It sees that a message is delivered to your device. You can switch notifications off in a calendar's settings at any time or withdraw your browser's permission; logging out and deleting your account remove the subscription. Legal basis: your consent (Art. 6 (1) (a) GDPR), which you can withdraw at any time."
    ),

    h3("Cookies and storage on your device"),
    p(
      "Boop only sets cookies that logging in needs. The login cookie holds a signed token that tells the server you're logged in; it is valid for 30 days. If you untick “Stay logged in” when logging in, it only lasts until you close the browser, a day at most – and beside it there is a second cookie that holds nothing but the note that this login ends with the browser. Logging out deletes both. Because your account can't work without them, they are strictly necessary and need no consent (§ 25 (2) no. 2 TDDDG). As long as you're not logged in, Boop sets no cookies at all."
    ),
    p(
      "Boop is a web app you can install, and it also works without internet. For that, Boop keeps your account's calendars, stamps and prints in your browser's local storage (IndexedDB) – along with your name and email address, the display names of your calendars' members and changes that haven't reached the server yet – and a service worker caches the app's files so it opens without a connection too. Changes you make offline are sent to the server once you're back online."
    ),
    p(
      "Your browser also remembers a few small things (localStorage): the ink pad you chose last, an invitation you opened before logging in – until you log in – and whether your login ends when the browser closes."
    ),
    p(
      "This data stays on your device. Logging out, and deleting your account, deletes your account's data stored there, and you can remove everything yourself at any time in your browser's settings. If your login merely runs out, it stays on the device until someone logs in there again – so on a device you share with others, always log out. This storage, too, is strictly necessary for the feature you use (§ 25 (2) no. 2 TDDDG)."
    ),
    p(
      "There are no other cookies – no tracking or advertising cookies, and no third-party analytics or tracking services."
    ),

    h3("Anonymous statistics"),
    p(
      "So I can see whether and how Boop is used, the site sends a short note to my server when a page is opened and on a few actions – for example “account created”, “stamp placed” or “calendar shared”. Only coarse details are stored: the page (the app counts as one single page; which calendar is open is not transferred), a coarse source (such as “Google” or “direct”, never the full address), the device class (phone, tablet or computer), operating system and browser with their major version, for an action its kind – never its content – and the time."
    ),
    p(
      "No cookies are set for this, no IP addresses stored and no identifiers assigned – single entries can neither be traced to a person or an account nor linked to each other. The entries are deleted after 90 days. Legal basis: Art. 6 (1) (f) GDPR; my legitimate interest is improving Boop. If your browser sends the “Global Privacy Control” signal, nothing is counted."
    ),

    h3("Retention and deletion"),
    p(
      "Your account data and everything you create in Boop is kept as long as your account exists. For everything else the periods named above apply: invitations 14 days, the anonymous statistics 90 days, messages from the contact form until the matter is settled."
    ),
    p(
      "So that no data lingers that nobody needs any more, Boop tidies up once a day: a sign-up whose email address wasn't confirmed within 30 days is deleted. An account that wasn't used for 24 months – no login, no opening the app with a connection – is deleted; 30 days before, you get an email. Logging in once is enough, and everything stays as it is. It is only deleted if that email could actually be sent and you then stayed away for the full 30 days. It is deleted just as when you delete it yourself (see below). Legal basis: Art. 6 (1) (f) GDPR together with the principle of storage limitation (Art. 5 (1) (e) GDPR)."
    ),
    p(
      "You can delete your account yourself at any time: in the app under “Account” → “Delete account”. To be safe, Boop asks for your password as you do. Everything that belongs to it is then deleted: your calendars with all the prints on them – for their members too –, your stamps with all the prints made with them, everything you stamped in other people's calendars, and the invitations you sent. In other people's calendars you are no longer a member afterwards. On the device you delete it from, the copy stored there is removed as well."
    ),
    p(
      "So that the other members' devices remove what was deleted as well, a technical deletion marker of it stays stored. It holds neither your name nor your email address nor your drawings."
    ),

    h3("Your rights"),
    p(
      "You have the right of access to your data (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on a legitimate interest (Art. 21 GDPR)."
    ),
    p(
      "Two of these you can do right in the app under “Account”: “Download data” gives you your account's data as a file (JSON) – your account, your calendars and memberships, your stamps, your prints and the open invitations you sent. “Delete account” deletes your account with everything that belongs to it. For anything else – a different email address, say – just write to me through the contact form above."
    ),
    p(
      "You also have the right to lodge a complaint with a data protection supervisory authority, for example the one where you live."
    ),

    h3("No automated decisions"),
    p(
      "Boop makes no automated decisions about you and doesn't profile you (Art. 22 GDPR)."
    ),

    h3("Changes"),
    p(
      "When Boop changes, I update this text. The version published here applies."
    ),
    p("Last updated: ", updated()),

    h2("Rights"),
    p(
      "Boop's software and design are mine – all rights reserved. What you draw yourself is yours. You'll find more of my work at ",
      siteLink("website", "mxwr.de"),
      "."
    ),
  ]);

/** The legal text in a language, as Lexical JSON. */
export const legalSeed = (locale: Locale) =>
  locale === "de" ? german() : english();
