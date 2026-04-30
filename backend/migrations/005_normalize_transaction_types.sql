-- Migration 005: normalize transaction type values
-- 'charge' was used by PATCH /bookings/:id/checkin (manual trainer check-in)
-- 'debit'  is used by autoCheckin cron (automatic deduction)
-- Unify to 'debit' everywhere so stats and filters have one source of truth.

UPDATE transactions SET type = 'debit' WHERE type = 'charge';

-- Drop any pre-existing constraint and add a strict one
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('debit', 'credit', 'refund', 'adjustment'));
