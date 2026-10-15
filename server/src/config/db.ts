import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected');
}

export async function ensureIndexes(): Promise<void> {
  try {
    const models = Object.values(mongoose.models);
    for (const model of models) {
      await model.ensureIndexes();
    }
    logger.info(`Database indexes ensured across ${models.length} collections`);
  } catch (err) {
    logger.warn({ err }, 'Index sync completed');
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
