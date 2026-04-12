import supabase from './lib/supabase.js';

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

export async function autoCheckin() {
  const now = new Date();
  console.log(`[autoCheckin] started at ${now.toISOString()}`);

  // Fetch all non-cancelled classes where start_at + 2h <= now
  const { data: classes, error: classesErr } = await supabase
    .from('classes')
    .select('id, start_at, is_cancelled');

  if (classesErr) {
    console.error('[autoCheckin] failed to fetch classes:', classesErr.message);
    return;
  }

  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const eligibleClasses = (classes ?? []).filter((cls) => {
    if (cls.is_cancelled) return false;
    return new Date(cls.start_at) <= twoHoursAgo;
  });

  console.log(`[autoCheckin] eligible classes: ${eligibleClasses.length}`);

  for (const cls of eligibleClasses) {
    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('id, user_id, user:users(id, telegram_id)')
      .eq('class_id', cls.id)
      .eq('status', 'booked');

    if (bookingsErr) {
      console.error(`[autoCheckin] class ${cls.id}: failed to fetch bookings:`, bookingsErr.message);
      continue;
    }

    if (!bookings || bookings.length === 0) continue;

    console.log(`[autoCheckin] class ${cls.id}: processing ${bookings.length} booked bookings`);

    const today = now.toISOString().split('T')[0];

    for (const booking of bookings) {
      const userId = booking.user?.id;
      const telegramId = booking.user?.telegram_id;
      if (!userId) continue;

      // 1. Deduct visit from membership
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

        // 2. Create debit transaction
        await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            membership_id: membership.id,
            visits_delta: -1,
            type: 'debit',
            note: 'Автосписание после тренировки',
          });

        // 4. Notify athlete if visits ran out
        if (newVisitsLeft <= 0 && telegramId) {
          await sendTelegram(telegramId, 'Твои визиты закончились, обратись к администратору.');
        }
      }

      // 3. Mark booking as attended
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ status: 'attended', checked_in_at: now.toISOString() })
        .eq('id', booking.id);

      if (updateErr) {
        console.error(`[autoCheckin] failed to mark booking ${booking.id} as attended:`, updateErr.message);
      }
    }

    console.log(`[autoCheckin] class ${cls.id}: done`);
  }
}
