import http from 'http';
import { createApp } from './app.js';
import { connectDB, disconnectDB, ensureIndexes } from './config/db.js';
import { env } from './config/env.js';
import { initSocket } from './config/socket.js';
import { startJobs } from './jobs/alertEngine.js';
import { logger } from './utils/logger.js';
import { getSettings } from './models/Settings.js';

async function main() {
  await connectDB();
  await ensureIndexes();
  await getSettings();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  if (env.NODE_ENV !== 'test') {
    startJobs();
  }

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`STAR MEDIA CRM API listening on 0.0.0.0:${env.PORT}`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async (err) => {
      try {
        await disconnectDB();
      } catch (dbErr) {
        logger.warn({ err: dbErr }, 'Error during MongoDB disconnect');
      }
      if (err) {
        logger.error({ err }, 'HTTP server close error');
        process.exit(1);
      }
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
