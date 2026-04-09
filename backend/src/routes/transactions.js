import supabase from '../lib/supabase.js';

export default async function transactionsRoute(fastify) {
  // GET /transactions/:userId — история (последние 20)
  fastify.get('/transactions/:userId', async (request, reply) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', request.params.userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  // POST /transactions — ручное начисление (admin)
  fastify.post('/transactions', async (request, reply) => {
    const { user_id, membership_id, visits_delta, type, note } = request.body;

    const { data, error } = await supabase
      .from('transactions')
      .insert({ user_id, membership_id: membership_id ?? null, visits_delta, type, note: note ?? null })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // GET /transactions/export/:userId — CSV
  fastify.get('/transactions/export/:userId', async (request, reply) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', request.params.userId)
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });

    const header = 'id,user_id,membership_id,visits_delta,type,note,created_at\n';
    const rows = data.map((t) =>
      [t.id, t.user_id, t.membership_id ?? '', t.visits_delta, t.type, `"${(t.note ?? '').replace(/"/g, '""')}"`, t.created_at].join(',')
    );
    const csv = header + rows.join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="transactions_${request.params.userId}.csv"`);
    return reply.send(csv);
  });
}
