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
      "Du erreichst mich über das Kontaktformular im Impressum oben. Name, E-Mail-Adresse und Nachricht gehen dabei per E-Mail an mich – verschickt über Resend (siehe „E-Mails über Resend“); auf der Website wird davon nichts gespeichert. Ich nutze die Angaben nur, um dir zu antworten, und lösche die Mail, wenn die Sache erledigt ist (Art. 6 Abs. 1 lit. b und f DSGVO). Gegen Missbrauch hält der Server deine IP-Adresse höchstens zehn Minuten im Arbeitsspeicher."
    ),

    h3("Hosting und Server-Logfiles"),
    p(
      "Boop läuft auf einem Server der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Deutschland; mit Hetzner besteht ein Vertrag zur Auftragsverarbeitung. Dort liegt auch die Datenbank mit allem, was in Boop gespeichert wird."
    ),
    p(
      "Bei jedem Aufruf verarbeitet der Server technisch notwendige Daten – IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browsertyp und Betriebssystem – in Server-Logfiles, um die Website auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein berechtigtes Interesse ist ein sicherer, funktionierender Betrieb."
    ),
    p(
      "Solange die App geöffnet ist, hält sie eine Verbindung zum Server offen, über die sie erfährt, wenn sich in deinen Kalendern etwas geändert hat – so ist sie gleich auf dem neuesten Stand. Dafür werden keine zusätzlichen Daten gespeichert."
    ),

    h3("Dein Konto"),
    p(
      "Um Boop zu nutzen, legst du ein Konto an. Dafür speichere ich deine E-Mail-Adresse, deinen Anzeigenamen und die Sprache, die du gewählt hast. Dein Passwort speichere ich nie im Klartext, sondern nur als gesalzenen Hash – daraus lässt es sich nicht zurückgewinnen, auch nicht von mir. Dazu kommen technische Angaben, die die Anmeldung braucht, etwa ob deine E-Mail-Adresse bestätigt ist und wann das Konto angelegt wurde."
    ),
    p(
      "Nach der Registrierung bekommst du eine E-Mail mit einem Link, mit dem du deine Adresse bestätigst. Hast du dein Passwort vergessen, kannst du dir eine E-Mail mit einem Link zum Zurücksetzen schicken lassen. Newsletter oder Werbung verschicke ich nicht."
    ),
    p(
      "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO: Ohne diese Angaben kann ich dir kein Konto anbieten."
    ),

    h3("Deine Kalender, Stempel und Tage"),
    p(
      "Was du in Boop anlegst, wird in deinem Konto gespeichert: deine Kalender, die Stempel, die du selbst zeichnest (die Zeichnung und ihre Farben), und die Tage, an denen du Stempel setzt – also welcher Stempel an welchem Tag in welchem Kalender liegt. So ist alles auf jedem Gerät da, auf dem du angemeldet bist."
    ),
    p(
      "Einen Kalender kannst du mit anderen Boop-Konten teilen. Wer Mitglied eines Kalenders ist, sieht seinen Inhalt – die Tage und die Stempel darauf – und wer sonst noch dabei ist. Teile einen Kalender also nur mit Menschen, die das sehen sollen. Einen Kalender, den du nicht teilst, siehst nur du."
    ),
    p(
      "Du kannst auch jemanden einladen, der noch kein Boop-Konto hat. Dann speichere ich die E-Mail-Adresse, die du angibst, zusammen mit dem Kalender und mit der Angabe, wer eingeladen hat, und schicke an diese Adresse eine einzige Einladungsmail (über Resend, siehe unten). Wer eingeladen wird, kann die Mail einfach ignorieren – ohne Konto passiert sonst nichts. Die Einladung wird gelöscht, sobald sie eingelöst ist, spätestens aber nach 30 Tagen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse ist, dass du deinen Kalender mit Menschen teilen kannst, die du selbst auswählst."
    ),
    p(
      "Suchmaschinen finden nur die öffentlichen Seiten von Boop, etwa die Startseite und diese Seite. Deine Kalender und Stempel sind nicht öffentlich und tauchen dort nicht auf."
    ),
    p(
      "Als Betreiber kann ich technisch auf die gespeicherten Daten zugreifen. Ich schaue sie mir nur an, wenn es für den Betrieb, die Sicherheit oder eine Anfrage von dir nötig ist. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO."
    ),

    h3("E-Mails über Resend"),
    p(
      "Die E-Mails zur Bestätigung deiner Adresse, zum Zurücksetzen deines Passworts und mit Einladungen zu Kalendern sowie die Nachrichten aus dem Kontaktformular verschicke ich über den Versanddienst Resend (Resend, Inc., USA), der sie in meinem Auftrag zustellt (Auftragsverarbeitung). Resend erhält dafür die beteiligten E-Mail-Adressen und den Inhalt der jeweiligen Mail. Dabei können Daten in die USA übermittelt werden; abgesichert ist das durch die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Rechtsgrundlage für den Versand ist Art. 6 Abs. 1 lit. b DSGVO, bei Einladungen lit. f (siehe oben)."
    ),

    h3("Cookies und Speicher auf deinem Gerät"),
    p(
      "Boop setzt nur ein einziges Cookie: das Anmelde-Cookie. Es enthält ein signiertes Token, an dem der Server erkennt, dass du angemeldet bist. Beim Abmelden wird es gelöscht, sonst läuft es nach einiger Zeit von selbst ab. Weil dein Konto ohne dieses Cookie nicht funktioniert, ist es unbedingt erforderlich und braucht keine Einwilligung (§ 25 Abs. 2 Nr. 2 TDDDG). Solange du nicht angemeldet bist, setzt Boop gar keine Cookies."
    ),
    p(
      "Boop ist eine Web-App, die du installieren kannst und die auch ohne Internet funktioniert. Dafür legt Boop die Kalender, Stempel und Tage deines Kontos im lokalen Speicher deines Browsers ab (IndexedDB), und ein Service Worker speichert die Dateien der App zwischen, damit sie sich auch ohne Verbindung öffnet. Was du offline änderst, wird an den Server geschickt, sobald du wieder online bist."
    ),
    p(
      "Diese Daten bleiben auf deinem Gerät. Beim Abmelden werden die dort gespeicherten Daten deines Kontos gelöscht, und über die Einstellungen deines Browsers kannst du alles jederzeit selbst entfernen. Auch dieser Speicher ist für die Funktion, die du nutzt, unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG)."
    ),
    p(
      "Weitere Cookies gibt es nicht – keine Tracking- oder Werbe-Cookies und keine Analyse- oder Tracking-Dienste Dritter."
    ),

    h3("Anonyme Statistik"),
    p(
      "Damit ich sehe, ob und wie Boop genutzt wird, meldet die Seite beim Aufruf eine kurze Nachricht an meinen Server. Gespeichert werden nur grobe Angaben: die aufgerufene Seite, die grobe Herkunft (etwa „Google“ oder „direkt“, nie die vollständige Adresse), die Geräteklasse (Handy, Tablet oder Computer), Betriebssystem und Browser mit Hauptversion sowie der Zeitpunkt."
    ),
    p(
      "Dafür werden keine Cookies gesetzt, keine IP-Adressen gespeichert und keine Kennungen vergeben – einzelne Einträge lassen sich weder einer Person noch einem Konto zuordnen und auch nicht miteinander verknüpfen. Die Einträge werden nach 90 Tagen gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; mein berechtigtes Interesse ist, Boop zu verbessern. Sendet dein Browser das Signal „Global Privacy Control“, wird nichts gezählt."
    ),

    h3("Speicherdauer und Löschung"),
    p(
      "Deine Kontodaten und alles, was du in Boop anlegst, bleiben gespeichert, solange es dein Konto gibt. Du kannst dein Konto jederzeit löschen. Dann wird es mit allem gelöscht, was dazugehört: deine Stempel, die Tage und Stempel, die du gesetzt hast, und die Kalender, die dir gehören – auch für ihre Mitglieder. In Kalendern anderer bist du danach kein Mitglied mehr."
    ),

    h3("Deine Rechte"),
    p(
      "Du hast das Recht auf Auskunft über deine Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen, die auf einem berechtigten Interesse beruhen (Art. 21 DSGVO). Schreib mir dafür einfach über das Kontaktformular oben."
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
      "You can reach me through the contact form in the legal notice above. Your name, email address and message reach me by email – sent through Resend (see “Emails via Resend”); nothing of it is stored on the site. I use the details only to answer you and delete the mail once the matter is settled (Art. 6 (1) (b) and (f) GDPR). Against abuse the server keeps your IP address in memory for at most ten minutes."
    ),

    h3("Hosting and server logs"),
    p(
      "Boop runs on a server of Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany, under a data processing agreement. The database with everything stored in Boop is there too."
    ),
    p(
      "With every request the server processes technically necessary data – IP address, date and time, requested address, browser type and operating system – in server logs, to deliver the site and protect it from attacks. Legal basis: Art. 6 (1) (f) GDPR; my legitimate interest is a secure, working service."
    ),
    p(
      "While the app is open, it keeps a connection to the server open, through which it learns when something has changed in your calendars – so it is up to date right away. No extra data is stored for this."
    ),

    h3("Your account"),
    p(
      "To use Boop, you create an account. For it I store your email address, your display name and the language you chose. I never store your password in plain text, only as a salted hash – it cannot be recovered from that, not even by me. Added to that are the technical details logging in needs, such as whether your email address is confirmed and when the account was created."
    ),
    p(
      "After signing up you get an email with a link to confirm your address. If you forget your password, you can have an email sent to you with a link to reset it. I don't send newsletters or advertising."
    ),
    p(
      "Legal basis: Art. 6 (1) (b) GDPR – without these details I can't offer you an account."
    ),

    h3("Your calendars, stamps and days"),
    p(
      "What you create in Boop is stored in your account: your calendars, the stamps you draw yourself (the drawing and its colors), and the days you put stamps on – that is, which stamp sits on which day in which calendar. So everything is there on every device you're logged in on."
    ),
    p(
      "You can share a calendar with other Boop accounts. Whoever is a member of a calendar sees its content – the days and the stamps on them – and who else is in it. So only share a calendar with people who should see it. A calendar you don't share is seen only by you."
    ),
    p(
      "You can also invite someone who doesn't have a Boop account yet. Then I store the email address you enter, together with the calendar and who sent the invitation, and send that address a single invitation email (via Resend, see below). Whoever is invited can simply ignore the mail – without an account, nothing else happens. The invitation is deleted once it is used, or after 30 days at the latest. Legal basis: Art. 6 (1) (f) GDPR; the legitimate interest is that you can share your calendar with people you choose yourself."
    ),
    p(
      "Search engines only find Boop's public pages, such as the home page and this page. Your calendars and stamps are not public and don't show up there."
    ),
    p(
      "As the operator I can technically access the stored data. I only look at it when running the service, keeping it secure or a request from you makes it necessary. Legal basis: Art. 6 (1) (b) GDPR."
    ),

    h3("Emails via Resend"),
    p(
      "I send the emails to confirm your address, to reset your password and to invite people to calendars, as well as the messages from the contact form, through the mail service Resend (Resend, Inc., USA), which delivers them on my behalf (data processing). For this, Resend receives the email addresses involved and the content of the mail. Data may be transferred to the USA in the process; this is safeguarded by the European Commission's standard contractual clauses (Art. 46 (2) (c) GDPR). Legal basis for sending: Art. 6 (1) (b) GDPR, for invitations Art. 6 (1) (f) GDPR (see above)."
    ),

    h3("Cookies and storage on your device"),
    p(
      "Boop sets only one cookie: the login cookie. It holds a signed token that tells the server you're logged in. Logging out deletes it; otherwise it expires by itself after a while. Because your account can't work without it, it is strictly necessary and needs no consent (§ 25 (2) no. 2 TDDDG). As long as you're not logged in, Boop sets no cookies at all."
    ),
    p(
      "Boop is a web app you can install, and it also works without internet. For that, Boop keeps your account's calendars, stamps and days in your browser's local storage (IndexedDB), and a service worker caches the app's files so it opens without a connection too. Changes you make offline are sent to the server once you're back online."
    ),
    p(
      "This data stays on your device. Logging out deletes your account's data stored there, and you can remove everything yourself at any time in your browser's settings. This storage, too, is strictly necessary for the feature you use (§ 25 (2) no. 2 TDDDG)."
    ),
    p(
      "There are no other cookies – no tracking or advertising cookies, and no third-party analytics or tracking services."
    ),

    h3("Anonymous statistics"),
    p(
      "So I can see whether and how Boop is used, the site sends a short note to my server when a page is opened. Only coarse details are stored: the page, a coarse source (such as “Google” or “direct”, never the full address), the device class (phone, tablet or computer), operating system and browser with their major version, and the time."
    ),
    p(
      "No cookies are set for this, no IP addresses stored and no identifiers assigned – single entries can neither be traced to a person or an account nor linked to each other. The entries are deleted after 90 days. Legal basis: Art. 6 (1) (f) GDPR; my legitimate interest is improving Boop. If your browser sends the “Global Privacy Control” signal, nothing is counted."
    ),

    h3("Retention and deletion"),
    p(
      "Your account data and everything you create in Boop is kept as long as your account exists. You can delete your account at any time. It is then deleted with everything that belongs to it: your stamps, the days and stamps you placed, and the calendars you own – for their members too. In other people's calendars you are no longer a member afterwards."
    ),

    h3("Your rights"),
    p(
      "You have the right of access to your data (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and to object to processing based on a legitimate interest (Art. 21 GDPR). Just write to me through the contact form above."
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
