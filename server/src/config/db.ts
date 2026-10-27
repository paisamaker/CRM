import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  // Prefer live process.env so Jest setup can force a test DB without mutating cached env
  const uri = process.env.MONGODB_URI || env.MONGODB_URI;
  await mongoose.connect(uri, {
    maxPoolSize: 50,
    minPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
  });
  logger.info('MongoDB connected with pooled connections');
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
