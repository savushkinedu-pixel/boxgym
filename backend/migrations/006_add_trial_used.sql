-- Migration 006: add trial_used flag to users
-- Allows one free trial booking per athlete with no active membership.

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;

-- Mark existing athletes who already attended at least one class or had
-- a debit transaction as having consumed their trial.
UPDATE users SET trial_used = true
WHERE id IN (
  SELECT DISTINCT user_id FROM bookings WHERE status = 'attended'
  UNION
  SELECT DISTINCT user_id FROM transactions WHERE type = 'debit'
);
