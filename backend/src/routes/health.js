export default async function healthRoute(fastify) {
  fastify.get('/health', async (_request, _reply) => {
    return { status: 'ok' };
  });
}
