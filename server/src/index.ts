import http from 'http';
import { createApp } from './app.js';
import { connectDB, ensureIndexes } from './config/db.js';
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
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
