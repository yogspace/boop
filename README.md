# Boop

A cute doodle stamp calendar. Draw your own stamp – one of five shapes, a few lines, or an uploaded SVG – and it turns into a 3D rubber stamp with your doodle standing out of its face. Dip it into an ink pad and boop it onto your days; every print is a little imperfect, like a real one. Calendars can be shared with other accounts (or invited by mail), and changes show up live on everyone's devices. Stamps can be downloaded as STL to 3D-print them for real. Boop installs like an app and works offline; changes sync once you're back online.

Live: [boop.mxwr.de](https://boop.mxwr.de)

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` for the language redirect), **React 19**, **Tailwind CSS 4**
- **Payload 3** (CMS, auth, REST) on **MongoDB**
- **valtio** for the app's state, **IndexedDB** for the offline copy, a hand-written **service worker**
- **Resend** for mail (verification, password reset, statistics report)
- **Biome** (format + lint), **Vitest**, **pnpm**
- Docker image on GHCR, deployed to a Hetzner server behind Caddy

## Structure

Each feature lives in `src/features/<name>/` and brings its own collections, globals, endpoints and UI. `src/payload.config.ts` only puts them together.

| Feature | What it does |
|---|---|
| `admin` | CMS logins (`users`), first admin from the environment, Seeds page |
| `accounts` | People using Boop (`accounts`): email + password, verification and reset mails (DE/EN), a first calendar at sign-up, cleanup on delete; the app's own login cookie (`session.ts`, `cookie.ts`) with the account's ways out – its data as a JSON file (`export.ts`), deleting itself with its password; account forms |
| `calendar` | `calendars`, `stamps`, `placements`, `notes`, `invites` and the shared model (`model.ts`); a day's note as data – checked, read from the editor, its id (`note.ts`); member endpoints (share by email, remove, leave); invitations by mail for addresses without an account, good for 14 days (`invites.ts`, `invite-expiry.ts`); shapes and rim patterns (`outline.ts`), SVG import (`import-svg.ts`), the stamp colors from the CMS (`palette.ts`), the flat stamp/print renderer (`stamp-svg.tsx`) |
| `sync` | `POST /api/sync` – the app's only way to read and write calendar data – and `GET /api/sync/live`, the live nudges (see below) |
| `ical` | A calendar in calendar apps: private feed addresses (`calendar-feeds`), the feed and the `.ics` file (see “Calendar apps”) |
| `stickers` | Stamps in 3D (three.js): the model with raised doodle and “boop” watermark (`build.ts`), the cartoon ink-line renderer (`ink.ts`) and the special stamps' sparkles (`glitter.ts`), pictures for lists (`render.ts`), the live view (`sticker-view.tsx`), the stamp in hand (`stamp-hand.tsx`), STL export for 3D printing (`export-stl.ts`) |
| `transitions` | Page transitions with the View Transitions API |
| `offline` | The device's copy: IndexedDB (`db.ts`) and the valtio store with outbox and sync (`store.ts`) |
| `app` | The app UI: calendars, month view, day page with ink pads, drawing a stamp, a stamp up close, sharing, dialogs |
| `landing` | The front page's 3D scene |
| `pwa` | Service worker registration (`public/sw.js` is the worker) |
| `analytics` | Anonymous statistics (no cookies, no IP), admin chart views, mail report |
| `site`, `legal` | Settings, imprint and privacy policy (CMS, with code seeds); contact form (`/next/contact`, sends to `MAIL_CONTACT_RECIPIENT`, stores nothing) |
| `translations` | The interface texts in the CMS (“Translations” global): fields from the code's keys, reading with fallback, the seed (see Interface texts) |

Pages are in `src/app/(frontend)/[locale]/` (`de`, `en`); texts in `src/i18n/dictionaries.ts`, editable in the admin.

## Offline and sync

The app always reads and writes the device's copy first. Every change is noted in an outbox (IndexedDB) and sent with the next sync – right after a change, when coming back online, when the app becomes visible, and every 30 s while open.

- Documents get their id on the device (UUID), so things made offline keep their id on the server.
- Every document carries `changedAt` (time of the change on the device): **the later change wins**.
- Deleting keeps a marker (`deleted: true`, without content) so other devices remove it too.
- The server checks every change (`src/features/sync/apply.ts`): only owners rename/delete calendars and change their stamps; members place, move and remove stamps in their calendars, and write the days' notes.
- **Notes** (`notes`): one per day of a calendar, its id made of calendar and day (UUID v5, `calendar/note.ts`) – written on two devices at once, it is still one note, and the later change wins. Stored as lines of runs (`{ text, b?, u? }`), never HTML, checked on the server and again before it shows. Emptied, a note is deleted, and may be written again. They go with their calendar.
- A sync answers with everything new since the last one; calendars new to a device come complete; stamps a device lacks are asked for by id.

**Live:** every open app holds `GET /api/sync/live` (Server-Sent Events). After a sync that changed something, the server nudges all members of the affected calendars, and their devices sync at once. The nudge carries no data. It lives in memory, which fits one server process (several would need a shared channel). Polling every 30 s and on focus remains as the net below.

The app page is static and the same for everyone, so the service worker can open it without a connection. `/api`, `/admin` and `/next` are never cached.

**The app's address:** `/de/app/{calendar}/{heute|monat}`, `/en/app/{calendar}/{today|month}` (`features/app/address.ts`). The calendar goes by a slug of its name (small letters, umlauts written out, everything else a dash; no name: `kalender`/`calendar`). Names repeat, so a slug is looked up among the calendars of the account on the device – own ones before shared ones, then by id; the same slug again gets `-2`, `-3`. The views' words are the page's language; both languages are read. Old addresses with the calendar's id still open it. The browser reads the address and writes it anew – no navigation, the page stays: picking another calendar or view is a new history entry (`pushState`, so Back returns to the one before); corrections (the first open, a rename, the language) replace the entry. Each entry also keeps the calendar's id, so Back and a reload find it after a rename. The view last picked is kept per calendar on the device (`prefs`, `view`); the address's view goes first, today is the default.

All of `/{locale}/app/…` is one page: the proxy (`src/proxy.ts`) rewrites it to `/{locale}/app` – built once per language, cached once on the server – and the service worker keeps one copy per language for all these addresses, so an address never opened before also opens offline.

## Stamps and prints

A stamp is drawn on one of five shapes (circle, square, octagon, triangle, diamond) in one color – a key of the stamp colors kept in the CMS (“Site” → Stamp colors). Its drawing may also hold an uploaded SVG's filled areas, a rim pattern, `inverted` (the face in ink, the doodle cut out) and `special` (bigger prints that glitter). In 3D (`features/stickers`) it becomes a rubber stamp drawn like a cartoon – flat colors and ink lines: a block with a knob, the rim and doodle standing out of the rubber face, “boop” engraved on top. The rubber face is a closed surface built from a height map of the drawing, so the same model exports as a printable STL (40 mm, mirrored so the real print reads correctly). It stands on its rubber face, knob up: the knob prints without supports, only bigger hollows between the raised lines need supports from the bed.

A print (`placements`) records the ink pad it was made with (`ink`). It shows what stands out of the rubber: rim and doodle in ink (an inverted stamp: the face in ink, the doodle as gaps). A per-print seed makes coverage, grain and edges a little different every time.

## Calendar apps

A calendar can be subscribed to in Apple Calendar, Google Calendar & co. (`features/ical`). Every day with prints or a note is one all-day event: the names of the stamps on it, each once (“Sport, Lesen”; unnamed ones counted: “3 Stempel”), the note as plain text in its description; its `UID` is made of calendar and day, `LAST-MODIFIED` is the day's latest change. The few fixed words are in the account's language.

- **The feed:** `GET /api/ical/{token}.ics` – no cookie, the token (192 random bits) is the key, as calendar apps can't log in. `text/calendar`, RFC 5545 (CRLF, folded at 75 octets), refresh every hour; `ETag` → `304`; rate-limited per feed. It is good only while its account is in the calendar – checked at every fetch: left, taken out, calendar or account deleted, and it's a plain `404` (and the entry goes). Tokens are never logged.
- **Per account and calendar, from the calendar's settings** (cookie, members only): `GET|POST|DELETE /api/ical/feeds/:calendar`, `POST /api/ical/feeds/:calendar/renew` (the old address is dead at once), and `POST /api/ical/export/:calendar` – the same text once as a file.
- **`calendar-feeds`**: account, calendar, token, `createdAt`, `lastFetchedAt` (once a day at most). Closed to everyone over the API, the admin too, and hidden in the admin – only server code with `overrideAccess`. The token is stored as it is, on purpose: the settings show the address again. Feeds go with their account (`removeData`), are in its export without the token, and dead ones are swept whenever an address is made.

## Access

Two kinds of login: admins (`users`, Payload's cookie `boop-token`) and accounts. Payload keeps all auth collections in one cookie, so an app login would lock the admin out. Accounts therefore get their own cookie, `boop-session` (`features/accounts/session.ts`). It replaces Payload's login, logout, “me” and reset endpoints for `accounts` and checks the token with Payload's own strategies. App endpoints find their account with `sessionAccount(req)` and refuse cookie requests from other origins.

A login lasts 30 days on a device. With “stay logged in” unticked (the login form's box, ticked by default) the cookie has no expiry – the browser drops it when it closes – and its token ends after a day.

An account changes its name, downloads its data as a JSON file (`POST /api/accounts/me/export`) and deletes itself (`DELETE /api/accounts/me` with its password) from the app's account sheet; deleting takes its calendars, its stamps with their prints, what it stamped elsewhere and the invitations it sent along.

Accounts don't stay forever (`features/accounts/retention.ts`, run by the daily cleanup): a sign-up never confirmed goes after 30 days; an account unused for 24 months gets a mail and goes 30 days later. “Used” is `lastSeenAt`, noted at a login and a sync (once a day at most); a login or sync after the mail takes it back. An account without `lastSeenAt` counts as seen today, and without a delivered mail (no Resend, or Resend refused) nobody is warned – and so nobody deleted. At most 50 accounts are warned and 50 deleted per run.

Payload's default access ("any logged-in user") would let accounts in everywhere, so **every collection and global sets access explicitly** via `src/access` – `test/access/access.test.ts` reads the config as written and fails for one without its rules.

**The CMS runs Boop; it doesn't read what people made.** Admins keep the settings, the legal text, the texts, the statistics (anonymous; the accounts' numbers are counted on the server, `analytics/account-totals.ts`) and the admins.

- **People's content** – `calendars`, `stamps`, `placements`, `notes`, `invites`, `push-subscriptions`, `push-settings` (and `calendar-feeds`): closed over REST to everyone, admins included (`sealed`), and hidden in the admin. The app reaches it only through its own server code – sync, member and invitation endpoints, push, iCal, hooks, crons, export, deleting an account – which checks the account itself and reads and writes with `overrideAccess: true` (every such call has it). GraphQL is off.
- **Accounts:** the admin sees address, name, confirmed, language, created, last seen and the deletion warning – and only deletes an account (with everything in it, `removeData`) or unlocks its login (“Unlock login”). Nothing of an account can be changed in the admin – no name, address or password, so no way in as that person – and no account made there. Sessions, failed tries and tokens are never shown. The app changes its own name and language through `PATCH /api/accounts/me`.
- **Support mode,** for the rare case that needs a look – finding a bug, answering a request for someone's data by hand: `ADMIN_SUPPORT=1` in the server's `.env` makes the content collections readable (never writable) for admins in `/admin`, with a band on every page saying so. It is not in the deploy's secrets: set it by hand (`/opt/apps/boop/.env`, then `docker compose up -d --force-recreate boop`), and take it out the same way – the next deploy rewrites the `.env` without it anyway. Whoever has the server can read the database regardless; this only keeps the admin from showing it in normal running.

## Interface texts

In the admin under **Translations**, German and English (locale switch at the top). The fields come from the keys in `src/i18n/dictionaries.ts`: a new key is a new field right away, the site shows its text from the code; **Seeds → Translations** writes it into the CMS and deletes keys the code no longer has. What is changed in the admin is never overwritten. An empty field, a key the CMS doesn't have yet, no database (the build): the code's text. Saving renders the pages anew – the app's static page included – so the texts show right away.

- **Lists** (months, weekdays, keywords, the front page's features) are numbered fields – `app.months.0` … – and stay as long as the code has them.
- **Texts with something in them** are templates (`src/i18n/template.ts`): placeholders in braces, “Hallo {name}!”, and one field per wording where the code picks one – `app.pending.one` / `.many`, `app.hello.named` / `.unnamed`. Under each field: the code's text in both languages and the placeholders it keeps. A text with a placeholder the code doesn't fill, or without a needed one, is refused when saving – and on the site, a text that doesn't fit shows the code's instead. Constants are placeholders too (`{days}` of an invitation), filled by the code. A function written by hand in the dictionary still works, but stays out of the CMS (a test lists it as to do).
- **Reading:** client components call `dictionaryOf(locale)` – the layout hands the CMS's texts to `TextsProvider`, which puts them in use while rendering, on the server and in the browser. Server components, `generateMetadata`, routes and notifications `await getDictionary(locale)` (`features/translations/get-texts.ts`; cached with the tag `texts`).
- **Size:** a page carries only the CMS's texts that differ from the code's (the code's are in its scripts anyway) – of both languages, since the app switches without loading anew. Unchanged: nothing; everything rewritten in both languages: about 35 KB in the HTML (10 KB gzipped).

Not here (yet): the mails' texts (`features/accounts/emails.ts`, the invitation in `features/calendar/invites.ts`) and the contact form's – they have their own tables in the code.

## Development

```bash
pnpm install
cp .env.example .env      # fill PAYLOAD_SECRET (openssl rand -hex 32)
make up-db                # MongoDB on localhost:27019
pnpm dev                  # http://localhost:3000
```

- Without `RESEND_API_KEY` no mail is sent: the links (confirm address, new password) are written to the server log.
- The first admin: set `PAYLOAD_ADMIN_EMAIL`/`PAYLOAD_ADMIN_PASSWORD`, or create it at `/admin`.
- The service worker is off in `pnpm dev`; `NEXT_PUBLIC_SW_DEV=1` turns it on to try offline locally (or use `pnpm build && pnpm start`).
- After changing collections: `pnpm generate:types`; after adding admin components: `pnpm generate:importmap`.
- Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

### Font

Boop uses **Satoshi** (Indian Type Foundry, ITF Free Font License) as a self-hosted variable font. The license forbids redistribution, so it is **not in the repo**: `scripts/prepare.mjs` downloads it from Fontshare into `public/fonts/` (ignored) before `dev` and `build`. Without it the system font applies.

## Deploy

`make deploy` merges `development` into `main` and pushes; the pipeline (`.github/workflows/deploy.yml`) then runs lint, types and tests, builds the image and deploys it to `/opt/apps/boop` on the server.

Repository **variables** (public, baked into the build): `NEXT_PUBLIC_SERVER_URL`, `MAIL_FROM`, optional `GOOGLE_SITE_VERIFICATION`.
Repository **secrets**: `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY`, `PAYLOAD_SECRET`, `RESEND_API_KEY`, `CRON_SECRET`, `MAIL_STATS_RECIPIENT`, `MAIL_CONTACT_RECIPIENT`, optional `PAYLOAD_ADMIN_EMAIL`/`PAYLOAD_ADMIN_PASSWORD` (first admin).

The server's `.env` is rewritten from them on every deploy. Two daily crons (`scripts/setup-cron.sh`, installed by the deploy; log: `journalctl -t boop-cron`): the statistics report (`/next/cron/stats-digest`) and the cleanup (`/next/cron/cleanup` – expired invitations, unconfirmed sign-ups, unused accounts; see Access). The cleanup answers with counts only; `?dry=1` shows what it would do without doing it.

## SEO

Public pages (start, sign-up, legal) are indexable in both languages: canonical and `hreflang` links, `sitemap.xml`, `robots.txt`, Open Graph image, schema.org `WebApplication`. Account pages are `noindex`; the app itself, `/api`, `/admin` and `/next` are disallowed.
