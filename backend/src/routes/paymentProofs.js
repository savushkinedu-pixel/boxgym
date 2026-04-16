import supabase from '../lib/supabase.js';

export default async function paymentProofsRoute(fastify) {
  // POST /payment-proofs — save photo file_id from athlete
  fastify.post('/payment-proofs', async (request, reply) => {
    const { user_id, file_id } = request.body;

    const { data, error } = await supabase
      .from('payment_proofs')
      .insert({ user_id, file_id })
      .select('*, user:users(id, name, telegram_id)')
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // GET /payment-proofs?status=pending — list proofs (admin/trainer)
  fastify.get('/payment-proofs', async (request, reply) => {
    const { status } = request.query;

    let query = supabase
      .from('payment_proofs')
      .select('*, user:users(id, name, telegram_id)')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });

  // PATCH /payment-proofs/:id/confirm — trainer confirms payment
  fastify.patch('/payment-proofs/:id/confirm', async (request, reply) => {
    const { confirmed_by, note } = request.body ?? {};

    const { data, error } = await supabase
      .from('payment_proofs')
      .update({
        status: 'confirmed',
        confirmed_by: confirmed_by ?? null,
        confirmed_at: new Date().toISOString(),
        note: note ?? null,
      })
      .eq('id', request.params.id)
      .select('*, user:users(id, name, telegram_id)')
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });

  // PATCH /payment-proofs/:id/reject — trainer rejects payment
  fastify.patch('/payment-proofs/:id/reject', async (request, reply) => {
    const { note } = request.body ?? {};

    const { data, error } = await supabase
      .from('payment_proofs')
      .update({ status: 'rejected', note: note ?? null })
      .eq('id', request.params.id)
      .select('*, user:users(id, name, telegram_id)')
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });
}
