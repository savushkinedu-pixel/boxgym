-- BoxGym Migration 003 — Freeze Requests

CREATE TABLE freeze_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_freeze_requests_user_id ON freeze_requests(user_id);
CREATE INDEX idx_freeze_requests_status  ON freeze_requests(status);
