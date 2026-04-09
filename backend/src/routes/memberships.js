import supabase from '../lib/supabase.js';

export default async function membershipsRoute(fastify) {
  // GET /memberships/:userId — активный абонемент атлета
  fastify.get('/memberships/:userId', async (request, reply) => {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('memberships')
      .select('*')
      .eq('user_id', request.params.userId)
      .gte('valid_to', today)
      .eq('is_frozen', false)
      .order('valid_to', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) return reply.status(500).send({ error: error.message });
    if (!data) return reply.status(404).send({ error: 'Абонемент не найден' });
    return data;
  });

  // POST /memberships — создать абонемент (admin)
  fastify.post('/memberships', async (request, reply) => {
    const { user_id, type, visits_total, valid_from, valid_to } = request.body;

    const visits_left = (type === 'visits' || type === 'single') ? (visits_total ?? null) : null;

    const { data, error } = await supabase
      .from('memberships')
      .insert({ user_id, type, visits_total: visits_total ?? null, visits_left, valid_from, valid_to })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // PATCH /memberships/:id/freeze
  fastify.patch('/memberships/:id/freeze', async (request, reply) => {
    const { data, error } = await supabase
      .from('memberships')
      .update({ is_frozen: true })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  // PATCH /memberships/:id/unfreeze
  fastify.patch('/memberships/:id/unfreeze', async (request, reply) => {
    const { data, error } = await supabase
      .from('memberships')
      .update({ is_frozen: false })
      .eq('id', request.params.id)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  // POST /freeze-requests — создать заявку на заморозку
  fastify.post('/freeze-requests', async (request, reply) => {
    const { user_id, membership_id } = request.body;

    const { data, error } = await supabase
      .from('freeze_requests')
      .insert({ user_id, membership_id: membership_id ?? null })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // GET /freeze-requests — список всех заявок (admin)
  fastify.get('/freeze-requests', async (_request, reply) => {
    const { data, error } = await supabase
      .from('freeze_requests')
      .select('*, user:users(name, telegram_id), membership:memberships(type, valid_to)')
      .order('requested_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
}
