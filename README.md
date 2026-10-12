# Boop

A cute doodle stamp calendar. Draw your own stamp – round or square, a few lines – and it turns into a 3D rubber stamp with your doodle engraved. Dip it into an ink pad and boop it onto your days; every print is a little imperfect, like a real one. Calendars can be shared with other accounts (or invited by mail), and changes show up live on everyone's devices. Stamps can be downloaded as STL to 3D-print them for real. Boop installs like an app and works offline; changes sync once you're back online.

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
| `accounts` | People using Boop (`accounts`): email + password, verification and reset mails (DE/EN), personal calendar at sign-up, cleanup on delete; the app's own login cookie (`session.ts`); account forms |
| `calendar` | `calendars`, `stamps`, `placements`, `invites` and the shared model (`model.ts`); member endpoints (share by email, remove, leave); invitations by mail for addresses without an account (`invites.ts`); the flat stamp/print renderer (`stamp-svg.tsx`) |
| `sync` | `POST /api/sync` – the app's only way to read and write calendar data – and `GET /api/sync/live`, the live nudges (see below) |
| `stickers` | Stamps in 3D (three.js): the model with engraved doodle and “boop” watermark (`build.ts`), pictures for lists (`render.ts`), the live view (`sticker-view.tsx`), STL export for 3D printing (`export-stl.ts`) |
| `transitions` | Page transitions with the View Transitions API |
| `offline` | The device's copy: IndexedDB (`db.ts`) and the valtio store with outbox and sync (`store.ts`) |
| `app` | The app UI: calendars, month view, day page with ink pads, drawing a stamp, a stamp up close, sharing, dialogs |
| `landing` | The front page's 3D scene |
| `pwa` | Service worker registration (`public/sw.js` is the worker) |
| `analytics` | Anonymous statistics (no cookies, no IP), admin chart views, mail report |
| `site`, `legal` | Settings, imprint and privacy policy (CMS, with code seeds); contact form (`/next/contact`, sends to `MAIL_CONTACT_RECIPIENT`, stores nothing) |

Pages are in `src/app/(frontend)/[locale]/` (`de`, `en`); texts in `src/i18n/dictionaries.ts`.

## Offline and sync

The app always reads and writes the device's copy first. Every change is noted in an outbox (IndexedDB) and sent with the next sync – right after a change, when coming back online, when the app becomes visible, and every 30 s while open.

- Documents get their id on the device (UUID), so things made offline keep their id on the server.
- Every document carries `changedAt` (time of the change on the device): **the later change wins**.
- Deleting keeps a marker (`deleted: true`, without content) so other devices remove it too.
- The server checks every change (`src/features/sync/apply.ts`): only owners rename/delete calendars and change their stamps; members place, move and remove stamps in their calendars.
- A sync answers with everything new since the last one; calendars new to a device come complete; stamps a device lacks are asked for by id.

**Live:** every open app holds `GET /api/sync/live` (Server-Sent Events). After a sync that changed something, the server nudges all members of the affected calendars, and their devices sync at once. The nudge carries no data. It lives in memory, which fits one server process (several would need a shared channel). Polling every 30 s and on focus remains as the net below.

The app page is static and the same for everyone, so the service worker can open it without a connection. `/api`, `/admin` and `/next` are never cached.

## Stamps and prints

A stamp is drawn on a round or square base in one color. In 3D (`features/stickers`) it becomes a rubber stamp: a block in its color with a knob, the doodle engraved into the rubber face, “boop” engraved on top. The rubber face is a closed surface built from a height map of the doodle, so the same model exports as a printable STL (40 mm, engraving mirrored so the real print reads correctly).

A print (`placements`) records the ink pad it was made with (`ink`). It is drawn negative, like an engraved stamp prints: the shape in ink, the doodle as gaps. A per-print seed makes coverage, grain and edges a little different every time.

## Access

Two kinds of login: admins (`users`, Payload's cookie `boop-token`) and accounts. Payload keeps all auth collections in one cookie, so an app login would lock the admin out. Accounts therefore get their own cookie, `boop-session` (`features/accounts/session.ts`). It replaces Payload's login, logout, “me” and reset endpoints for `accounts` and checks the token with Payload's own strategies. App endpoints find their account with `sessionAccount(req)` and refuse cookie requests from other origins.

Payload's default access ("any logged-in user") would let accounts in everywhere, so **every collection and global sets access explicitly** via `src/access` (`adminOnly`, `isAdmin`). The calendar collections are admin-only over REST; accounts go through the sync, member and invitation endpoints.

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

The server's `.env` is rewritten from them on every deploy. The daily statistics report runs by cron (`scripts/setup-cron.sh`, installed by the deploy; log: `journalctl -t boop-cron`).

## SEO

Public pages (start, sign-up, legal) are indexable in both languages: canonical and `hreflang` links, `sitemap.xml`, `robots.txt`, Open Graph image, schema.org `WebApplication`. Account pages are `noindex`; the app itself, `/api`, `/admin` and `/next` are disallowed.
