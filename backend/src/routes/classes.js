import supabase from '../lib/supabase.js';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { from: mon.toISOString(), to: sun.toISOString() };
}

export default async function classesRoute(fastify) {
  // GET /classes?week=current
  fastify.get('/classes', async (request, reply) => {
    const { week } = request.query;

    let query = supabase
      .from('classes')
      .select('*, trainer:users!trainer_id(id, name), bookings(status)')
      .order('start_at');

    if (week === 'current') {
      const { from, to } = getWeekRange();
      query = query.gte('start_at', from).lte('start_at', to);
    }

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    const classes = data.map(({ bookings, ...c }) => ({
      ...c,
      booked: bookings.filter((b) => b.status !== 'cancelled').length,
    }));

    return classes;
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

  // DELETE /classes/:id — soft delete (is_cancelled = true)
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
