import { STRONG_LENGTH } from "../../features/accounts/password-strength";
import { INVITE_DAYS } from "../../features/calendar/invite-expiry";
import type { Shape } from "../flat";
import { template } from "../template";

/**
 * Getting in: the forms to log in and register, a forgotten password, an
 * invitation's page, confirming an address – a new one too.
 */

const de = {
  auth: {
    name: "Wie sollen wir dich nennen?",
    email: "E-Mail-Adresse",
    password: "Passwort",
    newPassword: "Neues Passwort",
    passwordHint: "Mindestens 8 Zeichen.",
    // Under a new password that is easy to guess: why, then the tip. A
    // warning, no rule – it can be sent all the same (accounts/
    // password-strength.ts).
    weakPassword: {
      personal:
        "Dein Name oder deine Adresse steckt darin – darauf kommt man schnell.",
      boop: "„Boop“ ist bei Boop das Erste, was jemand probiert.",
      pattern:
        "Folgen und Wiederholungen wie „1234“ oder „aaaa“ sind schnell erraten.",
      digits: "Nur Ziffern oder ein Datum sind schnell erraten.",
      common:
        "Das gehört zu den Passwörtern, die zuerst probiert werden – auch mit Ziffern dahinter.",
      short: template(
        "Recht kurz – unter {min} Zeichen ist ein Passwort schnell erraten.",
        (say) => say({ min: STRONG_LENGTH }),
        { optional: ["min"] }
      ),
      tip: "Drei, vier zufällige Wörter sind lang und gut zu merken.",
    },
    working: "Einen Moment …",
    failed: "Das hat nicht geklappt. Versuch es bitte noch einmal.",
    offline: "Du bist offline – dafür brauchst du eine Verbindung.",
    login: {
      title: "Willkommen zurück",
      submit: "Anmelden",
      noAccount: "Noch kein Konto?",
      forgot: "Passwort vergessen?",
      wrong: "E-Mail oder Passwort stimmen nicht.",
      unverified:
        "Bitte bestätige zuerst deine E-Mail-Adresse – schau in dein Postfach.",
      locked:
        "Zu viele Versuche. Warte ein paar Minuten oder setz dein Passwort zurück.",
      remember: "Angemeldet bleiben",
      rememberOff:
        "Ohne Haken bist du abgemeldet, sobald du den Browser schließt – spätestens nach einem Tag.",
    },
    register: {
      title: "Konto erstellen",
      submit: "Konto erstellen",
      haveAccount: "Schon ein Konto?",
      privacy: "Mit dem Konto gelten unsere Hinweise zum Datenschutz.",
      doneTitle: "Schau in dein Postfach!",
      doneText:
        "Wir haben dir eine Mail geschickt. Bestätige darin deine Adresse, dann kannst du dich anmelden.",
      taken: "Mit dieser Adresse gibt es schon ein Konto.",
      tooMany: "Zu viele Anmeldungen von hier – versuch es später noch einmal.",
    },
    forgot: {
      title: "Passwort vergessen",
      text: "Gib deine Adresse ein – wir schicken dir einen Link für ein neues Passwort.",
      submit: "Link schicken",
      doneTitle: "Unterwegs!",
      doneText:
        "Wenn es ein Konto mit dieser Adresse gibt, ist der Link jetzt in deinem Postfach. Er gilt eine Stunde.",
    },
    reset: {
      title: "Neues Passwort",
      submit: "Passwort speichern",
      invalid:
        "Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.",
    },
    invite: {
      title: "Du bist eingeladen!",
      text: template(
        "{from} möchte den Kalender „{calendar}“ mit dir teilen.",
        (say) => (from: string, calendar: string) => say({ from, calendar })
      ),
      until: template(
        "Die Einladung gilt bis zum {date} Uhr.",
        (say) => (date: string) => say({ date })
      ),
      account:
        "Erstell ein kostenloses Konto oder melde dich an – dann bist du dabei.",
      expiredTitle: "Einladung abgelaufen",
      expired: template(
        {
          named:
            "Einladungen gelten {days} Tage – diese ist leider abgelaufen. Frag {from} einfach nach einer neuen.",
          unnamed:
            "Einladungen gelten {days} Tage – diese ist leider abgelaufen. Frag einfach nach einer neuen.",
        },
        (say) => (from: string) =>
          from
            ? say.named({ from, days: INVITE_DAYS })
            : say.unnamed({ days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
      invalid: template(
        "Diese Einladung gibt es nicht mehr – sie wurde schon benutzt, zurückgezogen oder ist nach {days} Tagen abgelaufen. Frag einfach nach einer neuen.",
        (say) => say({ days: INVITE_DAYS }),
        { optional: ["days"] }
      ),
    },
    verify: {
      title: "Adresse bestätigen",
      working: "Wir bestätigen deine Adresse …",
      done: "Geschafft – deine Adresse ist bestätigt!",
      failed:
        "Der Link ist ungültig oder wurde schon benutzt. Vielleicht ist deine Adresse schon bestätigt?",
      toLogin: "Zur Anmeldung",
    },
    // The link in the mail to a new address (accounts/email-change.ts).
    changeEmail: {
      title: "Neue Adresse bestätigen",
      text: "Ein Klick noch – dann meldest du dich bei Boop mit deiner neuen Adresse an.",
      submit: "Jetzt bestätigen",
      done: "Geschafft – ab jetzt meldest du dich mit deiner neuen Adresse an.",
      failed:
        "Der Link ist abgelaufen oder wurde schon benutzt. Vielleicht ist deine Adresse schon geändert? Sonst fordere in der App unter „Konto“ einfach einen neuen an.",
      taken:
        "Mit dieser Adresse gibt es inzwischen ein anderes Konto. Deine bisherige Adresse bleibt, wie sie ist.",
      toApp: "Zu Boop",
    },
  },
};

const en: Shape<typeof de> = {
  auth: {
    name: "What should we call you?",
    email: "Email address",
    password: "Password",
    newPassword: "New password",
    passwordHint: "At least 8 characters.",
    weakPassword: {
      personal: "Your name or address is in it – that's an easy guess.",
      boop: "“Boop” is the first thing anyone tries at Boop.",
      pattern: "Runs and repeats like “1234” or “aaaa” are quick to guess.",
      digits: "Digits alone or a date are quick to guess.",
      common:
        "That's one of the passwords tried first – even with digits added.",
      short:
        "Rather short – under {min} characters a password is quick to guess.",
      tip: "Three or four random words are long and easy to remember.",
    },
    working: "One moment …",
    failed: "That didn't work. Please try again.",
    offline: "You're offline – this needs a connection.",
    login: {
      title: "Welcome back",
      submit: "Log in",
      noAccount: "No account yet?",
      forgot: "Forgot your password?",
      wrong: "Email or password don't match.",
      unverified: "Please confirm your email address first – check your inbox.",
      locked: "Too many tries. Wait a few minutes or reset your password.",
      remember: "Stay logged in",
      rememberOff:
        "Without the tick you're logged out once you close the browser – after a day at the latest.",
    },
    register: {
      title: "Create account",
      submit: "Create account",
      haveAccount: "Already have an account?",
      privacy: "Our privacy notes apply to your account.",
      doneTitle: "Check your inbox!",
      doneText:
        "We've sent you a mail. Confirm your address there, then you can log in.",
      taken: "There's already an account with this address.",
      tooMany: "Too many sign-ups from here – please try again later.",
    },
    forgot: {
      title: "Forgot password",
      text: "Enter your address – we'll send you a link for a new password.",
      submit: "Send link",
      doneTitle: "On its way!",
      doneText:
        "If there's an account with this address, the link is in your inbox now. It's valid for one hour.",
    },
    reset: {
      title: "New password",
      submit: "Save password",
      invalid:
        "The link has expired or was already used. Simply ask for a new one.",
    },
    invite: {
      title: "You're invited!",
      text: "{from} would like to share the calendar “{calendar}” with you.",
      until: "The invitation is valid until {date}.",
      account: "Create a free account or log in – and you're in.",
      expiredTitle: "Invitation expired",
      expired: {
        named:
          "Invitations are valid for {days} days – this one has expired, sorry. Just ask {from} for a new one.",
        unnamed:
          "Invitations are valid for {days} days – this one has expired, sorry. Just ask for a new one.",
      },
      invalid:
        "This invitation doesn't exist anymore – it was used, taken back or expired after {days} days. Just ask for a new one.",
    },
    verify: {
      title: "Confirm address",
      working: "Confirming your address …",
      done: "Done – your address is confirmed!",
      failed:
        "The link is invalid or was already used. Maybe your address is confirmed already?",
      toLogin: "Go to log in",
    },
    changeEmail: {
      title: "Confirm new address",
      text: "One more click – then you log in to Boop with your new address.",
      submit: "Confirm now",
      done: "Done – from now on you log in with your new address.",
      failed:
        "The link has expired or was already used. Maybe your address is changed already? Otherwise simply ask for a new one in the app under “Account”.",
      taken:
        "There's another account with this address by now. Your address stays as it is.",
      toApp: "Open Boop",
    },
  },
};

export const authTexts = { de, en };
