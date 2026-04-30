# M7 Audit — карта рефакторинга @boxgymbot

> Дата: 2026-04-30  
> Цель: вынести бизнес-логику из бота в backend, подготовить почву для @vladimir_boxing_bot (M8)

---

## 1. Команды @boxgymbot

### /start — `bot/src/index.js:62`
**Что делает:** две ветки — регистрация по invite-ссылке (invite flow) и обычный вход.  
**Логика:** разделена: создание пользователя и работа с токеном — в backend; уведомление тренера через `ctx.telegram.sendMessage` — в боте.  
**Endpoints:** `GET /users?telegram_id`, `GET /invite-tokens/:token`, `POST /users`, `PATCH /invite-tokens/:token/use`  
**Прямой Supabase из бота:** нет  
**Роль:** любая (до регистрации)

---

### /invite — `bot/src/index.js:123`
**Что делает:** тренер создаёт одноразовую invite-ссылку, бот формирует `t.me/BOT?start=invite_TOKEN`.  
**Логика:** генерация токена — в backend; сборка URL — в боте (нужен `BOT_USERNAME`).  
**Endpoints:** `GET /users?telegram_id`, `POST /invite-tokens`  
**Прямой Supabase:** нет  
**Роль:** trainer (проверяется в боте)

---

### /schedule — `bot/src/index.js:140` (`handleSchedule`)
**Что делает:** расписание на текущую неделю с inline-кнопками [Записаться].  
**Логика:** фильтрация отменённых (`!c.is_cancelled`) выполняется **в боте** после получения данных — избыточный трафик.  
**Endpoints:** `GET /classes?week=current`, `GET /classes/:id` (после нажатия [Записаться])  
**Прямой Supabase:** нет  
**Роль:** любая (нет проверки роли)

---

### callback `book_` — `bot/src/index.js:174`
**Что делает:** записывает пользователя на тренировку.  
**Логика:** вся валидация (мест нет / уже записан) — в backend (`POST /bookings`).  
**Endpoints:** `GET /users?telegram_id`, `POST /bookings`, `GET /classes/:id`  
**Прямой Supabase:** нет  
**Роль:** нет проверки — тренер тоже может записаться; нет проверки активного абонемента

---

### /mybookings — `bot/src/index.js:195` (`handleMyBookings`)
**Что делает:** список предстоящих записей с кнопкой [Отменить].  
**Логика:** вся фильтрация (`upcoming=true`, 7 дней вперёд) — в backend.  
**Endpoints:** `GET /users?telegram_id`, `GET /bookings?user_id=X&upcoming=true`  
**Прямой Supabase:** нет  
**Роль:** любая (нет проверки)

---

### callback `cancel_` — `bot/src/index.js:225`
**Что делает:** отменяет запись (мягкое удаление → статус `cancelled`).  
**Логика:** в backend.  
**Endpoints:** `DELETE /bookings/:id`  
**Прямой Supabase:** нет  
**Роль:** нет проверки — **любой зная booking_id может отменить чужую запись** ⚠️

---

### /attendees — `bot/src/index.js:233`
**Что делает:** тренер видит список атлетов на ближайшей своей тренировке, отмечает посещения.  
**Логика:** поиск «следующей тренировки» (`find(c => new Date(c.start_at) >= now)`) — **в боте**; фильтрация `bookings.filter(b => b.status !== 'cancelled')` — тоже в боте.  
**Endpoints:** `GET /users?telegram_id`, `GET /classes?week=current`, `GET /bookings?class_id=X`, `PATCH /bookings/:id/checkin`, `PATCH /bookings/:id/noshow`  
**Прямой Supabase:** нет  
**Роль:** trainer (проверяется в боте)

---

### callback `checkin_` / `noshow_` — `bot/src/index.js:278,284`
**Что делает:** отмечает атлета как пришедшего или не пришедшего.  
**Логика:** в backend (`/checkin` — автосписание визита + уведомление; `/noshow` — только статус).  
**Endpoints:** `PATCH /bookings/:id/checkin`, `PATCH /bookings/:id/noshow`  
**Прямой Supabase:** нет  
**Роль:** нет проверки — только implicit (callback доступен из сообщения тренеру) ⚠️

---

### /mygroup — `bot/src/index.js:292`
**Что делает:** тренер видит свои тренировки за неделю, разбитые на секции Сегодня / Завтра / Остаток недели.  
**Логика:** разбивка на секции — **в боте** (lines 305-316); данные получает одним запросом.  
**Endpoints:** `GET /users?telegram_id`, `GET /classes/trainer/:id?period=week`  
**Прямой Supabase:** нет  
**Роль:** trainer (проверяется в боте)

---

### /subscribe — `bot/src/index.js:369`
**Что делает:** атлет выбирает дни недели + вводит время → массовая запись на 4 недели вперёд.  
**Логика:** **вся бизнес-логика в боте**:
- состояние диалога в `subscribeState` Map (in-memory, теряется при перезапуске)
- загрузка классов за 4 недели: `GET /classes?from=X&to=Y`
- фильтрация по дням и времени — JS в боте (lines 437-448)
- последовательный цикл `POST /bookings` для каждой подходящей тренировки  
**Endpoints:** `GET /users?telegram_id`, `GET /classes?from=X&to=Y`, `POST /bookings` ×N  
**Прямой Supabase:** нет  
**Роль:** athlete (проверяется в боте)

---

### /balance — `bot/src/index.js:482` (`handleBalance`)
**Что делает:** показывает активный абонемент.  
**Логика:** вся в backend.  
**Endpoints:** `GET /users?telegram_id`, `GET /memberships/:userId`  
**Прямой Supabase:** нет  
**Роль:** любая

---

### /history — `bot/src/index.js:519` (`handleHistory`)
**Что делает:** последние 10 транзакций.  
**Логика:** backend возвращает 20, бот берёт `slice(0, 10)` — избыточный трафик.  
**Endpoints:** `GET /users?telegram_id`, `GET /transactions/:userId`  
**Прямой Supabase:** нет  
**Роль:** любая

---

### /freeze — `bot/src/index.js:554`
**Что делает:** создаёт заявку на заморозку, уведомляет администратора.  
**Логика:** создание freeze-request — в backend; уведомление admin через `sendMessage` — в боте.  
**Endpoints:** `GET /users?telegram_id`, `GET /memberships/:userId`, `POST /freeze-requests`  
**Прямой Supabase:** нет  
**Роль:** любая

---

### Фото оплаты — `bot/src/index.js:592`
**Что делает:** сохраняет фото, ищет тренера атлета, уведомляет с inline-кнопками.  
**Логика:** поиск тренера — `GET /invite-tokens?used_by=X`; отправка фото — Telegram API (`sendPhoto`); fallback на `ADMIN_TELEGRAM_ID` — в боте.  
**Endpoints:** `GET /users?telegram_id`, `POST /payment-proofs`, `GET /invite-tokens?used_by=X`  
**Прямой Supabase:** нет  
**Роль:** любая

---

### callback `pconfirm_` / `preject_` — `bot/src/index.js:636,659`
**Что делает:** тренер подтверждает / отклоняет оплату, бот уведомляет атлета.  
**Логика:** изменение статуса — в backend; уведомление атлета через `sendMessage` — в боте.  
**Endpoints:** `PATCH /payment-proofs/:id/confirm`, `PATCH /payment-proofs/:id/reject`  
**Прямой Supabase:** нет  
**Роль:** нет явной проверки (implicit) ⚠️

---

### /mystats — `bot/src/index.js:684`
**Что делает:** статистика атлета (визиты, серия) или тренера (тренировок, заполняемость).  
**Логика:** полностью в backend.  
**Endpoints:** `GET /users?telegram_id`, `GET /stats/athlete/:id` или `GET /stats/trainer/:id`  
**Прямой Supabase:** нет  
**Роль:** athlete или trainer

---

## 2. Backend endpoints (существующие)

| Метод | Путь | Что делает | Используют | Проверка роли |
|-------|------|-----------|-----------|---------------|
| GET | `/users` | Поиск по telegram_id или все юзеры | все команды бота | нет |
| POST | `/users` | Создание пользователя при онбординге | /start | нет |
| GET | `/classes` | Расписание (week/from-to) | /schedule, /subscribe | нет |
| GET | `/classes/:id` | Одна тренировка | book_ action | нет |
| GET | `/classes/trainer/:id` | Тренировки тренера за период | /mygroup | нет |
| POST | `/classes` | Создать тренировку | веб-панель | нет |
| PUT | `/classes/:id` | Обновить тренировку | веб-панель | нет |
| DELETE | `/classes/:id` | Мягкое удаление (is_cancelled=true) | веб-панель | нет |
| GET | `/bookings` | Список записей с фильтрами | /mybookings, /attendees | нет |
| POST | `/bookings` | Записаться (проверка мест + дублей) | book_, /subscribe | нет — нет проверки абонемента |
| DELETE | `/bookings/:id` | Отмена записи (статус cancelled) | cancel_ | нет ownership check |
| PATCH | `/bookings/:id/checkin` | Attended + автосписание визита | checkin_ | нет |
| PATCH | `/bookings/:id/noshow` | Статус no_show | noshow_ | нет |
| GET | `/memberships/:userId` | Активный абонемент | /balance, /freeze | нет |
| POST | `/memberships` | Создать абонемент (admin) | веб-панель | нет |
| PATCH | `/memberships/:id/freeze` | Заморозить | веб-панель | нет |
| PATCH | `/memberships/:id/unfreeze` | Разморозить | веб-панель | нет |
| POST | `/freeze-requests` | Заявка на заморозку | /freeze | нет |
| GET | `/freeze-requests` | Список заявок (admin) | веб-панель | нет |
| GET | `/transactions/:userId` | История (последние 20) | /history | нет |
| POST | `/transactions` | Ручное начисление | веб-панель | нет |
| GET | `/transactions/export/:userId` | CSV экспорт | веб-панель | нет |
| POST | `/invite-tokens` | Создать токен | /invite | нет |
| GET | `/invite-tokens/:token` | Проверить токен | /start | нет |
| PATCH | `/invite-tokens/:token/use` | Отметить использованным | /start | нет |
| GET | `/invite-tokens` | Найти тренера по used_by | photo handler | нет |
| POST | `/payment-proofs` | Сохранить фото оплаты | photo handler | нет |
| GET | `/payment-proofs` | Список (pending) | веб-панель | нет |
| PATCH | `/payment-proofs/:id/confirm` | Подтвердить оплату | pconfirm_ | нет |
| PATCH | `/payment-proofs/:id/reject` | Отклонить оплату | preject_ | нет |
| GET | `/stats/summary` | Дашборд-метрики | веб-панель | нет |
| GET | `/stats/attendance` | График посещений | веб-панель | нет |
| GET | `/stats/classes/top` | Топ-5 тренировок | веб-панель | нет |
| GET | `/stats/athletes/lost` | Пропавшие атлеты | веб-панель | нет |
| GET | `/stats/athlete/:id` | Статистика атлета | /mystats | нет |
| GET | `/stats/trainer/:id` | Статистика тренера | /mystats | нет |
| GET | `/stats/recent-classes` | Последние 10 тренировок (legacy) | веб-панель | нет |
| GET | `/stats/debtors` | Должники (legacy) | веб-панель | нет |
| GET | `/health` | Healthcheck | Railway | — |

---

## 3. Что вынести в backend

### 3.1 Логика массовой записи (`/subscribe`) — **приоритет высокий**
**Сейчас:** бот получает все классы за 4 недели → фильтрует по дням+времени в JS → делает N отдельных `POST /bookings`.  
**Проблема:** N запросов, in-memory state теряется при рестарте, дублирование логики при выносе в @vladimir_boxing_bot.  
**Решение:** новый endpoint `POST /bookings/subscribe` принимает `{ user_id, days[], time }`, возвращает `{ booked, skipped[] }`.

### 3.2 Поиск ближайшей тренировки тренера (`/attendees`) — **приоритет средний**
**Сейчас:** бот получает весь список тренировок за неделю, сам ищет ближайшую.  
**Решение:** добавить `GET /classes/trainer/:id/next` или расширить существующий endpoint параметром `period=next`.

### 3.3 Поиск тренера атлета (`GET /invite-tokens?used_by=X`) — **приоритет низкий**
**Сейчас:** бот делает отдельный запрос для поиска `trainer.telegram_id` перед отправкой уведомления.  
**Решение:** `GET /users/:userId/trainer` → возвращает тренера, который пригласил атлета (инкапсулирует invite_tokens lookup).

### 3.4 Фильтрация отменённых классов в `/schedule` — **приоритет низкий**
**Сейчас:** бот получает все классы и фильтрует `!is_cancelled` клиентски.  
**Решение:** backend уже умеет `is_cancelled: false`, нужно просто добавить query-параметр или применять фильтр по умолчанию в `GET /classes?week=current`.

### 3.5 Лимит в `/history` — **приоритет низкий**
**Сейчас:** backend возвращает 20, бот делает `slice(0, 10)`.  
**Решение:** `GET /transactions/:userId?limit=10` или хардкод лимита 10 в backend.

---

## 4. Новые endpoints для M7

| Метод | Путь | Зачем | Боты |
|-------|------|-------|------|
| `POST` | `/bookings/subscribe` | Массовая запись по дням+время за N недель вперёд. Принимает `{ user_id, days[], time, weeks? }`. Возвращает `{ booked, skipped[] }`. Заменяет N запросов и in-memory state из /subscribe | @boxgymbot, @vladimir_boxing_bot |
| `GET` | `/classes/trainer/:id/next` | Следующая (ближайшая предстоящая) тренировка тренера. Нужен для /attendees. Сейчас логика в боте | @boxgymbot |
| `GET` | `/users/:userId/trainer` | Тренер, пригласивший атлета. Инкапсулирует `invite_tokens` lookup. Нужен при отправке фото и уведомлениях | @boxgymbot, @vladimir_boxing_bot |
| `GET` | `/classes?week=current&active=true` | Расширить существующий endpoint параметром `active=true` → добавляет `.eq('is_cancelled', false)` на стороне backend | @boxgymbot, @vladimir_boxing_bot |

---

## 5. Cron и фоновое

### Автосписание визитов — `backend/src/autoCheckin.js`
- **Что:** каждые 5 мин (расписание в `backend/src/index.js`) выбирает все `bookings` со статусом `booked` для тренировок, начавшихся > 2 часа назад → отмечает как `attended` → списывает визит → уведомляет если `visits_left <= 0`
- **Прямой Supabase:** да — читает `classes`, `bookings`, `memberships`; пишет в `memberships` и `transactions`
- **Telegram:** прямой HTTP к `api.telegram.org` через `sendTelegram()` (BOT_TOKEN из env)
- **Защита от двойного списания:** `status='booked'` в фильтре — уже `attended` не трогает
- **Защита от `is_cancelled`:** проверяется в JS (`!cls.is_cancelled`), а не SQL — `.eq('is_cancelled', false)` пропускает NULL в PostgreSQL (задокументировано в CLAUDE.md)

### Других cron-задач нет.

---

## 6. Telegram-specific код (нельзя вынести в backend)

| Код | Файл:строка | Почему нельзя в backend |
|-----|-------------|------------------------|
| `ctx.telegram.sendMessage(trainerTelegramId, ...)` | :98 | Инициирует исходящее сообщение тренеру — требует Telegraf context |
| `Markup.inlineKeyboard(...)` | :154, :211, :265, :621 | Inline-кнопки — Telegram-специфичная структура |
| `ctx.editMessageReplyMarkup(...)` | :392 | Обновление клавиатуры inline-сообщения |
| `ctx.editMessageCaption(...)` | :655, :677 | Обновление подписи к фото |
| `ctx.message.photo[...].file_id` | :596 | Получение file_id из Telegram-апдейта |
| `ctx.telegram.sendPhoto(notifyId, fileId, ...)` | :620 | Пересылка фото тренеру с кнопками |
| `ReplyKeyboardMarkup mainMenu` | :55 | Нижняя клавиатура бота |
| `subscribeState` Map (multi-step dialog) | :349 | Хранение состояния диалога между апдейтами |
| `sendTelegram()` в autoCheckin / bookings | backend | Прямой HTTP к TG API — технически в backend, но завязан на BOT_TOKEN |

> **Вывод:** весь `ctx.*` код и inline/reply-клавиатуры остаются в боте. Backend может посылать Telegram-уведомления напрямую через HTTP (как сейчас в autoCheckin), но это — техдолг (жёсткая связь backend ↔ Telegram).

---

## 7. Риски и неочевидное

### 🔴 Критично

**R1. Нет проверки абонемента перед записью.**  
`POST /bookings` в backend не проверяет, есть ли у атлета активный абонемент. Атлет без абонемента может записаться. CLAUDE.md говорит «без абонемента запись заблокирована» — но код этого не делает.

**R2. Нет ownership check при отмене записи.**  
`DELETE /bookings/:id` (cancel_ action в боте) не проверяет, принадлежит ли booking вызывающему пользователю. Любой, знающий UUID, может отменить чужую запись.

**R3. `subscribeState` в памяти теряется при рестарте бота.**  
Если бот упал в момент шага `time`, пользователь застрянет в невалидном состоянии (шаг не сбросится). Нужно добавить таймаут/сброс или перенести состояние в Redis/Supabase.

**R4. Тип транзакции: `'charge'` vs `'debit'` — расхождение.**  
`bookings.js:148` создаёт транзакцию с `type: 'charge'` (ручной checkin тренером).  
`autoCheckin.js:89` создаёт `type: 'debit'` (автоматический checkin).  
Если в `transactions.type` есть CHECK constraint — одно из двух упадёт. Нужно унифицировать.

### 🟡 Важно

**R5. Нет аутентификации/авторизации на backend endpoints.**  
Все маршруты открыты без API-ключа. Любой с URL backend'а может читать и писать данные. В Railway production URL публичный.

**R6. Дублирование `sendTelegram` функции.**  
Одинаковая функция определена в `backend/src/routes/bookings.js:4` и `backend/src/autoCheckin.js:5`. Нужен общий хелпер.

**R7. Роль тренера и доступ к действиям проверяется только в боте.**  
`checkin_`, `noshow_`, `pconfirm_`, `preject_` — нет проверки роли ни на уровне callback, ни в backend endpoints. Если атлет знает ID, он может вызвать checkin вручную.

**R8. `GET /transactions/:userId` конфликт роутов.**  
В Fastify регистрация `GET /transactions/export/:userId` и `GET /transactions/:userId` может конфликтовать — `export` распознаётся как `:userId`. Нужно проверить порядок регистрации и, при необходимости, переименовать в `/transactions/:userId/export`.

**R9. Кнопка [Записаться] доступна тренеру.**  
В `/schedule` нет проверки роли — тренер может нажать [Записаться] и будет записан как атлет.

### 🟢 Техдолг (некритично)

**T1.** `/mybookings` окно — 7 дней хардкодом в backend (`bookings.js:39`). Для @vladimir_boxing_bot может понадобиться другой период.

**T2.** `/history` возвращает 20, бот берёт 10. Добавить `?limit=N` в endpoint.

**T3.** Фильтрация `!is_cancelled` в `/schedule` делается клиентски в боте вместо серверного фильтра.

**T4.** `/mygroup` делает 1 запрос на неделю и разбивает в боте на секции today/tomorrow/week. Логика несложная, можно оставить в боте — это скорее presentation, не бизнес-логика.

**T5.** `ADMIN_TELEGRAM_ID = 103842071` захардкожен в боте (line 552). В seed данных в CLAUDE.md указан тот же id для Admin. Использовать env var.
