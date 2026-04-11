import 'dotenv/config';
import Fastify from 'fastify';
import cron from 'node-cron';
import healthRoute from './routes/health.js';
import classesRoute from './routes/classes.js';
import bookingsRoute from './routes/bookings.js';
import usersRoute from './routes/users.js';
import membershipsRoute from './routes/memberships.js';
import transactionsRoute from './routes/transactions.js';
import supabase from './lib/supabase.js';

const fastify = Fastify({ logger: true });

fastify.register(healthRoute);
fastify.register(classesRoute);
fastify.register(bookingsRoute);
fastify.register(usersRoute);
fastify.register(membershipsRoute);
fastify.register(transactionsRoute);

const BOT_TOKEN = process.env.BOT_TOKEN;

async function sendTelegram(telegramId, text) {
  if (!BOT_TOKEN || !telegramId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text }),
    });
  } catch (err) {
    console.error('[sendTelegram] error:', err.message);
  }
}

async function autoCheckin() {
  const now = new Date();
  console.log(`[autoCheckin] started at ${now.toISOString()}`);

  // Find classes that ended more than 2 hours ago (start_at + duration_min + 120 min < now)
  // No DB filter on is_cancelled — NULL != false in PostgreSQL, handle in JS
  const { data: classes, error: classesErr } = await supabase
    .from('classes')
    .select('id, start_at, duration_min, is_cancelled');

  if (classesErr) {
    console.error('[autoCheckin] failed to fetch classes:', classesErr.message);
    return;
  }

  console.log(`[autoCheckin] total classes in DB: ${classes?.length ?? 0}`);

  const eligibleClasses = (classes ?? []).filter((cls) => {
    if (cls.is_cancelled) return false;
    const endTime = new Date(cls.start_at);
    endTime.setMinutes(endTime.getMinutes() + (cls.duration_min ?? 0) + 120);
    const eligible = endTime < now;
    if (!eligible) {
      console.log(`[autoCheckin] skip ${cls.id}: endTime=${endTime.toISOString()} >= now`);
    }
    return eligible;
  });

  console.log(`[autoCheckin] eligible classes: ${eligibleClasses.length}`);

  for (const cls of eligibleClasses) {
    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('id, user_id, user:users(id, telegram_id)')
      .eq('class_id', cls.id)
      .eq('status', 'booked');

    if (bookingsErr) {
      console.error(`[autoCheckin] failed to fetch bookings for class ${cls.id}:`, bookingsErr.message);
      continue;
    }

    if (!bookings || bookings.length === 0) continue;

    // Mark all as attended
    const bookingIds = bookings.map((b) => b.id);
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ status: 'attended', checked_in_at: now.toISOString() })
      .in('id', bookingIds);

    if (updateErr) {
      console.error(`[autoCheckin] failed to update bookings for class ${cls.id}:`, updateErr.message);
      continue;
    }

    console.log(`Auto-checkin: class_id ${cls.id}, ${bookings.length} атлетов отмечено`);

    // Deduct visits for each athlete
    const today = now.toISOString().split('T')[0];
    for (const booking of bookings) {
      const userId = booking.user?.id;
      const telegramId = booking.user?.telegram_id;
      if (!userId) continue;

      const { data: membership } = await supabase
        .from('memberships')
        .select('*')
        .eq('user_id', userId)
        .gte('valid_to', today)
        .eq('is_frozen', false)
        .limit(1)
        .maybeSingle();

      if (membership && (membership.type === 'visits' || membership.type === 'single')) {
        const newVisitsLeft = (membership.visits_left ?? 0) - 1;

        await supabase
          .from('memberships')
          .update({ visits_left: newVisitsLeft })
          .eq('id', membership.id);

        await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            membership_id: membership.id,
            visits_delta: -1,
            type: 'charge',
            note: 'Автосписание после тренировки',
          });

        if (newVisitsLeft === 0 && telegramId) {
          await sendTelegram(telegramId, 'Твои визиты закончились, обратись к администратору.');
        }
      }
    }
  }
}

// Run auto-checkin every 15 minutes
cron.schedule('*/15 * * * *', () => {
  autoCheckin().catch((err) => console.error('[autoCheckin] unhandled error:', err.message));
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    // Run once on startup for immediate testing
    autoCheckin().catch((err) => console.error('[autoCheckin] startup run error:', err.message));
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
