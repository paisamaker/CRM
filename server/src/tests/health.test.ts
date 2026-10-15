import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';

describe('Health Check & Readiness Endpoints', () => {
  const app = createApp();

  describe('GET /health (Liveness)', () => {
    it('returns HTTP 200 with ok status, uptime, name, env, and timestamp', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('name', 'starmedia-crm');
      expect(res.body).toHaveProperty('env');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it('does not expose secrets, credentials, or sensitive system details', async () => {
      const res = await request(app).get('/health');

      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('MONGODB');
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('secret');
      expect(bodyStr).not.toContain('JWT');
      expect(bodyStr).not.toContain('CLUSTER');
      expect(bodyStr).not.toContain('localhost');
    });

    it('is also accessible via /api/v1/health for backwards compatibility', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /health/ready (Readiness)', () => {
    it('returns HTTP 503 when database is disconnected (readyState !== 1)', async () => {
      // Mock mongoose readyState as 0 (disconnected)
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true });

      try {
        const res = await request(app).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.status).toBe('unhealthy');
        expect(res.body.database.status).toBe('disconnected');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('uptime');
      } finally {
        Object.defineProperty(mongoose.connection, 'readyState', {
          value: originalReadyState,
          configurable: true,
        });
      }
    });

    it('returns HTTP 200 when database is connected and responsive', async () => {
      // Mock mongoose readyState as 1 (connected) with working db.admin().ping()
      const originalReadyState = mongoose.connection.readyState;
      const originalDb = mongoose.connection.db;

      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          admin: () => ({
            ping: async () => ({ ok: 1 }),
          }),
        },
        configurable: true,
      });

      try {
        const res = await request(app).get('/health/ready');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ready');
        expect(res.body.database.status).toBe('connected');
        expect(typeof res.body.database.latencyMs).toBe('number');
        expect(res.body).toHaveProperty('timestamp');
      } finally {
        Object.defineProperty(mongoose.connection, 'readyState', {
          value: originalReadyState,
          configurable: true,
        });
        Object.defineProperty(mongoose.connection, 'db', {
          value: originalDb,
          configurable: true,
        });
      }
    });

    it('returns HTTP 503 when ping throws or fails', async () => {
      const originalReadyState = mongoose.connection.readyState;
      const originalDb = mongoose.connection.db;

      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
      Object.defineProperty(mongoose.connection, 'db', {
        value: {
          admin: () => ({
            ping: async () => {
              throw new Error('Connection refused');
            },
          }),
        },
        configurable: true,
      });

      try {
        const res = await request(app).get('/health/ready');

        expect(res.status).toBe(503);
        expect(res.body.status).toBe('unhealthy');
        expect(res.body.database.status).toBe('unresponsive');
      } finally {
        Object.defineProperty(mongoose.connection, 'readyState', {
          value: originalReadyState,
          configurable: true,
        });
        Object.defineProperty(mongoose.connection, 'db', {
          value: originalDb,
          configurable: true,
        });
      }
    });
  });
});
