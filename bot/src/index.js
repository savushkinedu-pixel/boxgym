import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

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

bot.launch();
console.log('BoxGym bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
