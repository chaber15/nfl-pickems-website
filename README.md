# NFL Pick'ems

Family NFL spread pick'em pool with Retro Bowl arcade styling, ESPN sync, dual leaderboards, and confidence bets.

## Quick start (demo mode)

No database required. Picks are stored in `localStorage`. Defaults to **Preseason Week 2**.

```bash
npm install
npm run dev
```

Open http://localhost:5173, enter a username, and make picks. Use the week selector to browse other weeks (regular season / playoffs) against live ESPN data.

## Environment variables

Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Production | Neon/Netlify DB Postgres connection string |
| `SESSION_SECRET` | Recommended | Secret for sessions (reserved) |
| `ADMIN_USERNAMES` | Optional | Comma-separated usernames bootstrapped as admin |
| `VITE_USE_BACKEND` | Optional | Set `true` with Netlify Dev to hit API |
| `VITE_DEMO_MODE` | Optional | Force client-only demo even in production builds |

### Local backend (optional)

1. Create a Neon database (or enable Netlify DB on deploy).
2. Set `DATABASE_URL` in `.env`.
3. Push schema: `npm run db:push`
4. Run with Netlify Dev: `npx netlify dev` (sets `VITE_USE_BACKEND=true`)

Without `DATABASE_URL`, the app runs in **demo mode**: ESPN fetch + localStorage picks only.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (client-side demo) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm test` | Scoring unit tests |
| `npm run db:push` | Apply Drizzle schema to database |
| `npx netlify dev` | Local dev with Netlify Functions |

## Deploy to Netlify

1. Connect this repo to Netlify.
2. Enable **Netlify DB** (or link a Neon database).
3. Set `DATABASE_URL`, `ADMIN_USERNAMES` in the Netlify dashboard.
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Functions: `netlify/functions` (already in `netlify.toml`)

Scheduled `sync-espn` runs every 30 minutes to sync games and grade ATS results.

**Deploy blockers if missing:** `DATABASE_URL` (auth/picks/leaderboards), `ADMIN_USERNAMES` (first admin), and a successful `db:push` so tables exist. Demo-only deploys can set `VITE_DEMO_MODE=true` and skip the database.

## Features

- **Picks**: Favorite/Underdog + team + spread, 5 confidence bets/week, kickoff lock, week selector
- **History**: Past picks with results and units (no pick = wrong)
- **Leaderboard**: Win % and Confidence P/L
- **Stats**: Confidence P/L vs Hypothetical P/L, streaks, weekly table
- **Admin**: Ban users, lock registration, manual ESPN sync
- **Themes**: Light / dark / system

## Scoring

See `shared/scoring.ts` (run `npm test`):

- **Win %**: all locked games count; unpicked = wrong; pushes = 0.5
- **Confidence P/L**: 5 bets/week (regular season); all playoff games auto-count
- **Hypothetical P/L**: all picks at odds + -1 unit per unpicked game
- **ATS**: favorite covers when `(favoriteScore - underdogScore) - spread > 0`

## Project structure

```
src/           React frontend
shared/        Scoring, ESPN client, types (frontend + functions)
server/        Drizzle schema, auth, sync logic
netlify/       Netlify Functions (API + scheduled sync)
public/        PWA manifest and icons
```
