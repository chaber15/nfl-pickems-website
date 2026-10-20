# SQL probes

`probe-audit.sql` is read-only (SELECT only). Run it on any database:

```
psql "$DATABASE_URL" -f scripts/sql/probe-audit.sql
```

## What each query means

1. **Preseason weeks / final games in them.** Non-zero means preseason rows exist, and season-wide queries that do not filter `phase <> 'preseason'` will count them (audit M1).
2. **Graded win/loss ★ picks whose picked side has null juice.** Non-zero means those ★ bets scored 0 units in `unitsDelta` (null odds), so they are silently free wins/losses (M4).
3. **Closed weeks with zero graded games.** Non-zero means a missed-★ charge would be applied to a week where nothing was graded (M14).
4. **Case-insensitive duplicate usernames.** Non-zero means the login lookup by `lower(username)` is ambiguous and a unique index on `lower(username)` cannot be created until resolved (M16).

## Differences from the task card

- Q2 also requires `ats_result in ('favorite','underdog')`: `unitsDelta` returns 0 for push/null regardless of odds, so only win/loss rows are affected.
- Q3 follows `isWeekClosed` in `shared/scoring.ts` (the leaderboard's definition, `server/api/leaderboard.ts`): the week has games and every game is non-`scheduled` or already kicked off. "Graded" is `isGradedForStandings` (`status = 'final'` and `ats_result is not null`), not the card's "final with non-null spread". The output also shows `final_with_spread` for comparison. Playoff weeks are included in the output (see the `phase` column); the missed-★ charge itself only applies to non-playoff weeks.

## Results

Dev (Neon dev branch, reset from prod on 2026-10-19, so ≈ prod), run 2026-10-19:

| Query | Result |
| --- | --- |
| Q1 preseason weeks / final games | 0 / 0 |
| Q2 ★ picks on null-juice games | 0 (no rows) |
| Q3 closed weeks with zero graded games | 0 (no rows) |
| Q4 duplicate lower(username) | 0 (no rows) |

Prod: not run (for Caleb to run with the same file).
