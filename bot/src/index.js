import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const DAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatClass(c) {
  const d = new Date(c.start_at);
  const day = DAY_RU[d.getDay()];
  const date = `${d.getDate()} ${MONTH_RU[d.getMonth()]}`;
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const trainer = c.trainer?.name ?? '—';
  const type = c.type.charAt(0).toUpperCase() + c.type.slice(1);
  const booked = c.is_cancelled ? '❌ Отменена' : `[${c.booked}/${c.capacity}]`;
  return `${day} ${date} — ${time} ${type} (${trainer}) ${booked}`;
}

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

bot.command('schedule', async (ctx) => {
  try {
    const res = await fetch(`${BACKEND_URL}/classes?week=current`);
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    const classes = await res.json();

    if (!classes.length) {
      return ctx.reply('На этой неделе тренировок нет.');
    }

    const lines = classes
      .filter((c) => !c.is_cancelled)
      .map(formatClass);

    const text = `📅 *Расписание на неделю:*\n\n${lines.join('\n')}`;
    return ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(err);
    return ctx.reply('Не удалось загрузить расписание. Попробуй позже.');
  }
});

bot.launch();
console.log('BoxGym bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
