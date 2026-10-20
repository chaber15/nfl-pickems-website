-- Batch 4 (fix/b4-schema-auth): additive only — 1 new table, 4 new indexes. Nothing is dropped or altered.
-- Run in the Neon SQL editor on PROD *before* deploying Batch 4. Safe to re-run (IF NOT EXISTS).
-- No CONCURRENTLY: the Neon editor runs a pasted script inside one transaction, where it errors;
-- the tables are tiny, so a plain CREATE INDEX is instantaneous.

-- 1) Stop if two usernames differ only by case (the unique index below would fail).
--    If this raises, rename one of the listed accounts first, then re-run.
DO $$
DECLARE dupes text;
BEGIN
  SELECT string_agg(lower(username) || ' ×' || n, ', ') INTO dupes
  FROM (SELECT lower(username) AS username, count(*) AS n FROM users GROUP BY 1 HAVING count(*) > 1) d;
  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Usernames that differ only by case: %', dupes;
  END IF;
END $$;

-- 2) T24: case-insensitive unique usernames; sessions looked up by user.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

-- 3) T14: admin unlock lockout (5 wrong passphrases in 15 min → locked 15 min, per user and per IP).
CREATE TABLE IF NOT EXISTS admin_unlock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ip text,
  window_start timestamptz NOT NULL,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_unlock_attempts_user_id_idx ON admin_unlock_attempts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_unlock_attempts_ip_idx ON admin_unlock_attempts (ip);

-- 4) Verify: expect 4 index rows and an attempts count of 0.
SELECT indexname FROM pg_indexes
WHERE indexname IN ('users_username_lower_idx', 'sessions_user_id_idx',
                    'admin_unlock_attempts_user_id_idx', 'admin_unlock_attempts_ip_idx')
ORDER BY indexname;
SELECT count(*) AS admin_unlock_attempts_rows FROM admin_unlock_attempts;
