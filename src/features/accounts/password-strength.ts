/**
 * How easy a new password is to guess – a quick look in the browser while
 * one is chosen (forms.tsx), to warn, not to forbid: whatever this says,
 * the password can be sent. Nothing leaves the device for it – no service
 * is asked, the list of the usual suspects is here. No imports: the unit
 * tests read this too.
 *
 * What it catches, in this order – the first that fits is the reason:
 *
 * - `personal`: the name, or the address before the @, with little else.
 * - `boop`: “boop”, with little else.
 * - `pattern`: repeats and runs – “aaaaaa”, “123456”, “abcdef”, a row of
 *   the keyboard, “abcabc”.
 * - `digits`: digits alone, or a date.
 * - `common`: one of the passwords tried first (`COMMON`) – in capitals or
 *   not, with digits and marks at its ends (“Passwort123!”), with the
 *   usual stand-ins (“p@ssw0rd”).
 * - `short`: under STRONG_LENGTH characters.
 *
 * “With little else”: whoever guesses tries the obvious first, then varies
 * it. So the obvious part is taken away, and if what is left would get a
 * warning on its own, the obvious part is why – “anna1990” is Anna's,
 * “Anna-Gießkanne-Mondschein” is long enough without her.
 */

/** From this many characters on, length alone is no reason for a word. */
export const STRONG_LENGTH = 10;

export type Weakness =
  | "personal"
  | "boop"
  | "pattern"
  | "digits"
  | "common"
  | "short";

export type PasswordCheck = { ok: true } | { ok: false; reason: Weakness };

/** What someone guessing may know of whose password it is. */
export type Owner = { name?: string | null; email?: string | null };

/**
 * The passwords tried first – from the lists of the most used ones, German
 * and English, and what is near them: names, pets, clubs, seasons, the
 * rows of the keyboard, years. In small letters; capitals and what hangs
 * on at the ends are taken off before looking here.
 */
const COMMON = new Set([
  ...`
  123 1234 12345 123456 1234567 12345678 123456789 1234567890 0123456789
  123123 123321 654321 987654321 111111 000000 112233 121212 666666 696969
  777777 7777777 888888 999999 11111111 00000000 147258 147258369 159753
  159357 753951 5201314 123qwe qwe123 abc123 123abc a1b2c3 abcd1234
  1q2w3e 1q2w3e4r 1q2w3e4r5t 1qaz2wsx zaq12wsx 1qay2wsx qay123 abcdef
  abcdefg abc aaaaaa

  qwertz qwertzu qwertzui qwertzuiop qwerty qwertyu qwertyuiop qwert qwer
  asdf asdfg asdfgh asdfghj asdfghjk asdfghjkl yxcv yxcvb yxcvbn yxcvbnm
  zxcv zxcvb zxcvbn zxcvbnm qayxsw qaywsx wasd azerty ytrewq poiuztrewq
  qwertz123 qwerty123 asdf1234

  passwort passwort1 passwort123 meinpasswort kennwort geheim geheimnis
  hallo hallo1 hallo12 hallo123 hallo1234 hallihallo hallowelt servus moin
  moinmoin tschuess tschüss willkommen ichbins ichbinich keins nichts egal
  test test1 test123 test1234 testtest start start123 anfang zugang
  benutzer gast admin admin1 admin123 administrator root toor login user
  guest default changeme letmein welcome welcome1 secret secret123 access
  password password1 password12 password123 passw0rd p@ssword p@ssw0rd
  hello hello123 helloworld whatever nothing trustno1 master master123

  liebe ichliebedich liebling schatz schatzi schatzilein mausi maus
  mausebär mausebaer hase hasi hasilein bärchen baerchen engel engelchen
  herz herzchen prinzessin prinz könig koenig königin koenigin iloveyou
  iloveu loveme lovely love123 love princess angel angels blessed
  sweetheart babygirl darling

  sonne sonnenschein sonnenblume blume blumen stern sterne mond himmel
  regenbogen schmetterling glück glueck glücklich gluecklich freiheit
  freund freundin freunde familie familie123 zuhause heimat sunshine
  freedom flower flowers rainbow diamond silver golden

  hund hunde hündchen katze katzen kätzchen katze123 pferd pferde tiger
  löwe loewe adler wolf fuchs bär baer hamster pony einhorn delfin drache
  drachen monkey dragon tigger dolphin puppy kitty bella luna balu sammy
  rocky lucky benny buster bailey maggie ginger charlie snoopy

  sommer winter frühling fruehling herbst summer spring autumn januar
  februar märz maerz april mai juni juli august september oktober november
  dezember january february march june july october december montag
  dienstag mittwoch donnerstag freitag samstag sonntag wochenende urlaub
  ferien weihnachten ostern

  fussball fußball fussball1 handball tennis schalke schalke04 bayern
  fcbayern bayernmünchen bayernmuenchen bvb bvb09 borussia dortmund werder
  werderbremen hsv eintracht hertha stpauli fcköln fckoeln vfb vfbstuttgart
  football baseball basketball soccer hockey liverpool arsenal chelsea

  deutschland germany berlin hamburg münchen muenchen köln koeln frankfurt
  stuttgart dresden leipzig bremen hannover düsseldorf duesseldorf
  nürnberg nuernberg österreich oesterreich schweiz wien zürich zuerich

  michael thomas andreas stefan daniel markus martin christian alexander
  sebastian tobias florian lukas leon paul jonas felix moritz sabine
  nicole sandra julia anna lisa laura lena sarah marie sophie katharina
  christina melanie stefanie jessica jennifer nadine claudia petra monika
  susanne andrea ashley jordan hunter robert matthew andrew joshua william
  george thunder ranger killer

  mama papa mamapapa oma opa kinder schule arbeit computer handy telefon
  internet fritzbox telekom google facebook youtube instagram iphone
  samsung mercedes porsche ferrari mustang audi volkswagen schokolade
  kaffee bier pizza nutella keks kekse kuchen zucker honig musik gitarre
  klavier chocolate cookie banana orange apple cheese pepper superman
  batman spiderman starwars pokemon minecraft matrix jesus lol123 lollol
  hahaha hehehe

  kalender stempel stempelkalender calendar stamp stamps doodle doodles
  kritzel
  `
    .trim()
    .split(/\s+/),
  // Years – of a birth, a wedding, this one.
  ...Array.from({ length: 100 }, (_, index) => String(1940 + index)),
]);

/** Stand-ins for letters: “p@ssw0rd” is “password”, “h4ll0” is “hallo”. */
const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "€": "e",
};

const unleet = (text: string) =>
  text.replace(/[013457@$€]/g, (sign) => LEET[sign] ?? sign);

const listed = (word: string) =>
  Boolean(word) && (COMMON.has(word) || COMMON.has(unleet(word)));

/** A text: its digits, marks and spaces in front, its middle, those behind. */
const ENDS = /^(\P{L}*)(.*?)(\P{L}*)$/su;

/**
 * What is left once a listed password is taken out – of the whole, or of
 * the middle with as much of the ends as it takes (“passwort” of
 * “Passwort123!”, “admin” of “4dmin!”). Null when none is in it.
 */
const withoutCommon = (text: string): string | null => {
  const [, before = "", middle = "", after = ""] = ENDS.exec(text) ?? [];
  for (let start = 0; start <= before.length; start++) {
    for (let end = after.length; end >= 0; end--) {
      if (listed(before.slice(start) + middle + after.slice(0, end))) {
        return before.slice(0, start) + after.slice(end);
      }
    }
  }
  return null;
};

/**
 * Rows a finger runs along: the alphabet, the digits, the keyboard's –
 * German and English, with and without shift.
 */
const ROWS = [
  "abcdefghijklmnopqrstuvwxyz",
  "0123456789",
  "1234567890ß",
  "1234567890-=",
  "qwertzuiopü+",
  "asdfghjklöä#",
  "<yxcvbnm,.-",
  "qwertyuiop[]",
  "asdfghjkl;'",
  "zxcvbnm,./",
  '!"§$%&/()=?',
  "!@#$%^&*()_+",
];

/** The same key again, or the one next to it in a row. */
const near = (a: string, b: string) =>
  a === b ||
  ROWS.some((row) => {
    const at = row.indexOf(a);
    return at >= 0 && (row[at - 1] === b || row[at + 1] === b);
  });

/**
 * Repeats and runs: something short again and again (“abcabc”,
 * “hallohallo”), or one key after the other – the same, the next, the one
 * before (“aaaaaa”, “123456”, “qwertz”, “zyxw”) – three of them in a row
 * on average.
 */
const isPattern = (text: string) => {
  const repeated = /^(.+?)\1+$/su.exec(text);
  if (repeated && Array.from(repeated[1]).length < STRONG_LENGTH) return true;
  const signs = Array.from(text);
  let runs = 1;
  for (let at = 1; at < signs.length; at++) {
    if (!near(signs[at - 1], signs[at])) runs++;
  }
  return runs * 3 <= signs.length;
};

/** Digits alone – or a date, with its dots and dashes. */
const DIGITS = /^[\d\s./-]+$/u;

/** Why a password is easy to guess without knowing whose it is – or null. */
const weaknessOf = (text: string): Weakness | null => {
  if (isPattern(text)) return "pattern";
  if (DIGITS.test(text)) return "digits";
  const rest = withoutCommon(text);
  if (rest !== null && weaknessOf(rest)) return "common";
  if (Array.from(text).length < STRONG_LENGTH) return "short";
  return null;
};

/** A part shorter than this is in too many passwords by chance. */
const OWN_LENGTH = 3;

/**
 * The words someone guessing knows: the name and the address before the
 * @ – whole, and in their parts (“max.weber” is “maxweber”, “max” and
 * “weber”). Longest first, so a part doesn't cut up the whole.
 */
const ownWords = ({ name, email }: Owner): string[] => {
  const local = (email ?? "").split("@")[0];
  const words = [name ?? "", local].flatMap((source) => {
    const parts = source.normalize("NFC").toLowerCase().match(/\p{L}+|\p{N}+/gu) ?? [];
    return [parts.join(""), ...parts];
  });
  return [...new Set(words)]
    .filter((word) => Array.from(word).length >= OWN_LENGTH)
    .sort((a, b) => b.length - a.length);
};

/** “boop”, also as “b00p” or “booop”. */
const BOOP = /b[o0]{2,}p/gu;

/**
 * Whether a new password is easy to guess, and why. Knowing whose it is
 * (`owner`) adds their name and address to what is tried.
 */
export const checkPassword = (
  password: string,
  owner: Owner = {}
): PasswordCheck => {
  const text = password.normalize("NFC").toLowerCase();
  const own = ownWords(owner).filter((word) => text.includes(word));
  if (
    own.length &&
    weaknessOf(own.reduce((rest, word) => rest.split(word).join(""), text))
  ) {
    return { ok: false, reason: "personal" };
  }
  const unbooped = text.replace(BOOP, "");
  if (unbooped !== text && weaknessOf(unbooped)) {
    return { ok: false, reason: "boop" };
  }
  const reason = weaknessOf(text);
  return reason ? { ok: false, reason } : { ok: true };
};
