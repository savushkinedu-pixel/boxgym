import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function fmtDate(iso) {
  const d = new Date(iso);
  return `${DAY_RU[d.getDay()]} ${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function fmtClass(c) {
  const trainer = c.trainer?.name ?? '—';
  const type = c.type.charAt(0).toUpperCase() + c.type.slice(1);
  const slots = c.is_cancelled ? '❌ Отменена' : `[${c.booked}/${c.capacity}]`;
  return `${fmtDate(c.start_at)} — ${fmtTime(c.start_at)} ${type} (${trainer}) ${slots}`;
}

async function getUserByTelegramId(telegramId) {
  try {
    const res = await fetch(`${BACKEND_URL}/users?telegram_id=${telegramId}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BACKEND_URL}${path}`, opts);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start((ctx) =>
  ctx.reply(
    'Привет! Я бот боксёрского зала BoxGym. Выбери роль:',
    Markup.inlineKeyboard([
      Markup.button.callback('🥊 Атлет', 'role_athlete'),
      Markup.button.callback('🏋️ Тренер', 'role_trainer'),
    ])
  )
);

bot.action('role_athlete', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Ты выбрал роль Атлета. Добро пожаловать!');
});

bot.action('role_trainer', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Ты выбрал роль Тренера. Добро пожаловать!');
});

// ─── /schedule ────────────────────────────────────────────────────────────────

bot.command('schedule', async (ctx) => {
  try {
    const res = await fetch(`${BACKEND_URL}/classes?week=current`);
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const classes = await res.json();

    const active = classes.filter((c) => !c.is_cancelled);
    if (!active.length) return ctx.reply('На этой неделе тренировок нет.');

    await ctx.reply('📅 *Расписание на неделю:*', { parse_mode: 'Markdown' });

    for (const c of active) {
      const full = c.booked >= c.capacity;
      await ctx.reply(fmtClass(c), {
        reply_markup: Markup.inlineKeyboard([
          full
            ? Markup.button.callback('❌ Мест нет', `noop_${c.id}`)
            : Markup.button.callback('Записаться', `book_${c.id}`),
        ]).reply_markup,
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply('Не удалось загрузить расписание. Попробуй позже.');
  }
});

bot.action(/^noop_/, (ctx) => ctx.answerCbQuery('Мест нет'));

// ─── [Записаться] ─────────────────────────────────────────────────────────────

bot.action(/^book_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const class_id = ctx.match[1];

  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

  const { ok, data } = await api('POST', '/bookings', { class_id, user_id: user.id });

  if (ok) {
    const clsRes = await fetch(`${BACKEND_URL}/classes/${class_id}`);
    const cls = await clsRes.json();
    return ctx.reply(`✅ Ты записан на ${cls.type}, ${fmtDate(cls.start_at)} ${fmtTime(cls.start_at)}`);
  }
  if (data.error === 'Мест нет') return ctx.reply('❌ Мест нет, попробуй другую тренировку');
  if (data.error === 'Уже записан') return ctx.reply('⚠️ Ты уже записан на эту тренировку');
  return ctx.reply(`Ошибка: ${data.error}`);
});

// ─── /mybookings ──────────────────────────────────────────────────────────────

bot.command('mybookings', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

    const res = await fetch(`${BACKEND_URL}/bookings?user_id=${user.id}&upcoming=true`);
    const bookings = await res.json();

    if (!bookings.length) return ctx.reply('У тебя нет предстоящих записей.');

    await ctx.reply('📋 *Мои записи:*', { parse_mode: 'Markdown' });

    for (const b of bookings) {
      const cls = b.class;
      const type = cls.type.charAt(0).toUpperCase() + cls.type.slice(1);
      await ctx.reply(`${fmtDate(cls.start_at)} — ${fmtTime(cls.start_at)} ${type}`, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Отменить', `cancel_${b.id}`),
        ]).reply_markup,
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply('Не удалось загрузить записи. Попробуй позже.');
  }
});

// ─── [Отменить] ───────────────────────────────────────────────────────────────

bot.action(/^cancel_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { ok } = await api('DELETE', `/bookings/${ctx.match[1]}`);
  ctx.reply(ok ? 'Запись отменена.' : 'Не удалось отменить запись.');
});

// ─── /attendees (только для тренера) ─────────────────────────────────────────

bot.command('attendees', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');
    if (user.role !== 'trainer') return ctx.reply('Эта команда только для тренеров.');

    const res = await fetch(`${BACKEND_URL}/classes?week=current`);
    const classes = await res.json();

    const mine = classes
      .filter((c) => c.trainer_id === user.id && !c.is_cancelled)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

    if (!mine.length) return ctx.reply('У тебя нет тренировок на этой неделе.');

    const now = new Date();
    const nextClass = mine.find((c) => new Date(c.start_at) >= now) ?? mine[0];

    const bRes = await fetch(`${BACKEND_URL}/bookings?class_id=${nextClass.id}`);
    const bookings = await bRes.json();
    const active = bookings.filter((b) => b.status !== 'cancelled');

    await ctx.reply(
      `📋 *${fmtDate(nextClass.start_at)} ${fmtTime(nextClass.start_at)} — список атлетов:*`,
      { parse_mode: 'Markdown' }
    );

    if (!active.length) return ctx.reply('Нет записанных атлетов.');

    for (const b of active) {
      const name = b.user?.name ?? 'Неизвестный';
      const icon = b.status === 'attended' ? '✅' : b.status === 'no_show' ? '❌' : '⏳';
      await ctx.reply(`${icon} ${name}`, {
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('✅ Пришёл', `checkin_${b.id}`),
          Markup.button.callback('❌ Не пришёл', `noshow_${b.id}`),
        ]).reply_markup,
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply('Не удалось загрузить список. Попробуй позже.');
  }
});

// ─── [✅ Пришёл] / [❌ Не пришёл] ────────────────────────────────────────────

bot.action(/^checkin_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('✅ Отмечено!');
  const { ok } = await api('PATCH', `/bookings/${ctx.match[1]}/checkin`);
  if (!ok) ctx.reply('Ошибка при отметке посещения.');
});

bot.action(/^noshow_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('❌ Отмечено');
  const { ok } = await api('PATCH', `/bookings/${ctx.match[1]}/noshow`);
  if (!ok) ctx.reply('Ошибка при отметке.');
});

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch();
console.log('BoxGym bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
