# BoxGym — Project Context

## Что это
Система управления боксёрским залом. Двухканальная архитектура: **WhatsApp** для атлетов (промышленная эксплуатация) + **Telegram** для тренера/админа и тестирования сложных сценариев. Веб-панель для администратора.

## Архитектура каналов
- **WhatsApp** — основной канал для атлетов. Месячные абонементы, расписание, баланс, история, фото оплаты, уведомления.
- **Telegram** — лаборатория и канал тренера/админа. Управление расписанием, отметки, прорабатываем индивидуальные тренировки и переносы с подтверждением тренера.
- **Backend + Supabase** — общая бизнес-логика, общая база. Боты — тонкие клиенты к одним и тем же API.

От **Viber отказались** — выбрали WhatsApp как более распространённый в Болгарии для целевой аудитории.

## Стек
- Backend: Node.js + Fastify, порт 3001
- Telegram bot: Telegraf (Node.js)
- WhatsApp bot: WhatsApp Business API (планируется в M8)
- Web: Next.js 14 App Router, порт 3000
- DB: Supabase / PostgreSQL
- Хостинг: Railway + Cloudflare (домен edsaw.cc)
- Репо: https://github.com/savushkinedu-pixel/boxgym

## Деплой (Railway)
- Backend: https://boxgym-production.up.railway.app
- Telegram bot: @boxgymbot, сервис valiant-grace, 24/7
- Web: https://boxgym.edsaw.cc
- WhatsApp bot: предстоит (M8)

## Supabase
- Project URL: https://rypgkmnjnyectmcoocoq.supabase.co
- Таблицы: users, classes, bookings, memberships, transactions, freeze_requests, invite_tokens, payment_proofs

## Структура
- /backend — REST API (вся бизнес-логика)
- /bot — Telegram бот (тонкий клиент к backend)
- /bot-whatsapp — WhatsApp бот (планируется в M8)
- /web — Next.js админ-панель
- /backend/migrations — SQL миграции

## Прогресс
- [x] M0 — Фундамент: monorepo, Supabase схема, Railway CI/CD, бот /start
- [x] M1 — Расписание: CRUD классов, /schedule в боте, страница /schedule в вебе
- [x] M2 — Запись и чекин: бронирование, отмена, /mybookings, /attendees, /mygroup, /subscribe
- [x] M3 — Баланс: абонементы, автосписание визитов, история транзакций, freeze-запросы
- [x] M4 — Реферальный онбординг: invite-токены, автозахват профиля Telegram
- [x] M5 — Фото-подтверждение оплаты: атлет шлёт фото → тренер подтверждает/отклоняет
- [x] M6 — Деплой: backend + bot + web в проде на Railway
- [ ] M7 — Рефакторинг: вынос бизнес-логики из Telegram-бота в backend API
- [ ] M8 — WhatsApp бот для атлетов (после регистрации WA Business API)
- [ ] M9 — Telegram переориентируем на тренера/админа + индивидуальные тренировки с подтверждением переноса
- [ ] M10 — Месячные абонементы: создание абонемента → дни/время → авто-генерация bookings на месяц
- [ ] RLS — миграция 005_enable_rls.sql после полировки

## Решённые вопросы
- **Автосписание визитов:** вариант C — авто-списание через 2 часа после `starts_at`, если booking не в статусе `cancelled`. Тренер может вручную отменить запись для защиты от списания.
- **Канал для атлетов:** WhatsApp (не Viber).
- **Логика абонементов:** месячные с автогенерацией bookings (детализация в M10).

## Команды Telegram-бота (текущие, до M7)
Атлет:
- /start — регистрация, выбор роли (после M9 — самозапись для атлетов уберём)
- /schedule — расписание на неделю с кнопкой [Записаться]
- /mybookings — мои записи с кнопкой [Отменить]
- /subscribe — массовая запись на повторяющиеся тренировки
- /balance — текущий абонемент
- /history — последние 10 транзакций
- /freeze — заявка на заморозку (уведомляет admin telegram_id=103842071)

Тренер:
- /mygroup — список записанных сегодня / завтра / на неделю
- /attendees — отметка посещений [✅ Пришёл] [❌ Не пришёл]

## Команды Telegram после M9 (план)
Тренер/админ:
- /today, /week, /freeslots, /who_today
- Подтверждение переносов индивидуальных тренировок
- Управление абонементами и оплатами

## Backend маршруты (актуальные)
- GET/POST /memberships, PATCH /memberships/:id/freeze|unfreeze
- GET /memberships/:userId — активный абонемент (valid_to >= today, is_frozen=false)
- GET/POST /transactions, GET /transactions/export/:userId (CSV)
- POST /freeze-requests, GET /freeze-requests
- PATCH /bookings/:id/checkin — автосписание визита + Telegram при visits_left=0
- Cron: автосписание через 2 часа после starts_at, если не cancelled

## Веб-страницы
- /schedule — расписание, создание тренировок
- /athletes — таблица атлетов, баланс, фильтр должников, кнопка [+ Начислить]

## Известные особенности
- Роль берётся из БД по telegram_id (не из сессии) — ВСЕГДА через GET /users?telegram_id=X
- /balance, /history, /freeze — доступны любой роли
- /mygroup, /attendees — только trainer
- /subscribe — только athlete (после M9 — будет убрана)
- /mybookings показывает тренировки начиная с 00:00 текущего дня
- Admin telegram_id для уведомлений: 103842071
- Все таблицы сейчас UNRESTRICTED — RLS включаем в отдельной миграции после полировки

## Роли пользователей
- athlete — записывается, смотрит баланс
- trainer — отмечает посещения, видит свои группы
- admin — полный доступ, веб-панель

## Seed данные (002_seed.sql)
- Admin: Эд, telegram_id=103842071
- Trainer: Иван, telegram_id=222
- Athletes: Алексей(333), Мария(444), Дмитрий(555)

## Локальный запуск
backend: cd backend && npm run dev
bot: cd bot && npm run dev
web: cd web && npm run dev

## Приоритеты разработки
П1 — Расписание и запись (готово)
П2 — Баланс и платежи (готово)
П3 — Реферальный онбординг + фото оплаты (готово)
П4 — Деплой (готово)
П5 — WhatsApp канал для атлетов
П6 — Индивидуальные тренировки с подтверждением переносов
П7 — Статистика посещений
Вне скоупа MVP: инвентарь, эквайринг, CRM, LTV
