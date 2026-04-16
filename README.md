# BoxGym

Система управления боксёрским залом — monorepo.

## Структура

```
boxgym/
├── backend/    — REST API (Node.js + Fastify + Supabase)
├── bot/        — Telegram-бот (Telegraf)
└── web/        — Админ-панель (Next.js 14 App Router)
```

## База данных

Миграция: `backend/migrations/001_init.sql`

Таблицы: `users`, `classes`, `bookings`, `memberships`, `transactions`

## Локальный запуск

### Backend + Bot (два терминала)

**Вкладка 1 — Backend:**
```bash
cd /Users/eduards/Documents/CCODE/boxgym/backend
npm run dev
```

**Вкладка 2 — Bot:**
```bash
cd /Users/eduards/Documents/CCODE/boxgym/bot
npm run dev
```

---

### Backend (порт 3001)

```bash
cd backend
cp .env.example .env   # заполни переменные
npm install
npm run dev
```

Проверка: `curl http://localhost:3001/health`

### Bot

```bash
cd bot
cp .env.example .env   # укажи BOT_TOKEN
npm install
npm run dev
```

### Web (порт 3000)

```bash
cd web
cp .env.example .env.local   # заполни переменные
npm install
npm run dev
```

Открой: http://localhost:3000

## Переменные окружения

| Сервис  | Переменная                        | Описание                    |
|---------|-----------------------------------|-----------------------------|
| backend | `DATABASE_URL`                    | PostgreSQL connection string |
| backend | `SUPABASE_URL`                    | Supabase project URL        |
| backend | `SUPABASE_SECRET_KEY`             | Supabase service role key   |
| backend | `BOT_TOKEN`                       | Telegram Bot Token          |
| backend | `JWT_SECRET`                      | Secret for JWT signing      |
| bot     | `BOT_TOKEN`                       | Telegram Bot Token          |
| web     | `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL        |
| web     | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key      |
