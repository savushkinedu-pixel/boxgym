# BoxGym — Project Context

## Что это
Система управления боксёрским залом. Telegram-бот для атлетов и тренеров, веб-панель для администратора.

## Стек
- Backend: Node.js + Fastify, порт 3001
- Bot: Telegraf (Node.js)
- Web: Next.js 14 App Router, порт 3000
- DB: Supabase / PostgreSQL
- Хостинг: Railway + Cloudflare (домен edsaw.cc)
- Репо: https://github.com/savushkinedu-pixel/boxgym

## Supabase
- Project URL: https://rypgkmnjnyectmcoocoq.supabase.co
- Таблицы: users, classes, bookings, memberships, transactions

## Структура
- /backend — REST API
- /bot — Telegram бот
- /web — Next.js админ-панель
- /backend/migrations — SQL миграции (001_init, 002_seed)

## Прогресс
- [x] M0 — Фундамент: monorepo, Supabase схема, Railway CI/CD, бот /start
- [x] M1 — Расписание: CRUD классов, /schedule в боте, страница /schedule в вебе
- [x] M2 — Запись: бронирование, QR-чекин, отметка посещений
- [ ] M3 — Баланс: абонементы, списание, история транзакций
- [ ] M4 — Статистика: дашборд, посещаемость, отчёты
- [ ] M5 — Полировка: онбординг, мониторинг, передача тренеру
  - TODO: ReplyKeyboardMarkup — постоянное меню кнопок для атлета:
    [ 📅 Расписание ] [ 📋 Мои записи ] [ 💰 Баланс ] [ 📊 Статистика ]

## Роли пользователей
- athlete — записывается, смотрит баланс
- trainer — отмечает посещения, видит свои группы
- admin — полный доступ, веб-панель

## Seed данные (002_seed.sql)
- Admin: Эд, telegram_id=111
- Trainer: Иван, telegram_id=222
- Athletes: Алексей(333), Мария(444), Дмитрий(555)

## Локальный запуск
backend: cd backend && npm run dev
bot: cd bot && npm run dev  
web: cd web && npm run dev

## Приоритеты разработки
П1 — Расписание и запись (готово частично)
П2 — Баланс и платежи
П3 — Статистика посещений
Вне скоупа MVP: инвентарь, эквайринг, CRM, LTV
