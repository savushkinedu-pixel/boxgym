import { randomBytes } from 'crypto';
import supabase from '../lib/supabase.js';

export default async function inviteTokensRoute(fastify) {
  // POST /invite-tokens — generate token and save with trainer_id
  fastify.post('/invite-tokens', async (request, reply) => {
    const { trainer_id } = request.body;
    if (!trainer_id) return reply.status(400).send({ error: 'trainer_id required' });

    const token = randomBytes(4).toString('hex'); // 8 hex chars

    const { data, error } = await supabase
      .from('invite_tokens')
      .insert({ token, trainer_id })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // GET /invite-tokens?used_by=:userId — find trainer for an athlete
  fastify.get('/invite-tokens', async (request, reply) => {
    const { used_by } = request.query;
    if (!used_by) return reply.status(400).send({ error: 'used_by required' });

    const { data, error } = await supabase
      .from('invite_tokens')
      .select('*, trainer:users!trainer_id(id, name, telegram_id)')
      .eq('used_by', used_by)
      .not('used_at', 'is', null)
      .maybeSingle();

    if (error) return reply.status(500).send({ error: error.message });
    if (!data) return reply.status(404).send({ error: 'No invite token found for this user' });
    return data;
  });

  // GET /invite-tokens/:token — validate token
  fastify.get('/invite-tokens/:token', async (request, reply) => {
    const { data, error } = await supabase
      .from('invite_tokens')
      .select('*, trainer:users!trainer_id(id, name, telegram_id)')
      .eq('token', request.params.token)
      .maybeSingle();

    if (error) return reply.status(500).send({ error: error.message });
    if (!data) return reply.status(404).send({ error: 'Token not found' });
    if (data.used_at) return reply.status(409).send({ error: 'Token already used' });

    return data;
  });

  // PATCH /invite-tokens/:token/use — mark token as used
  fastify.patch('/invite-tokens/:token/use', async (request, reply) => {
    const { used_by } = request.body ?? {};

    const { data, error } = await supabase
      .from('invite_tokens')
      .update({ used_at: new Date().toISOString(), used_by: used_by ?? null })
      .eq('token', request.params.token)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return data;
  });
}
