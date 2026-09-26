# NFL Pick'ems

Family NFL spread pick'em pool with Retro Bowl arcade styling, ESPN sync, dual leaderboards, confidence bets, and rarity-colored badges.

## Quick start

Requires Node 22+, a Postgres database (Neon), and the Netlify CLI.

```bash
cp .env.example .env   # DATABASE_URL = your Neon **dev branch**, plus test ADMIN_PIN / SUPER_ADMIN_PIN
npm install
npm run db:push        # applies schema to whatever DATABASE_URL points at — keep it the dev branch
npm run dev:full       # website + API
```

Open http://localhost:5173, enter a username, and make picks. `npm run dev:full -- --host` also serves it to a phone on the same Wi-Fi (use the "Network" address it prints).

`dev:full` runs Vite for the website and the Netlify functions (`--offline`) for the API, and Vite forwards `/api/*` to them. It prints the database host it's using on start: check that it's the dev branch.

> **Never point local `.env` at production.** `drizzle-kit` and the local API read `DATABASE_URL` from `.env`, so local commands would write to live data. The production `DATABASE_URL` lives only in Netlify env vars. Test against a Neon branch (Neon console → Branches → New branch from `main`).
>
> Don't use `netlify dev` for this project: it shows a blank page (the SPA fallback in `public/_redirects` catches Vite's module requests), and without `--offline` it loads the site's Netlify env vars — including the **production** database.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string (dev branch locally, production only in Netlify) |
| `ADMIN_PIN` | For admin | Passphrase (≥10 chars) that unlocks the Admin page for admins |
| `SUPER_ADMIN_PIN` | For super admin | Separate passphrase (≥10 chars) known only to the owner; unlocks super-admin powers |
| `ALLOW_FACTORY_RESET` | No | Set to `true` only while you intend to run a factory reset; leave unset otherwise |

## Accounts & admin

- Players log in with **just a username** (intentional — family-friendly). Typing an unknown name asks before creating a new player. Names like `admin`/`root` can't be registered.
- Once everyone has joined, close registration in **Admin** so strangers can't create accounts. The leaderboard API requires login.
- **Admin** (`users.is_admin`): unlock with `ADMIN_PIN` once per device → ESPN sync, badge recalculation, edit names, ban/unban, open/close registration.
- **Super admin** (`users.is_super_admin`, set directly in the database): unlock with `SUPER_ADMIN_PIN` → also grant/revoke admin, delete players, factory reset (only if `ALLOW_FACTORY_RESET=true`). Regular admins can't act on a super admin.
- Passphrases are needed because anyone can type any username; changing a PIN in Netlify re-locks every device.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `npm test` | All unit tests (`*.test.ts` in `shared/` and `server/`, via tsx + node:test) |
| `npm run db:push` | Apply Drizzle schema to `DATABASE_URL` (dev branch!) |
| `npm run dev:full` | Local dev: website (http://localhost:5173) + API, database from `.env` |
| `npm run dev` | Website only (API calls fail without `dev:api`) |
| `npm run dev:api` | API only (Netlify functions, offline, port 9999) |

CI (`.github/workflows/ci.yml`) runs build + tests on every push.

## Deploying

Schema changes are **not** applied by the build. For a release that changes `server/db/schema.ts`:

1. Create a fresh Neon branch from `main` as a backup/snapshot.
2. Apply the (additive) schema change to production — review the SQL first.
3. Deploy:

```bash
npx netlify deploy --build            # draft URL to smoke-test
npx netlify deploy --build --prod     # production
```

Redirects (`/api/*` → function, then SPA fallback) live **only** in `public/_redirects`; order matters because Netlify reads that file before `netlify.toml`.

### Scheduled ESPN sync

One hourly function (`netlify/functions/sync-espn.ts`, logic in `server/espn/scheduled.ts`):

- Skips without touching the database from March–July and 2:00–8:59am ET.
- Otherwise one query decides whether ESPN work is due: a game has kicked off and isn't final, a game kicks off within the hour, or lines need refreshing before the Wednesday 8am ET lock.
- Adds any newly earned badges when a week becomes fully final (add-only: it never removes a badge).

Pages also trigger a sync on read (throttled to once per 5 minutes) while games are live, so anyone watching gets near-live scores on any day.

## Features

- **Picks**: Favorite/Underdog + team + spread + juice, ESPN team records, 5 confidence bets/week, kickoff lock, live clock / lean bar
- **Game cards**: Live first, then upcoming by kickoff, completed last; win/loss tint when scored; desktop crowd-name list expands only when a locked card sits beside an open-picks card
- **History**: Past picks with results and units (no pick = wrong)
- **Leaderboard**: Win % and Confidence P/L, overall or by week; badge chips with hover tooltips
- **Stats**: Confidence P/L vs Hypothetical P/L, streaks, weekly table, earned badges
- **Badges**: weekly awards, once-a-season firsts and season totals (rarity-colored chips) — see *Badges*
- **Admin**: passphrase-unlocked; two tiers (see *Accounts & admin*)
- **Themes**: Light / dark / system

## Scoring

See `shared/scoring.ts` (run `npm test`):

- **Win %**: every final game with a line counts; unpicked = wrong; pushes = 0.5. Postponed/canceled games are never graded
- **Confidence P/L**: 5 bets/week (regular season); all playoff games auto-count
- **Hypothetical P/L**: all picks at odds + -1 unit per unpicked game
- **ATS**: favorite covers when `(favoriteScore - underdogScore) - spread > 0`; graded against the line frozen at Wednesday 8:00 AM ET. If the favorite flips before the lock, existing picks are swapped so everyone keeps the team they tapped

## Badges

**Every badge is one entry in `shared/badgeDefs.ts`** — id, name, description, rarity, kind and rule, side by side. Adding, editing or removing a badge only touches that file. The engine (`shared/badges.ts`) builds a read-only summary of each player's completed week and runs every rule over the active season; `server/badges.ts` diffs the result against `user_badges`.

- **Kinds**: `weekly` (earnable every week), `first` (once a season, the first week it happens), `count` (once a season, when the running total reaches `goal`).
- **Hourly job is add-only.** New badges appear as weeks go final; nothing is ever removed automatically, so shipping a stricter rule can't silently take badges away.
- **Admin → Recalculate badges → Preview** lists exactly who gains or loses what (retired badges and old-format rows included). **Apply** recomputes and refuses if anything changed since the preview. Only the active season is touched; existing badges keep their earned date.
- Badges whose id is no longer in the list are hidden immediately and removed on the next Apply.

To change a badge:

1. Edit its entry in `shared/badgeDefs.ts` (never change an `id` once live — that's a remove + add).
2. `npm test` — the golden-season snapshot prints every row the change adds or removes. If intended: `UPDATE_SNAPSHOTS=1 npm test`.
3. Deploy, then Admin → Preview → Apply.

## Project structure

```
src/           React frontend
shared/        Scoring, badges, ESPN client, types, game order (frontend + functions)
server/        Drizzle schema, API handlers, auth, badge awards, ESPN sync
netlify/       Netlify Functions (API + scheduled sync)
public/        PWA assets + `_redirects` (API route + SPA fallback)
```
