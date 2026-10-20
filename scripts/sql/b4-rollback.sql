-- Undo scripts/sql/b4-prod.sql. Drops only the objects Batch 4 created. Deploy the previous
-- code first (Batch 4 code fails open without the table, so the order isn't critical).
DROP TABLE IF EXISTS admin_unlock_attempts;
DROP INDEX IF EXISTS sessions_user_id_idx;
DROP INDEX IF EXISTS users_username_lower_idx;
