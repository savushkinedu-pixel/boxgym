import supabase from '../lib/supabase.js';

export default async function usersRoute(fastify) {
  // GET /users?telegram_id=X
  fastify.get('/users', async (request, reply) => {
    const { telegram_id } = request.query;

    if (telegram_id) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)   // pass string — PostgREST coerces to bigint
        .maybeSingle();
      if (error) return reply.status(500).send({ error: error.message });
      if (!data) return reply.status(404).send({ error: 'User not found' });
      return data;
    }

    const { data, error } = await supabase.from('users').select('*').order('name');
    if (error) return reply.status(500).send({ error: error.message });
    return data;
  });
}
