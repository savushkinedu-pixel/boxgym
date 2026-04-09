import 'dotenv/config';
import Fastify from 'fastify';
import healthRoute from './routes/health.js';
import classesRoute from './routes/classes.js';
import bookingsRoute from './routes/bookings.js';
import usersRoute from './routes/users.js';
import membershipsRoute from './routes/memberships.js';
import transactionsRoute from './routes/transactions.js';

const fastify = Fastify({ logger: true });

fastify.register(healthRoute);
fastify.register(classesRoute);
fastify.register(bookingsRoute);
fastify.register(usersRoute);
fastify.register(membershipsRoute);
fastify.register(transactionsRoute);

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
