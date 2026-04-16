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
- Таблицы: users, classes, bookings, memberships, transactions, freeze_requests, invite_tokens, payment_proofs

## Структура
- /backend — REST API
- /bot — Telegram бот
- /web — Next.js админ-панель
- /backend/migrations — SQL миграции (001_init, 002_seed, 003_freeze_requests, 004_invite_tokens)

## Деплой (Railway)
- Backend: https://boxgym-production.up.railway.app (сервис boxgym)
- Bot: сервис valiant-grace, работает 24/7
- Web: пока локально, деплой следующий шаг

## Прогресс
- [x] M0 — Фундамент: monorepo, Supabase схема, Railway CI/CD, бот /start
- [x] M1 — Расписание: CRUD классов, /schedule в боте, страница /schedule в вебе
- [x] M2 — Запись и чекин: бронирование, отмена, /mybookings, /attendees, /mygroup для тренера, /subscribe массовая запись на месяц
- [x] M3 — Баланс: абонементы, автосписание визитов через cron каждые 5 мин, история транзакций, freeze-запросы, веб-страница атлетов
- [x] ReplyKeyboardMarkup меню: Расписание, Мои записи, Баланс, История
- [x] Деплой backend + bot на Railway
- [x] M4 — Статистика: дашборд, посещаемость, отчёты
- [x] M4 — Онбординг: реферальные ссылки (/invite), регистрация по токену, подтверждение оплаты фото
- [ ] Web деплой на boxgym.edsaw.cc

## Команды бота (актуальные)
Атлет:
- /start — без параметра: если зарегистрирован → меню, иначе "нужна ссылка от тренера"
- /start invite_TOKEN — регистрация через реферальную ссылку тренера
- /schedule — расписание на неделю с кнопкой [Записаться]
- /mybookings — мои записи с кнопкой [Отменить]
- /subscribe — массовая запись на повторяющиеся тренировки (выбор дней + время)
- /balance — текущий абонемент (тип, визиты, срок)
- /history — последние 10 транзакций
- /freeze — заявка на заморозку абонемента (уведомляет admin telegram_id=103842071)
- Фото боту — подтверждение оплаты: сохраняется в payment_proofs, тренер получает уведомление с кнопками [✅ Подтвердить] [❌ Отклонить]
- ReplyKeyboardMarkup: кнопки внизу чата — 📅 Расписание, 📋 Мои записи, 💳 Баланс, 📊 История

Тренер:
- /invite — создать одноразовую реферальную ссылку для нового атлета
- /mygroup — список записанных сегодня / завтра / на неделю
- /attendees — опциональная ручная отметка посещений [✅ Пришёл] [❌ Не пришёл]

## Логика чекина
- Тренер может отметить вручную через /attendees
- Если не отметил — cron каждые 5 минут (backend/src/autoCheckin.js) автоматически закрывает все bookings со статусом 'booked' как attended через 2 часа после start_at тренировки
- Автосписание: visits/single → visits_left -= 1, создаётся транзакция type='debit'; unlimited/personal → только проверка valid_to, транзакция не создаётся
- Статус 'cancelled' защищает от автосписания — такие bookings не трогаются
- При visits_left = 0 — Telegram-уведомление атлету

## Backend маршруты (актуальные)
- GET/POST /classes, PUT /classes/:id, DELETE /classes/:id
- GET /classes?week=current, GET /classes?from=X&to=Y
- GET /classes/trainer/:id?period=today|tomorrow|week
- GET/POST /bookings, DELETE /bookings/:id
- PATCH /bookings/:id/checkin, PATCH /bookings/:id/noshow
- GET /memberships/:userId, POST /memberships
- PATCH /memberships/:id/freeze|unfreeze
- GET/POST /transactions, GET /transactions/export/:userId (CSV)
- POST /freeze-requests, GET /freeze-requests
- GET /users?telegram_id=X, POST /users
- POST /invite-tokens — создать токен (trainer_id → генерирует 8-символьный token)
- GET /invite-tokens/:token — проверить токен (валиден, не использован)
- PATCH /invite-tokens/:token/use — пометить использованным (used_by, used_at)
- GET /invite-tokens?used_by=:userId — найти тренера, пригласившего атлета
- POST /payment-proofs — сохранить file_id фото оплаты
- GET /payment-proofs?status=pending — список
- PATCH /payment-proofs/:id/confirm — подтвердить (возвращает user с telegram_id)
- PATCH /payment-proofs/:id/reject — отклонить (возвращает user с telegram_id)

## Веб-страницы
- /dashboard — метрики (неделя/месяц), последние 10 тренировок, должники
- /schedule — расписание, создание тренировок
- /athletes — таблица атлетов, баланс, фильтр должников, кнопка [+ Начислить]

## Известные особенности
- Роль берётся из БД по telegram_id (не из сессии) — ВСЕГДА через GET /users?telegram_id=X
- /balance, /history, /freeze — доступны любой роли (athlete/trainer/admin), проверка роли не нужна
- /mygroup, /attendees — только trainer (role из БД)
- /subscribe — только athlete (role из БД)
- /mybookings показывает тренировки начиная с 00:00 текущего дня
- Для теста тренера: UPDATE users SET telegram_id=X WHERE name='Иван'
- Миграцию 003_freeze_requests.sql нужно применить в Supabase вручную
- Миграцию 004_invite_tokens.sql нужно применить в Supabase вручную
- Admin telegram_id для уведомлений: 103842071
- BOT_USERNAME — env var для бота (имя бота без @, нужен для генерации invite-ссылок в /invite)
- invite_tokens.trainer_id — связь тренер↔атлет; used_by заполняется при регистрации
- payment_proofs: file_id хранит Telegram file_id фото; уведомление тренеру/админу с кнопками confirm/reject
- При подтверждении/отклонении оплаты бот ищет тренера через GET /invite-tokens?used_by=:userId; fallback — ADMIN_TELEGRAM_ID
- Cron автосписания (*/5 * * * *) — логика в backend/src/autoCheckin.js, регистрируется в backend/src/index.js. НЕ вызывать при старте сервера: node --watch перезапускает процесс при каждом сохранении и вызывает двойное списание. Защита: .eq('status', 'booked') в запросе не трогает уже attended-букинги. Фильтр is_cancelled проверяется в JS (!cls.is_cancelled) — .eq('is_cancelled', false) пропускает NULL в PostgreSQL.
- Автосписание визитов: через 2 часа после start_at все bookings со статусом 'booked' автоматически становятся 'attended', списывается 1 визит (visits_left -= 1), создаётся транзакция type='debit'. Тип 'debit' добавлен миграцией — CHECK constraint на transactions.type должен включать 'debit'.
- Отмена тренером/атлетом (статус 'cancelled') защищает от списания — cron пропускает такие bookings.
- bot/src/index.js: обработчики schedule/mybookings/balance/history вынесены в именованные функции, bot.command() и bot.hears() используют одну функцию
- Валюта: EUR (€) везде в проекте — не использовать руб/RUB
- Автосписание визитов: через 2ч после start_at, статус 'cancelled' защищает от списания (см. backend/src/autoCheckin.js)
- Интеграционный тест автосписания: cd backend && npm run test:checkin

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
тест автосписания: cd backend && npm run test:checkin

## Документация
- MANUAL.md — пользовательская инструкция (атлет, тренер, администратор). После каждой итерации/изменения логики обновлять MANUAL.md вместе с CLAUDE.md.

## Приоритеты разработки
П1 — Расписание и запись (готово)
П2 — Баланс и платежи (готово)
П3 — Статистика посещений
Вне скоупа MVP: инвентарь, эквайринг, CRM, LTV

## Архитектура интерфейсов

### Веб-панель (админ, ежемесячно)
- Расписание: редактирование слотов, массовые изменения, уведомления атлетам
- Атлеты: список, балансы, начисление абонементов, подтверждение заморозок
- Отчёт: выручка за месяц, посещаемость, экспорт CSV

### Telegram Bot (атлеты и тренер, ежедневно)
- Атлет: расписание, запись, баланс, история, заморозка, загрузка фото оплаты
- Тренер: группы, переносы, подтверждение оплат

## Онбординг атлетов
- Реферальная ссылка от тренера: t.me/БОТ?start=invite_ТОКЕН
- Бот берёт имя из Telegram профиля автоматически
- Без абонемента запись заблокирована

## Подтверждение оплаты (без эквайринга)
Цепочка: Атлет платит наличными/переводом → отправляет фото чека боту →
бот сохраняет в Supabase Storage → уведомляет тренера с фото →
тренер нажимает [Подтвердить] → запрос уходит админу →
админ начисляет абонемент в веб-панели → атлет получает уведомление

## Типы абонементов
- Разовый (single): одна тренировка, оплатил = записался
- Блочный (visits): пакет 8/12 тренировок, автосписание
- Безлимитный (unlimited): месяц/квартал, без ограничения визитов
- Перенос: в блочном абонементе можно перенести N тренировок, согласование с тренером

## План следующих этапов
- [x] M4: Онбординг (реферальные ссылки) + подтверждение оплаты
- M5: Web деплой на boxgym.edsaw.cc
- M6: Полировка и передача тренеру
