-- BoxGym Database Migration 001 — Initial Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text NOT NULL CHECK (role IN ('athlete', 'trainer', 'admin')),
  name          text NOT NULL,
  phone         text,
  telegram_id   bigint UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Classes
CREATE TABLE classes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL,
  trainer_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  start_at         timestamptz NOT NULL,
  duration_min     int NOT NULL DEFAULT 60,
  capacity         int NOT NULL DEFAULT 12,
  recurrence_rule  text,
  location         text,
  is_cancelled     bool NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Bookings
CREATE TABLE bookings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('booked', 'attended', 'no_show', 'cancelled')),
  checked_in_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);

-- Memberships
CREATE TABLE memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('unlimited', 'visits', 'single', 'personal')),
  visits_total  int,
  visits_left   int,
  valid_from    date NOT NULL,
  valid_to      date NOT NULL,
  is_frozen     bool NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id  uuid REFERENCES memberships(id) ON DELETE SET NULL,
  visits_delta   int NOT NULL DEFAULT 0,
  type           text NOT NULL CHECK (type IN ('charge', 'refund', 'manual', 'freeze')),
  note           text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bookings_class_id   ON bookings(class_id);
CREATE INDEX idx_bookings_user_id    ON bookings(user_id);
CREATE INDEX idx_classes_start_at    ON classes(start_at);
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
