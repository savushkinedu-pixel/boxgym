-- BoxGym Seed Migration 002

-- Users
INSERT INTO users (role, name, telegram_id) VALUES
  ('admin',   'Эд',      111),
  ('trainer', 'Иван',    222),
  ('athlete', 'Алексей', 333),
  ('athlete', 'Мария',   444),
  ('athlete', 'Дмитрий', 555);

-- Classes (current week: Mon/Wed/Fri 10:00, Tue/Thu 19:00)
-- date_trunc('week', now()) returns Monday of the current week in PostgreSQL
INSERT INTO classes (type, trainer_id, start_at, duration_min, capacity, location)
SELECT
  'boxing',
  (SELECT id FROM users WHERE role = 'trainer' LIMIT 1),
  slot,
  60,
  12,
  'Зал 1'
FROM (VALUES
  (date_trunc('week', now())::date + interval '0 days' + time '10:00'),  -- Пн
  (date_trunc('week', now())::date + interval '1 day'  + time '19:00'),  -- Вт
  (date_trunc('week', now())::date + interval '2 days' + time '10:00'),  -- Ср
  (date_trunc('week', now())::date + interval '3 days' + time '19:00'),  -- Чт
  (date_trunc('week', now())::date + interval '4 days' + time '10:00')   -- Пт
) AS t(slot);
