import 'dotenv/config';
import Fastify from 'fastify';
import cron from 'node-cron';
import healthRoute from './routes/health.js';
import classesRoute from './routes/classes.js';
import bookingsRoute from './routes/bookings.js';
import usersRoute from './routes/users.js';
import membershipsRoute from './routes/memberships.js';
import transactionsRoute from './routes/transactions.js';
import { autoCheckin } from './autoCheckin.js';
import statsRoute from './routes/stats.js';

const fastify = Fastify({ logger: true });

fastify.register(healthRoute);
fastify.register(classesRoute);
fastify.register(bookingsRoute);
fastify.register(usersRoute);
fastify.register(membershipsRoute);
fastify.register(transactionsRoute);
fastify.register(statsRoute);

// Run auto-checkin every 5 minutes
cron.schedule('*/5 * * * *', () => {
  autoCheckin().catch((err) => console.error('[autoCheckin] unhandled error:', err.message));
});

const PORT = process.env.PORT || 3001;

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
