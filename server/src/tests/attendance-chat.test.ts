import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { hashPassword } from '../utils/password.js';
import { getSettings } from '../models/Settings.js';
import { companyDateKey } from '../utils/timezone.js';

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
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Attendance.deleteMany({}),
    Conversation.deleteMany({}),
    ChatMessage.deleteMany({}),
  ]);
  const passwordHash = await hashPassword('StarMedia#2026!');
  await User.create([
    {
      name: 'CEO',
      email: 'ceo@starmediainfluencer.com',
      passwordHash,
      role: 'ceo',
      status: 'active',
      mfa: { enabled: false, backupCodes: [] },
    },
    {
      name: 'Emp',
      email: 'employee@starmediainfluencer.com',
      passwordHash,
      role: 'employee',
      status: 'active',
      employeeId: 'SM0002',
      mfa: { enabled: false, backupCodes: [] },
    },
    {
      name: 'Other',
      email: 'other@starmediainfluencer.com',
      passwordHash,
      role: 'employee',
      status: 'active',
      employeeId: 'SM0003',
      mfa: { enabled: false, backupCodes: [] },
    },
  ]);
});

describe('Attendance', () => {
  it('check-in and check-out persist with duration', async () => {
    const token = await login('employee@starmediainfluencer.com');
    const inRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${token}`);
    expect(inRes.status).toBe(201);
    expect(inRes.body.data.date).toBe(companyDateKey());
    expect(inRes.body.data.checkInAt).toBeTruthy();

    const dup = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${token}`);
    expect(dup.status).toBe(400);

    // ensure checkout has measurable duration
    await Attendance.updateOne(
      { _id: inRes.body.data._id },
      { checkInAt: new Date(Date.now() - 5 * 60 * 1000) }
    );

    const missingLog = await request(app)
      .post('/api/v1/attendance/check-out')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missingLog.status).toBe(400);

    const outRes = await request(app)
      .post('/api/v1/attendance/check-out')
      .set('Authorization', `Bearer ${token}`)
      .send({
        notes: 'Finished dashboard polish',
        customTasks: ['Updated attendance widget'],
      });
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOutAt).toBeTruthy();
    expect(outRes.body.data.durationMinutes).toBeGreaterThanOrEqual(1);
    expect(outRes.body.data.workLog?.notes).toBe('Finished dashboard polish');
    expect(outRes.body.data.workLog?.customTasks).toContain('Updated attendance widget');

    const today = await request(app)
      .get('/api/v1/attendance/today')
      .set('Authorization', `Bearer ${token}`);
    expect(today.status).toBe(200);
    expect(today.body.data.canCheckIn).toBe(false);
    expect(today.body.data.canCheckOut).toBe(false);
  });

  it('employee cannot list team attendance', async () => {
    const token = await login('employee@starmediainfluencer.com');
    const res = await request(app).get('/api/v1/attendance').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Chat', () => {
  it('persists messages and blocks non-members', async () => {
    const empToken = await login('employee@starmediainfluencer.com');
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });
    const ceo = await User.findOne({ email: 'ceo@starmediainfluencer.com' });

    const convRes = await request(app)
      .post('/api/v1/chat/conversations/direct')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ userId: String(other!._id) });
    expect(convRes.status).toBe(201);
    const conversationId = convRes.body.data._id;

    const msgRes = await request(app)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ body: 'Hello teammate', clientId: 'c1' });
    expect(msgRes.status).toBe(201);

    const dup = await request(app)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ body: 'Hello teammate', clientId: 'c1' });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);

    const history = await request(app)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);

    const ceoToken = await login('ceo@starmediainfluencer.com');
    // CEO not a member of this direct chat
    const denied = await request(app)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(denied.status).toBe(403);

    // ensure CEO can create their own chat with employee
    const ceoConv = await request(app)
      .post('/api/v1/chat/conversations/direct')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({ userId: String(other!._id) });
    expect(ceoConv.status).toBe(201);
    expect(String(ceoConv.body.data._id)).not.toBe(String(conversationId));
    expect(ceo).toBeTruthy();
  });
});
