import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { getSettings } from '../models/Settings.js';

const app = createApp();

beforeAll(async () => {
  await connectDB();
  await getSettings();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await User.deleteMany({});
  await User.create({
    name: 'CEO Demo',
    email: 'ceo@starmediainfluencer.com',
    passwordHash: await hashPassword('StarMedia#2026!'),
    role: 'ceo',
    status: 'active',
    department: 'Executive',
    mfa: { enabled: false, backupCodes: [] },
  });
  await User.create({
    name: 'Employee Demo',
    email: 'employee@starmediainfluencer.com',
    passwordHash: await hashPassword('StarMedia#2026!'),
    role: 'employee',
    status: 'active',
    department: 'Ops',
    mfa: { enabled: false, backupCodes: [] },
  });
});

describe('Auth & RBAC', () => {
  it('rejects non-company email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hacker@gmail.com', password: 'StarMedia#2026!' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('logs in with company email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ceo@starmediainfluencer.com', password: 'StarMedia#2026!' });
    // CEO requires MFA setup since MFA_REQUIRED_ROLES
    expect([200]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('blocks employee from finance overview', async () => {
    // Temporarily treat employee login without MFA for test by using employee
    // Employees don't require MFA when mfaOptionalForEmployees is true
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'employee@starmediainfluencer.com', password: 'StarMedia#2026!' });

    const token = login.body.data.accessToken;
    expect(token).toBeTruthy();

    const res = await request(app)
      .get('/api/v1/finance/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
