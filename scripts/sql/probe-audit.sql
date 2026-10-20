-- Read-only audit probes (T0). Safe to run on dev or prod: SELECT only.
--   psql "$DATABASE_URL" -f scripts/sql/probe-audit.sql
-- See scripts/sql/README.md for what a non-zero result means.

\echo '== Q1: preseason weeks, and final games inside them'
select
  count(distinct w.id)                                  as preseason_weeks,
  count(g.id) filter (where g.status = 'final')         as preseason_final_games
from weeks w
left join games g on g.week_id = w.id
where w.phase = 'preseason';

\echo '== Q2: graded picks (win/loss) on a star whose picked side has null juice'
-- Picked venue: pick='favorite' -> favorite_side's odds; pick='underdog' -> the other venue.
-- Mirrors shared/scoring.ts unitsDelta: a win/loss with null odds is worth 0 units.
select count(*) as star_picks_null_juice
from picks p
join games g on g.id = p.game_id
where p.is_confidence_bet
  and g.status = 'final'
  and g.spread_cents is not null
  and g.favorite_side is not null
  and g.ats_result in ('favorite', 'underdog')
  and case
        when p.pick = 'favorite' then (case g.favorite_side when 'home' then g.odds_home else g.odds_away end)
        else                          (case g.favorite_side when 'home' then g.odds_away else g.odds_home end)
      end is null;

\echo '-- Q2 rows'
select p.id as pick_id, p.user_id, g.id as game_id, g.away_abbrev, g.home_abbrev,
       p.pick, g.favorite_side, g.odds_away, g.odds_home, g.ats_result
from picks p
join games g on g.id = p.game_id
where p.is_confidence_bet
  and g.status = 'final'
  and g.spread_cents is not null
  and g.favorite_side is not null
  and g.ats_result in ('favorite', 'underdog')
  and case
        when p.pick = 'favorite' then (case g.favorite_side when 'home' then g.odds_home else g.odds_away end)
        else                          (case g.favorite_side when 'home' then g.odds_away else g.odds_home end)
      end is null
order by g.kickoff_at;

\echo '== Q3: closed weeks (per isWeekClosed) with zero graded games'
-- Closed = has games and every game is non-scheduled OR kicked off (shared/scoring.ts isWeekClosed).
-- Graded  = status final AND ats_result not null (isGradedForStandings).
select w.id as week_id, w.season_id, w.season_type, w.week_number, w.phase,
       count(*) as games,
       count(*) filter (where g.status = 'final') as final_games,
       count(*) filter (where g.status = 'final' and g.spread_cents is not null) as final_with_spread
from weeks w
join games g on g.week_id = w.id
group by w.id
having bool_and(g.status <> 'scheduled' or g.kickoff_at <= now())
   and count(*) filter (where g.status = 'final' and g.ats_result is not null) = 0
order by w.season_id, w.season_type, w.week_number;

\echo '== Q4: usernames that collide case-insensitively'
select lower(username) as username_lc, count(*) as n
from users
group by 1
having count(*) > 1;
