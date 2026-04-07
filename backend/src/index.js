import 'dotenv/config';
import Fastify from 'fastify';
import healthRoute from './routes/health.js';
import classesRoute from './routes/classes.js';

const fastify = Fastify({ logger: true });

fastify.register(healthRoute);
fastify.register(classesRoute);

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
