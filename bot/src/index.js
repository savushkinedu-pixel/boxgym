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

// ─── Меню ─────────────────────────────────────────────────────────────────────

const mainMenu = Markup.keyboard([
  ['📅 Расписание', '📋 Мои записи'],
  ['💳 Баланс',     '📊 История'],
]).resize();

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // text after /start, e.g. "invite_abc12345"

  // ── Invite flow ──
  if (payload && payload.startsWith('invite_')) {
    const token = payload.slice(7);

    // Already registered → just show menu
    const existingUser = await getUserByTelegramId(ctx.from.id);
    if (existingUser) {
      return ctx.reply(`С возвращением, ${existingUser.name}! Выбери действие:`, mainMenu);
    }

    // Validate token
    const tokenRes = await fetch(`${BACKEND_URL}/invite-tokens/${token}`);
    if (!tokenRes.ok) {
      return ctx.reply('❌ Ссылка недействительна или уже использована. Попроси тренера прислать новую.');
    }
    const tokenData = await tokenRes.json();

    // Create athlete
    const { ok, data: newUser } = await api('POST', '/users', {
      telegram_id: ctx.from.id,
      name: ctx.from.first_name,
      role: 'athlete',
    });
    if (!ok) return ctx.reply('Ошибка регистрации. Попробуй позже.');

    // Mark token used
    await api('PATCH', `/invite-tokens/${token}/use`, { used_by: newUser.id });

    // Notify trainer
    try {
      const trainerTelegramId = tokenData.trainer?.telegram_id;
      if (trainerTelegramId) {
        const handle = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        await ctx.telegram.sendMessage(
          trainerTelegramId,
          `✅ Новый атлет ${handle} присоединился!`
        );
      }
    } catch (e) {
      console.error('[start invite] Failed to notify trainer:', e.message);
    }

    return ctx.reply(
      '🥊 Добро пожаловать в BoxGym!\n\nДля записи на тренировки оформи абонемент — отправь фото оплаты.',
      mainMenu
    );
  }

  // ── Regular start (no invite) ──
  const user = await getUserByTelegramId(ctx.from.id);
  if (user) {
    return ctx.reply(`С возвращением, ${user.name}! Выбери действие:`, mainMenu);
  }
  return ctx.reply('Для входа нужна ссылка от тренера 🔗');
});

// ─── /invite (тренер) ─────────────────────────────────────────────────────────

bot.command('invite', async (ctx) => {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply('Сначала зарегистрируйся: /start');
  if (user.role !== 'trainer') return ctx.reply('Эта команда только для тренеров.');

  const { ok, data } = await api('POST', '/invite-tokens', { trainer_id: user.id });
  if (!ok) return ctx.reply('Не удалось создать ссылку. Попробуй позже.');

  const botUsername = process.env.BOT_USERNAME || ctx.botInfo?.username;
  if (!botUsername) return ctx.reply('BOT_USERNAME не задан. Обратись к администратору.');
  const link = `https://t.me/${botUsername}?start=invite_${data.token}`;

  return ctx.reply(`Отправь эту ссылку атлету 👇\n${link}\nСсылка одноразовая`);
});

// ─── /schedule ────────────────────────────────────────────────────────────────

async function handleSchedule(ctx) {
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
}

bot.command('schedule', handleSchedule);
bot.hears('📅 Расписание', handleSchedule);

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

async function handleMyBookings(ctx) {
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
}

bot.command('mybookings', handleMyBookings);
bot.hears('📋 Мои записи', handleMyBookings);

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

async function handleBalance(ctx) {
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
}

bot.command('balance', handleBalance);
bot.hears('💳 Баланс', handleBalance);

// ─── /history (атлет) ─────────────────────────────────────────────────────────

async function handleHistory(ctx) {
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
}

bot.command('history', handleHistory);
bot.hears('📊 История', handleHistory);

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

// ─── Фото оплаты (атлет) ──────────────────────────────────────────────────────

bot.on(message('photo'), async (ctx) => {
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply('Для входа нужна ссылка от тренера 🔗');

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  const { ok, data: proof } = await api('POST', '/payment-proofs', {
    user_id: user.id,
    file_id: fileId,
  });
  if (!ok) return ctx.reply('Не удалось сохранить фото. Попробуй позже.');

  await ctx.reply('📸 Фото получено! Отправлено тренеру на подтверждение.');

  // Find trainer who invited this athlete
  let notifyId = ADMIN_TELEGRAM_ID;
  try {
    const trainerRes = await fetch(`${BACKEND_URL}/invite-tokens?used_by=${user.id}`);
    if (trainerRes.ok) {
      const tokenData = await trainerRes.json();
      if (tokenData.trainer?.telegram_id) notifyId = tokenData.trainer.telegram_id;
    }
  } catch (e) {
    console.error('[photo] Failed to find trainer:', e.message);
  }

  const handle = ctx.from.username ? `@${ctx.from.username}` : user.name;
  try {
    await ctx.telegram.sendPhoto(notifyId, fileId, {
      caption: `💰 Атлет ${handle} прислал подтверждение оплаты`,
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Подтвердить', `pconfirm_${proof.id}`),
          Markup.button.callback('❌ Отклонить', `preject_${proof.id}`),
        ],
      ]).reply_markup,
    });
  } catch (e) {
    console.error('[photo] Failed to notify trainer/admin:', e.message);
  }
});

// ─── Подтверждение / отклонение оплаты ────────────────────────────────────────

bot.action(/^pconfirm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('✅ Подтверждено');

  const { ok, data } = await api('PATCH', `/payment-proofs/${ctx.match[1]}/confirm`, {});
  if (!ok) return ctx.reply('Ошибка при подтверждении.');

  const athleteTelegramId = data.user?.telegram_id;
  if (athleteTelegramId) {
    try {
      await ctx.telegram.sendMessage(
        athleteTelegramId,
        '✅ Оплата подтверждена! Обратись к администратору для начисления абонемента.'
      );
    } catch (e) {
      console.error('[pconfirm] Failed to notify athlete:', e.message);
    }
  }

  try {
    await ctx.editMessageCaption('✅ Оплата подтверждена', { reply_markup: { inline_keyboard: [] } });
  } catch (_) {}
});

bot.action(/^preject_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('❌ Отклонено');

  const { ok, data } = await api('PATCH', `/payment-proofs/${ctx.match[1]}/reject`, {});
  if (!ok) return ctx.reply('Ошибка при отклонении.');

  const athleteTelegramId = data.user?.telegram_id;
  if (athleteTelegramId) {
    try {
      await ctx.telegram.sendMessage(
        athleteTelegramId,
        '❌ Оплата не подтверждена. Пришли другое фото или обратись к тренеру.'
      );
    } catch (e) {
      console.error('[preject] Failed to notify athlete:', e.message);
    }
  }

  try {
    await ctx.editMessageCaption('❌ Оплата отклонена', { reply_markup: { inline_keyboard: [] } });
  } catch (_) {}
});

// ─── /mystats ─────────────────────────────────────────────────────────────────

bot.command('mystats', async (ctx) => {
  try {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Сначала зарегистрируйся: /start');

    if (user.role === 'athlete') {
      const res = await fetch(`${BACKEND_URL}/stats/athlete/${user.id}`);
      if (!res.ok) return ctx.reply('Не удалось загрузить статистику. Попробуй позже.');
      const s = await res.json();
      const streakLine = s.streak > 0
        ? `Серия: ${s.streak} дней подряд 🔥`
        : 'Серия: —';
      return ctx.reply(
        `📊 Твоя статистика:\nВизитов за месяц: ${s.visits_month}\nВсего визитов: ${s.visits_total}\n${streakLine}`
      );
    }

    if (user.role === 'trainer') {
      const res = await fetch(`${BACKEND_URL}/stats/trainer/${user.id}`);
      if (!res.ok) return ctx.reply('Не удалось загрузить статистику. Попробуй позже.');
      const s = await res.json();
      return ctx.reply(
        `📊 Статистика:\nПроведено тренировок за месяц: ${s.classes_month}\nСредняя заполняемость: ${s.avg_fill_rate}%`
      );
    }

    return ctx.reply('Статистика доступна для атлетов и тренеров.');
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
