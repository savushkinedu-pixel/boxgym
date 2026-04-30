import supabase from '../lib/supabase.js';
import { sendTelegram } from '../lib/telegram.js';
import { checkBookingEligibility, markTrialUsed } from '../lib/eligibility.js';

const DAY_ABBR = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

export default async function bookingsRoute(fastify) {
  // GET /bookings?class_id=X&user_id=Y&upcoming=true
  fastify.get('/bookings', async (request, reply) => {
    const { class_id, user_id, upcoming } = request.query;

    let query = supabase
      .from('bookings')
      .select(
        '*, user:users(id, name, telegram_id), class:classes(id, type, start_at, capacity, location, trainer:users!trainer_id(name))'
      )
      .order('created_at', { ascending: false });

    if (class_id) query = query.eq('class_id', class_id);
    if (user_id) query = query.eq('user_id', user_id);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    if (upcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      return data.filter((b) => {
        const start = new Date(b.class.start_at);
        return start >= today && start <= nextWeek && b.status !== 'cancelled';
      });
    }

    return data;
  });

  // POST /bookings — записаться на тренировку (с проверкой eligibility)
  fastify.post('/bookings', async (request, reply) => {
    const { class_id, user_id } = request.body;

    // Eligibility check
    const elig = await checkBookingEligibility(user_id);
    if (!elig.eligible) {
      const msg =
        elig.reason === 'no_membership'
          ? 'Для записи нужен активный абонемент. Обратитесь к тренеру.'
          : 'Пользователь не найден.';
      return reply.status(400).send({ error: msg });
    }

    // Класс существует и не отменён
    const { data: cls, error: clsErr } = await supabase
      .from('classes')
      .select('id, capacity, is_cancelled')
      .eq('id', class_id)
      .single();

    if (clsErr || !cls) return reply.status(404).send({ error: 'Тренировка не найдена' });
    if (cls.is_cancelled) return reply.status(400).send({ error: 'Тренировка отменена' });

    // Проверка мест
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', class_id)
      .neq('status', 'cancelled');

    if (count >= cls.capacity) return reply.status(409).send({ error: 'Мест нет' });

    // Проверка дублирования
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('class_id', class_id)
      .eq('user_id', user_id)
      .neq('status', 'cancelled')
      .maybeSingle();

    if (existing) return reply.status(409).send({ error: 'Уже записан' });

    // Создать бронирование
    const { data, error } = await supabase
      .from('bookings')
      .insert({ class_id, user_id, status: 'booked' })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });

    if (elig.useTrialAfterBook) {
      await markTrialUsed(user_id);
      await supabase.from('transactions').insert({
        user_id,
        membership_id: null,
        visits_delta: 0,
        type: 'debit',
        note: 'Пробный визит',
      });
    }

    return reply.status(201).send(data);
  });

  // POST /bookings/subscribe — массовая запись по дням недели + время
  fastify.post('/bookings/subscribe', async (request, reply) => {
    const { user_id, days, time, weeks = 4 } = request.body ?? {};

    // --- Validation ---
    if (!user_id) return reply.status(400).send({ error: 'user_id обязателен' });

    const validDays = Object.keys(DAY_ABBR);
    if (!Array.isArray(days) || days.length === 0 || days.some((d) => !validDays.includes(d))) {
      return reply.status(400).send({ error: `days должен быть непустым массивом из: ${validDays.join(', ')}` });
    }
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
      return reply.status(400).send({ error: 'time должен быть в формате HH:MM' });
    }
    const weeksN = Math.min(Math.max(parseInt(weeks, 10) || 4, 1), 8);

    // --- Eligibility ---
    const elig = await checkBookingEligibility(user_id);
    if (!elig.eligible) {
      const msg =
        elig.reason === 'no_membership'
          ? 'Для записи нужен активный абонемент. Обратитесь к тренеру.'
          : 'Пользователь не найден.';
      return reply.status(400).send({ error: msg });
    }

    const limit = elig.visitsLimit; // Infinity for unlimited, N for visits, 1 for trial

    // --- Fetch classes for the period ---
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + weeksN * 7 * 24 * 60 * 60 * 1000);

    const { data: allClasses, error: clsErr } = await supabase
      .from('classes')
      .select('id, start_at, capacity, is_cancelled')
      .gte('start_at', from.toISOString())
      .lt('start_at', to.toISOString())
      .eq('is_cancelled', false)
      .order('start_at');

    if (clsErr) return reply.status(500).send({ error: clsErr.message });

    // --- Filter by days + time ---
    const targetDays = new Set(days.map((d) => DAY_ABBR[d]));
    const [targetH, targetM] = time.split(':').map(Number);

    const matching = (allClasses || []).filter((c) => {
      const d = new Date(c.start_at);
      return targetDays.has(d.getDay()) && d.getHours() === targetH && d.getMinutes() === targetM;
    });

    // --- Book each matching class ---
    const booked = [];
    const skipped = [];

    for (const c of matching) {
      if (booked.length >= limit) {
        skipped.push({ class_id: c.id, start_at: c.start_at, reason: 'limit_reached' });
        continue;
      }

      // Check capacity
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', c.id)
        .neq('status', 'cancelled');

      if (count >= c.capacity) {
        skipped.push({ class_id: c.id, start_at: c.start_at, reason: 'full' });
        continue;
      }

      // Check duplicate
      const { data: dup } = await supabase
        .from('bookings')
        .select('id')
        .eq('class_id', c.id)
        .eq('user_id', user_id)
        .neq('status', 'cancelled')
        .maybeSingle();

      if (dup) {
        skipped.push({ class_id: c.id, start_at: c.start_at, reason: 'already_booked' });
        continue;
      }

      // Create booking
      const { error: insErr } = await supabase
        .from('bookings')
        .insert({ class_id: c.id, user_id, status: 'booked' });

      if (insErr) {
        skipped.push({ class_id: c.id, start_at: c.start_at, reason: insErr.message });
      } else {
        booked.push(c.id);
      }
    }

    // Mark trial used after successful bookings
    if (elig.useTrialAfterBook && booked.length > 0) {
      await markTrialUsed(user_id);
      await supabase.from('transactions').insert({
        user_id,
        membership_id: null,
        visits_delta: 0,
        type: 'debit',
        note: 'Пробный визит',
      });
    }

    return reply.status(200).send({
      booked,
      skipped,
      summary: { total: matching.length, booked: booked.length, skipped: skipped.length },
    });
  });

  // DELETE /bookings/:id — отменить запись
  fastify.delete('/bookings/:id', async (request, reply) => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  // PATCH /bookings/:id/checkin — отметить посещение + автосписание визита
  fastify.patch('/bookings/:id/checkin', async (request, reply) => {
    const { data: booking, error } = await supabase
      .from('bookings')
      .update({ status: 'attended', checked_in_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .select('*, user:users(id, telegram_id)')
      .single();

    if (error) return reply.status(400).send({ error: error.message });

    // Автосписание визита
    const userId = booking.user?.id;
    const telegramId = booking.user?.telegram_id;

    if (userId) {
      const today = new Date().toISOString().split('T')[0];
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
            type: 'debit',
            note: 'Списание за тренировку',
          });

        if (newVisitsLeft === 0 && telegramId) {
          await sendTelegram(telegramId, 'Твои визиты закончились, обратись к администратору.');
        }
      }
    }

    return booking;
  });

  // PATCH /bookings/:id/noshow — не пришёл
  fastify.patch('/bookings/:id/noshow', async (request, reply) => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'no_show' })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });
}
