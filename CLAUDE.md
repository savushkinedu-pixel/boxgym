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
- Таблицы: users, classes, bookings, memberships, transactions, freeze_requests

## Структура
- /backend — REST API
- /bot — Telegram бот
- /web — Next.js админ-панель
- /backend/migrations — SQL миграции (001_init, 002_seed, 003_freeze_requests)

## Прогресс
- [x] M0 — Фундамент: monorepo, Supabase схема, Railway CI/CD, бот /start
- [x] M1 — Расписание: CRUD классов, /schedule в боте, страница /schedule в вебе
- [x] M2 — Запись и чекин: бронирование, отмена, /mybookings, /attendees, /mygroup для тренера, /subscribe массовая запись на месяц
- [x] M3 — Баланс: абонементы, автосписание визитов при checkin, история транзакций, freeze-запросы, веб-страница атлетов
- [ ] M4 — Статистика: дашборд, посещаемость, отчёты
- [ ] M5 — Полировка: ReplyKeyboardMarkup меню, онбординг, мониторинг, передача тренеру

## Команды бота (актуальные)
Атлет:
- /start — регистрация, выбор роли
- /schedule — расписание на неделю с кнопкой [Записаться]
- /mybookings — мои записи с кнопкой [Отменить]
- /subscribe — массовая запись на повторяющиеся тренировки (выбор дней + время)
- /balance — текущий абонемент (тип, визиты, срок)
- /history — последние 10 транзакций
- /freeze — заявка на заморозку абонемента (уведомляет admin telegram_id=103842071)

Тренер:
- /mygroup — список записанных сегодня / завтра / на неделю
- /attendees — отметка посещений [✅ Пришёл] [❌ Не пришёл]

## Backend маршруты (актуальные)
- GET/POST /memberships, PATCH /memberships/:id/freeze|unfreeze
- GET /memberships/:userId — активный абонемент (valid_to >= today, is_frozen=false)
- GET/POST /transactions, GET /transactions/export/:userId (CSV)
- POST /freeze-requests, GET /freeze-requests
- PATCH /bookings/:id/checkin — автосписание визита + Telegram при visits_left=0

## Веб-страницы
- /schedule — расписание, создание тренировок
- /athletes — таблица атлетов, баланс, фильтр должников, кнопка [+ Начислить]

## Известные особенности
- Роль берётся из БД по telegram_id (не из сессии)
- /mybookings показывает тренировки начиная с 00:00 текущего дня
- Для теста тренера: UPDATE users SET telegram_id=X WHERE name='Иван'
- Миграцию 003_freeze_requests.sql нужно применить в Supabase вручную
- Admin telegram_id для уведомлений: 103842071

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
П1 — Расписание и запись (готово)
П2 — Баланс и платежи (готово)
П3 — Статистика посещений
Вне скоупа MVP: инвентарь, эквайринг, CRM, LTV
