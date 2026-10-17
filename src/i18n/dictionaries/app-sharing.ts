import { INVITE_DAYS } from "../../features/calendar/invite-expiry";
import type { Shape } from "../flat";
import { template } from "../template";

/** Sharing a calendar, and the invitations that come to the account. */

const de = {
  share: {
    title: "Teilen",
    text: "Lade Leute per E-Mail ein – dabei sind sie, sobald sie Ja sagen.",
    email: "E-Mail-Adresse",
    add: "Einladen",
    // The answer to inviting is the same for every address (calendar/
    // endpoints/members.ts) – only one's own is caught before.
    yourself: "Das ist deine eigene Adresse.",
    invited: template(
      "Einladung an {email} verschickt – sie gilt {days} Tage. Sagt die Person Ja, ist sie dabei.",
      (say) => (email: string) => say({ email, days: INVITE_DAYS }),
      { optional: ["days"] }
    ),
    invitesTitle: "Eingeladen",
    revoke: "Zurückziehen",
    notFound: "Das hat nicht geklappt.",
    members: "Dabei",
    owner: "Besitzer:in",
    remove: "Entfernen",
    leave: "Kalender verlassen",
    leaveAsk: template(
      "Wirklich verlassen? Du siehst ihn dann nicht mehr – zurück kommst du nur, wenn {owner} dich wieder einlädt.",
      (say) => (owner: string) => say({ owner })
    ),
    leaveYes: "Ja, verlassen",
  },
  // Invitations to the account – a popup, and a list in the account sheet
  // (features/app/invitations.tsx).
  invitations: {
    title: "Einladungen",
    count: template(
      { one: "1 Einladung", many: "{n} Einladungen" },
      (say) => (n: number) => (n === 1 ? say.one() : say.many({ n }))
    ),
    popupTitle: "Du bist eingeladen!",
    text: template(
      {
        named: "{from} lädt dich zu „{calendar}“ ein.",
        unnamed: "Du bist zu „{calendar}“ eingeladen.",
      },
      (say) => (from: string, calendar: string) =>
        from ? say.named({ from, calendar }) : say.unnamed({ calendar })
    ),
    until: template(
      "Gilt bis zum {date} Uhr.",
      (say) => (date: string) => say({ date })
    ),
    accept: "Annehmen",
    decline: "Ablehnen",
    later: "Später",
    close: "Schließen",
    offline: "Zum Antworten brauchst du eine Verbindung.",
    joined: template(
      "Du bist jetzt bei „{calendar}“ dabei.",
      (say) => (calendar: string) => say({ calendar })
    ),
    gone: template(
      "Die Einladung zu „{calendar}“ gilt nicht mehr – vielleicht wurde sie zurückgezogen.",
      (say) => (calendar: string) => say({ calendar })
    ),
  },
};

const en: Shape<typeof de> = {
  share: {
    title: "Share",
    text: "Invite people by email – they're in once they say yes.",
    email: "Email address",
    add: "Invite",
    yourself: "That's your own address.",
    invited:
      "Invitation sent to {email} – it's valid for {days} days. They're in once they say yes.",
    invitesTitle: "Invited",
    revoke: "Take back",
    notFound: "That didn't work.",
    members: "Members",
    owner: "Owner",
    remove: "Remove",
    leave: "Leave calendar",
    leaveAsk:
      "Really leave? You won't see it any more – you only get back in if {owner} invites you again.",
    leaveYes: "Yes, leave",
  },
  invitations: {
    title: "Invitations",
    count: { one: "1 invitation", many: "{n} invitations" },
    popupTitle: "You're invited!",
    text: {
      named: "{from} invites you to “{calendar}”.",
      unnamed: "You're invited to “{calendar}”.",
    },
    until: "Valid until {date}.",
    accept: "Accept",
    decline: "Decline",
    later: "Later",
    close: "Close",
    offline: "Answering needs a connection.",
    joined: "You're in “{calendar}” now.",
    gone: "The invitation to “{calendar}” isn't valid anymore – it may have been taken back.",
  },
};

export const sharingTexts = { de, en };
