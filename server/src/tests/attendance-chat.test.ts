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
    const denied = await request(app)
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${ceoToken}`);
    expect(denied.status).toBe(403);

    const ceoConv = await request(app)
      .post('/api/v1/chat/conversations/direct')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({ userId: String(other!._id) });
    expect(ceoConv.status).toBe(201);
    expect(String(ceoConv.body.data._id)).not.toBe(String(conversationId));
    expect(ceo).toBeTruthy();
  });

  it('supports groups, reactions, delete-for-me, prefs, and unauthenticated reject', async () => {
    const empToken = await login('employee@starmediainfluencer.com');
    const otherToken = await login('other@starmediainfluencer.com');
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });
    const ceo = await User.findOne({ email: 'ceo@starmediainfluencer.com' });

    const unauth = await request(app).get('/api/v1/chat/conversations');
    expect(unauth.status).toBe(401);

    const groupRes = await request(app)
      .post('/api/v1/chat/conversations/group')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ name: 'Design Ops', memberIds: [String(other!._id), String(ceo!._id)] });
    expect(groupRes.status).toBe(201);
    const groupId = groupRes.body.data._id;

    const msg = await request(app)
      .post(`/api/v1/chat/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ body: 'Welcome all', clientId: 'g1' });
    expect(msg.status).toBe(201);
    const messageId = msg.body.data._id;

    const react = await request(app)
      .post(`/api/v1/chat/messages/${messageId}/react`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ emoji: '👍' });
    expect(react.status).toBe(200);
    expect(react.body.data.reactions?.[0]?.emoji).toBe('👍');

    const delMe = await request(app)
      .post(`/api/v1/chat/messages/${messageId}/delete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ scope: 'me' });
    expect(delMe.status).toBe(200);

    const otherHistory = await request(app)
      .get(`/api/v1/chat/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherHistory.status).toBe(200);
    expect(otherHistory.body.data.find((m: { _id: string }) => m._id === messageId)).toBeFalsy();

    const empHistory = await request(app)
      .get(`/api/v1/chat/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(empHistory.body.data.find((m: { _id: string }) => m._id === messageId)).toBeTruthy();

    const prefs = await request(app)
      .patch(`/api/v1/chat/conversations/${groupId}/prefs`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ pinned: true, muted: true });
    expect(prefs.status).toBe(200);
    expect(prefs.body.data.pinned).toBe(true);

    const delEveryone = await request(app)
      .post(`/api/v1/chat/messages/${messageId}/delete`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ scope: 'everyone' });
    expect(delEveryone.status).toBe(200);

    const afterDelete = await request(app)
      .get(`/api/v1/chat/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${empToken}`);
    const tomb = afterDelete.body.data.find((m: { _id: string }) => m._id === messageId);
    expect(tomb?.deletedForEveryone || tomb?.tombstone).toBeTruthy();

    const leave = await request(app)
      .patch(`/api/v1/chat/conversations/${groupId}/members`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ leave: true });
    expect(leave.status).toBe(200);

    const blocked = await request(app)
      .get(`/api/v1/chat/conversations/${groupId}/messages`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(blocked.status).toBe(403);
  });
});
