# NFL Pick'ems

Family NFL spread pick'em pool with Retro Bowl arcade styling, ESPN sync, dual leaderboards, confidence bets, and rarity-colored badges.

## Quick start (demo mode)

No database required. Picks are stored in `localStorage`. Defaults to **Regular Season Week 1**.

```bash
npm install
npm run dev
```

Open http://localhost:5173, enter a username, and make picks. Use the week selector to browse other weeks (preseason / regular / playoffs) against live ESPN data.

## Environment variables

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Production | Neon/Netlify DB Postgres connection string |
| `SESSION_SECRET` | Recommended | Secret for sessions |
| `ADMIN_USERNAMES` | Optional | Comma-separated usernames bootstrapped as admin |
| `VITE_USE_BACKEND` | Optional | Set `true` with Netlify Dev to hit API |
| `VITE_DEMO_MODE` | Optional | Force client-only demo even in production builds |

### Local backend (optional)

1. Create a Neon database (or enable Netlify DB on deploy).
2. Set `DATABASE_URL` in `.env`.
3. Push schema: `npm run db:push`
4. Run with Netlify Dev: `npx netlify dev` (sets `VITE_USE_BACKEND=true`)

Without `DATABASE_URL`, the app runs in **demo mode**: ESPN fetch + localStorage picks only.

After pulling schema changes (badges, live-clock columns, etc.), run `npm run db:push` against the target database **before** (or with) shipping code that reads those columns. Netlify build does **not** auto-push schema.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (client-side demo) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Scoring / line-lock unit tests |
| `npm run db:push` | Apply Drizzle schema to database |
| `npx netlify dev` | Local dev with Netlify Functions |
| `npx netlify deploy --prod --build` | Build and publish production from this machine |

## Deploy to Netlify

This site is published with the Netlify CLI from a linked local project (not from a GitHub build):

```bash
npx netlify deploy --prod --build
```

One-time / dashboard setup:

1. Link the project (`npx netlify link`) and enable **Netlify DB** (or a Neon database).
2. Set `DATABASE_URL` and `ADMIN_USERNAMES` in Netlify env vars.
3. Apply schema once: `DATABASE_URL=... npm run db:push`
4. Build / publish / functions are already set in `netlify.toml` (`npm run build`, `dist`, `netlify/functions`).

**Deploy blockers if missing:** `DATABASE_URL` (auth/picks/leaderboards), `ADMIN_USERNAMES` (first admin), and a successful `db:push`. Demo-only deploys can set `VITE_DEMO_MODE=true` and skip the database.

### Scheduled ESPN sync

Handlers skip work outside their windows to stay within free-tier limits:

| Function | When |
|----------|------|
| `sync-espn` | Tue/Wed/Fri/Sat 06:00 & 18:00 UTC (lines / catch-up) |
| `sync-espn-sun` | Every 15m on Sundays (skips before ~9am ET) |
| `sync-espn-primetime` | Every 15m Mon/Thu 22–23 UTC |
| `sync-espn-late` | Every 15m 00–04 UTC Mon/Tue/Fri (SNF / MNF / TNF wrap-up) |

## Features

- **Picks**: Favorite/Underdog + team + spread, 5 confidence bets/week, kickoff lock, live clock / lean bar
- **History**: Past picks with results and units (no pick = wrong)
- **Leaderboard**: Win % and Confidence P/L, overall or by week
- **Stats**: Confidence P/L vs Hypothetical P/L, streaks, weekly table
- **Badges**: Week awards and career-threshold badges (rarity-colored chips on leaderboard / stats). Cumulative badges (`By a Nose`, `Juice Box`, `Road Dog`, `Steamroller`, `Bite Back`) require career totals, not a single hit — definitions live in `shared/badges.ts` (`LIFETIME_BADGE_THRESHOLDS`)
- **Admin**: Ban/unban/delete, display names, lock registration, ESPN sync, one-button badge wipe & recalculate, factory reset
- **Themes**: Light / dark / system

## Scoring

See `shared/scoring.ts` (run `npm test`):

- **Win %**: all locked games count; unpicked = wrong; pushes = 0.5
- **Confidence P/L**: 5 bets/week (regular season); all playoff games auto-count
- **Hypothetical P/L**: all picks at odds + -1 unit per unpicked game
- **ATS**: favorite covers when `(favoriteScore - underdogScore) - spread > 0`

## Badges

Catalog and evaluation: `shared/badges.ts`. Server award / wipe / reconcile: `server/badges.ts`.

- Week-scoped badges award when a slate is fully final (also on Admin recalculate).
- Career-threshold badges are wiped and re-granted from season totals on leaderboard/stats load and after Admin **Reset & recalculate badges**.
- To change a threshold: edit `LIFETIME_BADGE_THRESHOLDS` **and** the matching catalog description, then ship + run recalculate if old rows were granted under the previous rule.

## Project structure

```
src/           React frontend
shared/        Scoring, badges, ESPN client, types (frontend + functions)
server/        Drizzle schema, auth, badge awards, ESPN sync
netlify/       Netlify Functions (API + scheduled sync)
scripts/       One-off tools (import, factory reset, reports)
public/        PWA manifest and icons
```
