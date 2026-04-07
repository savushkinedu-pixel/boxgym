import supabase from '../lib/supabase.js';

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
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return data.filter((b) => {
        const start = new Date(b.class.start_at);
        return start >= now && start <= nextWeek && b.status !== 'cancelled';
      });
    }

    return data;
  });

  // POST /bookings — записаться на тренировку
  fastify.post('/bookings', async (request, reply) => {
    const { class_id, user_id } = request.body;

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
    return reply.status(201).send(data);
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

  // PATCH /bookings/:id/checkin — отметить посещение
  fastify.patch('/bookings/:id/checkin', async (request, reply) => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'attended', checked_in_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
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
