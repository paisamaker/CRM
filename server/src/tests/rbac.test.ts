import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Approval } from '../models/Approval.js';
import { Transaction } from '../models/Transaction.js';
import { hashPassword } from '../utils/password.js';
import { getSettings } from '../models/Settings.js';
import { safeDropTestDatabase } from './safeDropDatabase.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'StarMedia#2026!' });
  return res.body.data.accessToken as string;
}

beforeAll(async () => {
  await connectDB();
  await getSettings();
});

afterAll(async () => {
  await safeDropTestDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Task.deleteMany({}), Approval.deleteMany({}), Transaction.deleteMany({})]);
  const passwordHash = await hashPassword('StarMedia#2026!');
  const ceo = await User.create({
    name: 'CEO',
    email: 'ceo@starmediainfluencer.com',
    passwordHash,
    role: 'ceo',
    status: 'active',
    mfa: { enabled: false, backupCodes: [] },
  });
  const employee = await User.create({
    name: 'Emp',
    email: 'employee@starmediainfluencer.com',
    passwordHash,
    role: 'employee',
    status: 'active',
    mfa: { enabled: false, backupCodes: [] },
  });
  const other = await User.create({
    name: 'Other',
    email: 'other@starmediainfluencer.com',
    passwordHash,
    role: 'employee',
    status: 'active',
    mfa: { enabled: false, backupCodes: [] },
  });
  await Task.create({
    title: 'Other task',
    assignees: [other._id],
    createdBy: ceo._id,
    status: 'todo',
    priority: 'medium',
  });
  await Approval.create({
    type: 'expense',
    refModel: 'Transaction',
    refId: new mongoose.Types.ObjectId(),
    amount: 1000,
    title: 'Test',
    requestedBy: employee._id,
    status: 'approved',
    history: [],
  });
});

describe('RBAC & immutability', () => {
  it('employee cannot mutate another user task', async () => {
    const token = await login('employee@starmediainfluencer.com');
    const task = await Task.findOne({ title: 'Other task' });
    const res = await request(app)
      .post(`/api/v1/tasks/${task!._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(403);
  });

  it('cannot reject an already approved request', async () => {
    const token = await login('ceo@starmediainfluencer.com');
    const approval = await Approval.findOne({ status: 'approved' });
    const res = await request(app)
      .post(`/api/v1/approvals/${approval!._id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'too late' });
    expect(res.status).toBe(400);
  });

  it('manager cannot invite users (employee-like access)', async () => {
    const passwordHash = await hashPassword('StarMedia#2026!');
    await User.create({
      name: 'Mgr',
      email: 'manager@starmediainfluencer.com',
      passwordHash,
      role: 'manager',
      status: 'active',
      mfa: { enabled: false, backupCodes: [] },
    });
    const token = await login('manager@starmediainfluencer.com');
    const res = await request(app)
      .post('/api/v1/auth/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newhire@starmediainfluencer.com', role: 'employee' });
    expect(res.status).toBe(403);
  });
});
