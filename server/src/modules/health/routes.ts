import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';

const router = Router();

// Allow cross-origin requests for monitoring tools/dashboards
router.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

/**
 * Liveness Probe: GET /health
 * Lightweight, fast, and does NOT depend on MongoDB.
 * Verifies that the Express process is running and accepting HTTP requests.
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    name: 'starmedia-crm',
    env: env.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness Probe: GET /health/ready
 * Verifies that the application is ready to handle database-dependent requests.
 * Checks existing MongoDB connection and performs a lightweight ping with a 2-second timeout.
 * Returns HTTP 200 when ready, HTTP 503 if disconnected or ping fails.
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor(process.uptime());

  // Check Mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const readyState = mongoose.connection.readyState;

  if (readyState !== 1) {
    return res.status(503).json({
      status: 'unhealthy',
      name: 'starmedia-crm',
      env: env.NODE_ENV,
      database: {
        status: readyState === 2 ? 'connecting' : 'disconnected',
      },
      uptime,
      timestamp,
    });
  }

  try {
    const startTime = Date.now();
    const db = mongoose.connection.db;

    if (!db) {
      return res.status(503).json({
        status: 'unhealthy',
        name: 'starmedia-crm',
        env: env.NODE_ENV,
        database: {
          status: 'disconnected',
        },
        uptime,
        timestamp,
      });
    }

    // Ping MongoDB with a strict 2-second timeout to avoid hanging requests
    const pingPromise = db.admin().ping();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database ping timeout')), 2000)
    );

    await Promise.race([pingPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    return res.status(200).json({
      status: 'ready',
      name: 'starmedia-crm',
      env: env.NODE_ENV,
      database: {
        status: 'connected',
        latencyMs,
      },
      uptime,
      timestamp,
    });
  } catch {
    return res.status(503).json({
      status: 'unhealthy',
      name: 'starmedia-crm',
      env: env.NODE_ENV,
      database: {
        status: 'unresponsive',
      },
      uptime,
      timestamp,
    });
  }
});

export default router;
