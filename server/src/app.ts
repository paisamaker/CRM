import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/routes.js';
import usersRoutes from './modules/users/routes.js';
import clientsRoutes from './modules/clients/routes.js';
import leadsRoutes from './modules/leads/routes.js';
import projectsRoutes from './modules/projects/routes.js';
import tasksRoutes from './modules/tasks/routes.js';
import financeRoutes from './modules/finance/routes.js';
import approvalsRoutes from './modules/approvals/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import alertsRoutes from './modules/alerts/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import filesRoutes from './modules/files/routes.js';
import attendanceRoutes from './modules/attendance/routes.js';
import chatRoutes from './modules/chat/routes.js';
import teamsRoutes from './modules/teams/routes.js';
import healthRoutes from './modules/health/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser tools (curl, postman, server-to-server)
        if (!origin) {
          callback(null, true);
          return;
        }

        const normalizedOrigin = origin.replace(/\/+$/, '');

        // Explicit CLIENT_URL list (comma-separated) — required in production
        if (env.clientOrigins.includes(normalizedOrigin)) {
          callback(null, true);
          return;
        }

        // Dev-only: localhost + Vercel preview wildcards. In production, add each
        // preview URL to CLIENT_URL instead of allowing any *.vercel.app origin.
        if (env.NODE_ENV !== 'production') {
          if (
            /^http:\/\/localhost(:\d+)?$/.test(normalizedOrigin) ||
            /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(normalizedOrigin)
          ) {
            callback(null, true);
            return;
          }
        }

        // Deny without throwing — throwing surfaces as an unhandled 500 in some CORS setups
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.path === '/health' ||
        req.path === '/health/ready' ||
        req.path.startsWith('/api/v1/health'),
    })
  );
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // Health and readiness endpoints (unauthenticated, lightweight, production-safe)
  app.use('/health', healthRoutes);
  app.use('/api/v1/health', healthRoutes);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/clients', clientsRoutes);
  app.use('/api/v1/leads', leadsRoutes);
  app.use('/api/v1/projects', projectsRoutes);
  app.use('/api/v1/tasks', tasksRoutes);
  app.use('/api/v1/finance', financeRoutes);
  app.use('/api/v1/approvals', approvalsRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/alerts', alertsRoutes);
  app.use('/api/v1/notifications', alertsRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/audit-logs', settingsRoutes);
  app.use('/api/v1/files', filesRoutes);
  app.use('/api/v1/attendance', attendanceRoutes);
  app.use('/api/v1/chat', chatRoutes);
  app.use('/api/v1/teams', teamsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
