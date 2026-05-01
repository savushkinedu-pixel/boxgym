# BoxGym — Project Context

## Что это
Система управления боксёрским залом. Двухбот-архитектура в Telegram: **@boxgymbot** — лаборатория с тренером для отработки сложных сценариев, **@vladimir_boxing_bot** — рабочий бот для атлетов. Веб-панель для администратора. WhatsApp — на потом, если Telegram не приживётся у болгарских атлетов.

## Архитектура каналов
- **@vladimir_boxing_bot** (Telegram, атлеты) — продакшн, источник истины для рабочего функционала. Все стабильные атлетные команды живут здесь: расписание, баланс, история, фото оплаты, уведомления. Без самозаписи и без сложных сценариев.
- **@boxgymbot** (Telegram, тренер) — лаборатория. Только тренерские команды и нестандартное: управление группой, отметки посещений, индивидуальные тренировки и переносы (M9), эксперименты с новой логикой до миграции в продакшн.
- **Backend + Supabase** — общая бизнес-логика, общая база. Оба бота — тонкие клиенты к одним и тем же API. Между ботами НЕТ прямой связи — только через backend и общую БД.

**Принцип:** никакого дублирования атлетных команд между ботами. Стабильное живёт в одном месте. Когда фича обкатана в @boxgymbot — мигрирует в @vladimir_boxing_bot и удаляется из @boxgymbot.

**WhatsApp отложен.** Сначала валидируем модель в Telegram. Если болгарские атлеты массово не идут в Telegram — переезжаем на WA (M11). От Viber отказались (дорого по экономике).

Тренер — партнёр Эда (не наёмный).

## Стек
- Backend: Node.js + Fastify, порт 3001
- Telegram bots: Telegraf (Node.js)
- Web: Next.js 14 App Router, порт 3000
- DB: Supabase / PostgreSQL
- Хостинг: Railway + Cloudflare (домен edsaw.cc)
- Репо: https://github.com/savushkinedu-pixel/boxgym

## Деплой (Railway)
- Backend: https://boxgym-production.up.railway.app
- @boxgymbot (тренер): сервис valiant-grace, 24/7
- @vladimir_boxing_bot (атлеты): предстоит создать сервис в M8
- Web: https://boxgym.edsaw.cc

## Supabase
- Project URL: https://rypgkmnjnyectmcoocoq.supabase.co
- Таблицы: users, classes, bookings, memberships, transactions, freeze_requests, invite_tokens, payment_proofs

## Структура
- /backend — REST API (вся бизнес-логика после M7)
- /bot — Telegram бот @boxgymbot для тренера (тонкий клиент после M7)
- /bot-athletes — Telegram бот @vladimir_boxing_bot для атлетов (создаётся в M8)
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
- [ ] M7 — Рефакторинг: вынос всей бизнес-логики из @boxgymbot в backend API
- [ ] M7.5 — Security pass: API auth (ключи/JWT между сервисами), реальный ownership через токены, проверка ролей на endpoints. Делается ПЕРЕД M8 потому что второй бот не должен инфицировать backend новыми незащищёнными точками входа.
- [ ] M8 — Создание @vladimir_boxing_bot для атлетов + ВЫРЕЗКА атлетных команд из @boxgymbot (миграция, не дублирование). После M8 в @boxgymbot остаются только тренерские команды.
- [ ] M9 — Индивидуальные тренировки с подтверждением переноса (в @boxgymbot, тренер)
- [ ] M10 — Месячные абонементы: создал абонемент → дни/время → авто-генерация bookings
- [ ] M11 — WhatsApp бот (только если по результатам теста окажется нужен)
- [ ] RLS — миграция 005_enable_rls.sql после полировки

## Решённые вопросы
- **Автосписание визитов:** вариант C — авто через 2 часа после `starts_at`, если booking не в статусе `cancelled`. Тренер может вручную отменить запись для защиты от списания.
- **Каналы:** два Telegram-бота, WhatsApp отложен до результатов теста, Viber отвергнут.
- **Логика абонементов:** месячные с автогенерацией bookings (детализация в M10).
- **Username для бота атлетов:** @vladimir_boxing_bot.
- **Принцип разделения ботов:** @vladimir_boxing_bot — продакшн с атлетными командами (источник истины), @boxgymbot — лаборатория только с тренерскими и экспериментальными. Никакого дублирования атлетных команд. Связь между ботами только через backend.

## Команды @boxgymbot (после M8)
- /today, /week — расписание тренера
- /mygroup — кто записан
- /attendees — отметка посещений
- /invite — создание invite-ссылок
- Индивидуальные тренировки: создание, перенос с подтверждением (M9)
- Подтверждение фото оплаты атлетов
- Управление абонементами

## Команды @vladimir_boxing_bot (атлет, M8) — источник истины для атлетных команд после M8
- /start — регистрация по invite-ссылке
- /schedule — расписание на неделю (только просмотр, без самозаписи)
- /balance — текущий абонемент (тип, визиты, срок)
- /history — последние посещения и транзакции
- /pay — отправить фото оплаты тренеру

## Команды @boxgymbot (текущие, до M8 — атлетные будут вырезаны)
Атлет (временно, до M8 — потом уйдёт в @vladimir_boxing_bot):
- /start, /schedule, /mybookings, /subscribe, /balance, /history, /freeze

Тренер:
- /mygroup, /attendees

## Backend маршруты (актуальные)
- GET/POST /memberships, PATCH /memberships/:id/freeze|unfreeze
- GET /memberships/:userId — активный абонемент
- GET/POST /transactions, GET /transactions/export/:userId (CSV)
- POST /freeze-requests, GET /freeze-requests
- PATCH /bookings/:id/checkin — автосписание визита + Telegram при visits_left=0
- Cron: автосписание через 2 часа после starts_at, если не cancelled

## Веб-страницы
- /schedule — расписание, создание тренировок
- /athletes — таблица атлетов, баланс, фильтр должников, кнопка [+ Начислить]

## Известные особенности
- Роль берётся из БД по telegram_id — ВСЕГДА через GET /users?telegram_id=X
- Один атлет может быть привязан к обоим ботам (один user в БД, telegram_id одинаковый)
- /mybookings показывает тренировки начиная с 00:00 текущего дня
- Admin telegram_id для уведомлений: 103842071
- Все таблицы сейчас UNRESTRICTED — RLS включаем в отдельной миграции после полировки

## Роли пользователей
- athlete — пользуется @vladimir_boxing_bot, смотрит расписание/баланс/историю
- trainer — пользуется @boxgymbot, отмечает посещения, управляет группой, индивидуальные
- admin — полный доступ, веб-панель

## Seed данные (002_seed.sql)
- Admin: Эд, telegram_id=103842071
- Trainer: Иван, telegram_id=222
- Athletes: Алексей(333), Мария(444), Дмитрий(555)

## Локальный запуск
backend: cd backend && npm run dev
bot: cd bot && npm run dev
bot-athletes: cd bot-athletes && npm run dev (после M8)
web: cd web && npm run dev

## Приоритеты разработки
П1 — Расписание и запись (готово)
П2 — Баланс и платежи (готово)
П3 — Реферальный онбординг + фото оплаты (готово)
П4 — Деплой (готово)
П5 — Рефакторинг логики в backend (M7, в работе)
П6 — Security pass (M7.5)
П7 — Рабочий бот для атлетов + вырезка атлетных команд из @boxgymbot (M8)
П8 — Индивидуальные тренировки в @boxgymbot (M9)
П9 — Месячные абонементы (M10)
П10 — WhatsApp (M11, только если нужен)
Вне скоупа MVP: инвентарь, эквайринг, CRM, LTV
