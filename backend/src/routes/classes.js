import supabase from '../lib/supabase.js';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to   = new Date(now); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  if (period === 'tomorrow') {
    const from = new Date(now); from.setDate(now.getDate() + 1); from.setHours(0, 0, 0, 0);
    const to   = new Date(from); to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  // week (default)
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const from = new Date(now); from.setDate(now.getDate() + diffToMon); from.setHours(0, 0, 0, 0);
  const to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
  return { from, to };
}

export default async function classesRoute(fastify) {
  // GET /classes/trainer/:trainer_id?period=today|tomorrow|week
  // MUST be registered before /classes/:id to avoid "trainer" matching as :id
  fastify.get('/classes/trainer/:trainer_id', async (request, reply) => {
    const { trainer_id } = request.params;
    const { period = 'week' } = request.query;
    const { from, to } = getPeriodRange(period);

    const { data, error } = await supabase
      .from('classes')
      .select('*, bookings(status, user:users(id, name))')
      .eq('trainer_id', trainer_id)
      .eq('is_cancelled', false)
      .gte('start_at', from.toISOString())
      .lte('start_at', to.toISOString())
      .order('start_at');

    if (error) return reply.status(500).send({ error: error.message });

    return data.map(({ bookings, ...c }) => ({
      ...c,
      booked: bookings.filter((b) => b.status !== 'cancelled').length,
      attendees: bookings
        .filter((b) => b.status !== 'cancelled')
        .map((b) => b.user)
        .filter(Boolean),
    }));
  });

  // GET /classes?week=current&from=X&to=Y
  fastify.get('/classes', async (request, reply) => {
    const { week, from, to } = request.query;

    let query = supabase
      .from('classes')
      .select('*, trainer:users!trainer_id(id, name), bookings(status)')
      .order('start_at');

    if (week === 'current') {
      const range = getWeekRange();
      query = query.gte('start_at', range.from).lte('start_at', range.to);
    } else {
      if (from) query = query.gte('start_at', from);
      if (to)   query = query.lte('start_at', to);
    }

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    return data.map(({ bookings, ...c }) => ({
      ...c,
      booked: bookings.filter((b) => b.status !== 'cancelled').length,
    }));
  });

  // GET /classes/:id
  fastify.get('/classes/:id', async (request, reply) => {
    const { data, error } = await supabase
      .from('classes')
      .select('*, trainer:users!trainer_id(id, name), bookings(id, status, user_id)')
      .eq('id', request.params.id)
      .single();

    if (error) return reply.status(404).send({ error: error.message });
    return data;
  });

  // POST /classes
  fastify.post('/classes', async (request, reply) => {
    const { type, trainer_id, start_at, duration_min, capacity, location, recurrence_rule } =
      request.body;

    const { data, error } = await supabase
      .from('classes')
      .insert({ type, trainer_id, start_at, duration_min, capacity, location, recurrence_rule })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // PUT /classes/:id
  fastify.put('/classes/:id', async (request, reply) => {
    const { type, trainer_id, start_at, duration_min, capacity, location, recurrence_rule } =
      request.body;

    const { data, error } = await supabase
      .from('classes')
      .update({ type, trainer_id, start_at, duration_min, capacity, location, recurrence_rule })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  // DELETE /classes/:id — soft delete
  fastify.delete('/classes/:id', async (request, reply) => {
    const { data, error } = await supabase
      .from('classes')
      .update({ is_cancelled: true })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });
}
