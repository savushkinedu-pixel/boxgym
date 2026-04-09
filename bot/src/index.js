import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';

const bot = new Telegraf(process.env.BOT_TOKEN);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU  = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    if (!res.ok) {
      const body = await res.text();
      console.error(`[getUserByTelegramId] telegram_id=${telegramId} → ${res.status}: ${body}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`[getUserByTelegramId] fetch failed for telegram_id=${telegramId}:`, err.message);
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

bot.action('role_athlete', (ctx) => { ctx.answerCbQuery(); ctx.reply('Ты выбрал роль Атлета. Добро пожаловать!'); });
bot.action('role_trainer', (ctx) => { ctx.answerCbQuery(); ctx.reply('Ты выбрал роль Тренера. Добро пожаловать!'); });

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
  if (data.error === 'Мест нет')   return ctx.reply('❌ Мест нет, попробуй другую тренировку');
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

bot.action(/^cancel_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { ok } = await api('DELETE', `/bookings/${ctx.match[1]}`);
  ctx.reply(ok ? 'Запись отменена.' : 'Не удалось отменить запись.');
});

// ─── /attendees (тренер) ──────────────────────────────────────────────────────

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
          Markup.button.callback('✅ Пришёл',    `checkin_${b.id}`),
          Markup.button.callback('❌ Не пришёл', `noshow_${b.id}`),
        ]).reply_markup,
      });
    }
  } catch (err) {
    console.error(err);
    ctx.reply('Не удалось загрузить список. Попробуй позже.');
  }
});

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

// ─── /mygroup (тренер) ────────────────────────────────────────────────────────

bot.command('mygroup', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');
    if (user.role !== 'trainer') return ctx.reply('Эта команда только для тренеров.');

    // Получаем всю неделю одним запросом, делим на секции в боте
    const res = await fetch(`${BACKEND_URL}/classes/trainer/${user.id}?period=week`);
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const classes = await res.json();

    if (!classes.length) return ctx.reply('У тебя нет тренировок на этой неделе.');

    const todayStr    = new Date().toDateString();
    const tomorrowStr = new Date(Date.now() + 86400000).toDateString();

    const sections = {
      'Сегодня':    classes.filter((c) => new Date(c.start_at).toDateString() === todayStr),
      'Завтра':     classes.filter((c) => new Date(c.start_at).toDateString() === tomorrowStr),
      'Эта неделя': classes.filter(
        (c) =>
          new Date(c.start_at).toDateString() !== todayStr &&
          new Date(c.start_at).toDateString() !== tomorrowStr
      ),
    };

    let hasContent = false;

    for (const [label, list] of Object.entries(sections)) {
      if (!list.length) continue;
      hasContent = true;

      const lines = [`*📅 ${label}*`];
      for (const c of list) {
        const type = c.type.charAt(0).toUpperCase() + c.type.slice(1);
        lines.push(`\n🕐 *${fmtTime(c.start_at)}* — ${type} [${c.booked}/${c.capacity}]`);
        if (c.attendees.length) {
          c.attendees.forEach((a, i) => lines.push(`  ${i + 1}. ${a.name}`));
        } else {
          lines.push('  _Нет записанных_');
        }
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    }

    if (!hasContent) ctx.reply('На этой неделе тренировок нет.');
  } catch (err) {
    console.error(err);
    ctx.reply('Не удалось загрузить группы. Попробуй позже.');
  }
});

// ─── /subscribe (атлет) — массовая запись ─────────────────────────────────────

// State: Map<telegramId, { step: 'days'|'time', selectedDays: Set<number> }>
// Days: 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб, 7=Вс
const subscribeState = new Map();

const DAY_LABELS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; // index 1-7

function buildDayKeyboard(selectedDays) {
  const row1 = [1, 2, 3, 4].map((d) =>
    Markup.button.callback(selectedDays.has(d) ? `✅ ${DAY_LABELS[d]}` : DAY_LABELS[d], `subday_${d}`)
  );
  const row2 = [5, 6, 7].map((d) =>
    Markup.button.callback(selectedDays.has(d) ? `✅ ${DAY_LABELS[d]}` : DAY_LABELS[d], `subday_${d}`)
  );
  row2.push(Markup.button.callback('Готово →', 'sub_done'));
  return Markup.inlineKeyboard([row1, row2]);
}

// Convert my day (1=Mon…7=Sun) to JS getDay() (0=Sun, 1=Mon…6=Sat)
function myDayToJS(d) {
  return d === 7 ? 0 : d;
}

bot.command('subscribe', async (ctx) => {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply('Сначала зарегистрируйся: /start');
  if (user.role !== 'athlete') return ctx.reply('Команда /subscribe только для атлетов.');

  subscribeState.set(ctx.from.id, { step: 'days', selectedDays: new Set() });

  await ctx.reply('Выбери дни для регулярной записи:', buildDayKeyboard(new Set()));
});

// Toggle day selection
bot.action(/^subday_(\d)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const state = subscribeState.get(ctx.from.id);
  if (!state || state.step !== 'days') return;

  const day = parseInt(ctx.match[1]);
  if (state.selectedDays.has(day)) {
    state.selectedDays.delete(day);
  } else {
    state.selectedDays.add(day);
  }

  await ctx.editMessageReplyMarkup(buildDayKeyboard(state.selectedDays).reply_markup);
});

// Days confirmed — ask for time
bot.action('sub_done', async (ctx) => {
  await ctx.answerCbQuery();
  const state = subscribeState.get(ctx.from.id);
  if (!state || state.step !== 'days') return;

  if (state.selectedDays.size === 0) {
    return ctx.reply('Выбери хотя бы один день.');
  }

  state.step = 'time';
  const dayNames = [...state.selectedDays].sort().map((d) => DAY_LABELS[d]).join(', ');
  await ctx.reply(`Выбраны дни: *${dayNames}*\n\nВведи время тренировки (например: 09:30)`, {
    parse_mode: 'Markdown',
  });
});

// Intercept text input for subscribe time step
bot.on(message('text'), async (ctx, next) => {
  const state = subscribeState.get(ctx.from.id);
  if (!state || state.step !== 'time') return next();

  const timeInput = ctx.message.text.trim();
  if (!/^\d{1,2}:\d{2}$/.test(timeInput)) {
    return ctx.reply('Неверный формат. Введи время, например: 09:30');
  }

  subscribeState.delete(ctx.from.id);

  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply('Ошибка: пользователь не найден.');

  // Fetch all classes for next 4 weeks
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to   = new Date(from.getTime() + 28 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `${BACKEND_URL}/classes?from=${from.toISOString()}&to=${to.toISOString()}`
  );
  const allClasses = await res.json();

  // Filter by selected days + time
  const targetDaysJS = new Set([...state.selectedDays].map(myDayToJS));
  const [targetH, targetM] = timeInput.split(':').map(Number);

  const matching = allClasses.filter((c) => {
    const d = new Date(c.start_at);
    return (
      targetDaysJS.has(d.getDay()) &&
      d.getHours() === targetH &&
      d.getMinutes() === targetM &&
      !c.is_cancelled
    );
  });

  if (!matching.length) {
    const dayNames = [...state.selectedDays].sort().map((d) => DAY_LABELS[d]).join(', ');
    return ctx.reply(
      `❌ Не найдено тренировок в ${dayNames} в ${timeInput} на ближайшие 4 недели.`
    );
  }

  // Book all matching classes
  let booked = 0;
  const skipped = [];

  for (const c of matching) {
    const { ok, data } = await api('POST', '/bookings', { class_id: c.id, user_id: user.id });
    if (ok) {
      booked++;
    } else if (data.error !== 'Уже записан') {
      skipped.push(`${fmtDate(c.start_at)} ${fmtTime(c.start_at)}: ${data.error}`);
    }
  }

  const lastClass   = matching[matching.length - 1];
  const dayNames    = [...state.selectedDays].sort().map((d) => DAY_LABELS[d]).join(' и ');
  const untilDate   = fmtDate(lastClass.start_at);

  let msg = `✅ Записал тебя на *${booked}* тренировок: ${dayNames} ${timeInput} до ${untilDate}`;
  if (skipped.length) msg += `\n\n⚠️ Пропущено:\n${skipped.join('\n')}`;

  return ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ─── /balance (атлет) ─────────────────────────────────────────────────────────

bot.command('balance', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

    const res = await fetch(`${BACKEND_URL}/memberships/${user.id}`);

    if (res.status === 404) {
      return ctx.reply('❌ Абонемент не найден. Обратись к администратору.');
    }
    if (!res.ok) {
      return ctx.reply('Не удалось загрузить абонемент. Попробуй позже.');
    }

    const m = await res.json();
    const validTo = new Date(m.valid_to);
    const dateStr = `${validTo.getDate()} ${MONTH_RU[validTo.getMonth()]}`;

    if (m.type === 'unlimited' || m.type === 'personal') {
      const label = m.type === 'unlimited' ? 'Безлимит' : 'Персональный';
      return ctx.reply(`💳 Абонемент: ${label} до ${dateStr}`);
    }

    return ctx.reply(
      `💳 Абонемент: Осталось ${m.visits_left} визитов из ${m.visits_total}, до ${dateStr}`
    );
  } catch (err) {
    console.error(err);
    ctx.reply('Ошибка. Попробуй позже.');
  }
});

// ─── /history (атлет) ─────────────────────────────────────────────────────────

bot.command('history', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

    const res = await fetch(`${BACKEND_URL}/transactions/${user.id}`);
    if (!res.ok) return ctx.reply('Не удалось загрузить историю.');

    const txns = await res.json();
    const last10 = txns.slice(0, 10);

    if (!last10.length) return ctx.reply('История транзакций пуста.');

    const lines = last10.map((t) => {
      const d = new Date(t.created_at);
      const dateStr = `${String(d.getDate()).padStart(2, '0')} ${MONTH_RU[d.getMonth()]}`;
      const note = t.note ?? t.type;
      const delta = t.visits_delta !== 0 ? ` (${t.visits_delta > 0 ? '+' : ''}${t.visits_delta} визит)` : '';
      return `📅 ${dateStr} — ${note}${delta}`;
    });

    return ctx.reply(lines.join('\n'));
  } catch (err) {
    console.error(err);
    ctx.reply('Ошибка. Попробуй позже.');
  }
});

// ─── /freeze (атлет) ──────────────────────────────────────────────────────────

const ADMIN_TELEGRAM_ID = 103842071;

bot.command('freeze', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

    // Найти активный абонемент
    const mRes = await fetch(`${BACKEND_URL}/memberships/${user.id}`);
    if (mRes.status === 404) return ctx.reply('❌ Нет активного абонемента для заморозки.');
    if (!mRes.ok) return ctx.reply('Не удалось загрузить абонемент. Попробуй позже.');
    const membership = await mRes.json();

    // Создать запрос на заморозку
    const { ok } = await api('POST', '/freeze-requests', {
      user_id: user.id,
      membership_id: membership.id,
    });

    if (!ok) return ctx.reply('Не удалось отправить заявку. Попробуй позже.');

    await ctx.reply('❄️ Заявка на заморозку отправлена. Администратор свяжется с тобой.');

    // Уведомить администратора
    try {
      await ctx.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `❄️ Атлет ${user.name} просит заморозить абонемент. /admin для управления`
      );
    } catch (e) {
      console.error('[freeze] Failed to notify admin:', e.message);
    }
  } catch (err) {
    console.error(err);
    ctx.reply('Ошибка. Попробуй позже.');
  }
});

// ─── Launch ───────────────────────────────────────────────────────────────────

bot.launch();
console.log('BoxGym bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
