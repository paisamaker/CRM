import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { DocumentFile } from '../models/Document.js';
import { hashPassword } from '../utils/password.js';
import { ensureProjectFolders } from '../services/projectFolders.js';
import { safeDropTestDatabase } from './safeDropDatabase.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'StarMedia#2026!' });
  return res.body.data.accessToken as string;
}

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await safeDropTestDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Project.deleteMany({}), DocumentFile.deleteMany({})]);
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
      name: 'Emp A',
      email: 'employee@starmediainfluencer.com',
      passwordHash,
      role: 'employee',
      status: 'active',
      employeeId: 'SM0002',
      mfa: { enabled: false, backupCodes: [] },
    },
    {
      name: 'Emp B',
      email: 'other@starmediainfluencer.com',
      passwordHash,
      role: 'employee',
      status: 'active',
      employeeId: 'SM0003',
      mfa: { enabled: false, backupCodes: [] },
    },
  ]);
});

describe('Files permissions & project folders', () => {
  it('creates project folders idempotently and scopes employee access', async () => {
    const empToken = await login('employee@starmediainfluencer.com');
    const otherToken = await login('other@starmediainfluencer.com');
    const ceoToken = await login('ceo@starmediainfluencer.com');
    const emp = await User.findOne({ email: 'employee@starmediainfluencer.com' });
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });

    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({ name: 'Website Redesign', members: [String(emp!._id)] });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.data._id;

    const rootKey = `${projectId}:root`;
    const root = await DocumentFile.findOne({ projectFolderKey: rootKey });
    expect(root).toBeTruthy();
    expect(root!.kind).toBe('folder');

    const again = await ensureProjectFolders(projectId, 'Website Redesign', String(emp!._id));
    expect(again.rootId).toBe(String(root!._id));
    const roots = await DocumentFile.countDocuments({ projectFolderKey: rootKey });
    expect(roots).toBe(1);

    const privateDoc = await DocumentFile.create({
      name: 'secret.pdf',
      url: '/api/v1/files/secret.pdf',
      mime: 'application/pdf',
      size: 100,
      kind: 'file',
      visibility: 'private',
      owner: other!._id,
      uploadedBy: other!._id,
    });

    const denied = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${empToken}`)
      .query({ view: 'mine' });
    expect(denied.status).toBe(200);
    expect(denied.body.data.items.find((i: { _id: string }) => i._id === String(privateDoc._id))).toBeFalsy();

    const projectFile = await DocumentFile.create({
      name: 'brief.pdf',
      url: '/api/v1/files/brief.pdf',
      mime: 'application/pdf',
      size: 200,
      kind: 'file',
      visibility: 'project',
      project: projectId,
      owner: emp!._id,
      uploadedBy: emp!._id,
    });

    const empList = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${empToken}`)
      .query({ project: projectId, view: 'projects' });
    expect(empList.status).toBe(200);
    expect(empList.body.data.items.some((i: { _id: string }) => i._id === String(projectFile._id))).toBe(true);

    const otherList = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ project: projectId, view: 'projects' });
    expect(otherList.status).toBe(200);
    expect(otherList.body.data.items.some((i: { _id: string }) => i._id === String(projectFile._id))).toBe(
      false
    );

    const share = await request(app)
      .post(`/api/v1/files/item/${privateDoc._id}/share`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: String(emp!._id), level: 'viewer' });
    expect(share.status).toBe(200);

    const shared = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${empToken}`)
      .query({ view: 'shared' });
    expect(shared.body.data.items.some((i: { _id: string }) => i._id === String(privateDoc._id))).toBe(true);

    await request(app)
      .post(`/api/v1/files/item/${privateDoc._id}/share`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: String(emp!._id), revoke: true });

    const afterRevoke = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${empToken}`)
      .query({ view: 'shared' });
    expect(afterRevoke.body.data.items.some((i: { _id: string }) => i._id === String(privateDoc._id))).toBe(
      false
    );
  });

  it('rejects unauthenticated file list', async () => {
    const res = await request(app).get('/api/v1/files');
    expect(res.status).toBe(401);
  });

  it('blocks download of private files and orphan filenames for non-admins', async () => {
    const empToken = await login('employee@starmediainfluencer.com');
    const otherToken = await login('other@starmediainfluencer.com');
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });

    await DocumentFile.create({
      name: 'locked.pdf',
      url: '/api/v1/files/locked.pdf',
      mime: 'application/pdf',
      size: 50,
      kind: 'file',
      visibility: 'private',
      owner: other!._id,
      uploadedBy: other!._id,
    });

    const denied = await request(app)
      .get('/api/v1/files/locked.pdf')
      .set('Authorization', `Bearer ${empToken}`);
    expect(denied.status).toBe(403);

    const ownerOk = await request(app)
      .get('/api/v1/files/locked.pdf')
      .set('Authorization', `Bearer ${otherToken}`);
    // File may 404 on disk but must not be 403 for owner once ACL passes
    expect([200, 404]).toContain(ownerOk.status);

    const orphan = await request(app)
      .get('/api/v1/files/does-not-exist-orphan.bin')
      .set('Authorization', `Bearer ${empToken}`);
    expect(orphan.status).toBe(404);

    const fakeId = new mongoose.Types.ObjectId().toString();
    const guess = await request(app)
      .get(`/api/v1/files/item/${fakeId}`)
      .set('Authorization', `Bearer ${empToken}`);
    expect(guess.status).toBe(404);
  });

  it('revokes project access when membership is removed without deleting files', async () => {
    const ceoToken = await login('ceo@starmediainfluencer.com');
    const empToken = await login('employee@starmediainfluencer.com');
    const emp = await User.findOne({ email: 'employee@starmediainfluencer.com' });
    const ceo = await User.findOne({ email: 'ceo@starmediainfluencer.com' });

    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({ name: 'Campaign', members: [String(emp!._id)] });
    const projectId = projectRes.body.data._id;

    const ceoFile = await DocumentFile.create({
      name: 'ceo-only.pdf',
      url: '/api/v1/files/ceo-only.pdf',
      mime: 'application/pdf',
      size: 10,
      kind: 'file',
      visibility: 'project',
      project: projectId,
      owner: ceo!._id,
      uploadedBy: ceo!._id,
    });

    const empOwned = await DocumentFile.create({
      name: 'my-upload.pdf',
      url: '/api/v1/files/my-upload.pdf',
      mime: 'application/pdf',
      size: 10,
      kind: 'file',
      visibility: 'project',
      project: projectId,
      owner: emp!._id,
      uploadedBy: emp!._id,
    });

    expect(
      (await request(app).get(`/api/v1/files/item/${ceoFile._id}`).set('Authorization', `Bearer ${empToken}`))
        .status
    ).toBe(200);

    await Project.findByIdAndUpdate(projectId, { $pull: { members: emp!._id } });

    expect(
      (await request(app).get(`/api/v1/files/item/${ceoFile._id}`).set('Authorization', `Bearer ${empToken}`))
        .status
    ).toBe(403);

    // Owner keeps their own upload; file record is not deleted
    expect(
      (await request(app).get(`/api/v1/files/item/${empOwned._id}`).set('Authorization', `Bearer ${empToken}`))
        .status
    ).toBe(200);
    expect(await DocumentFile.findById(ceoFile._id)).toBeTruthy();
  });

  it('prevents employees from granting manager share level', async () => {
    const otherToken = await login('other@starmediainfluencer.com');
    const emp = await User.findOne({ email: 'employee@starmediainfluencer.com' });
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });

    const doc = await DocumentFile.create({
      name: 'mine.txt',
      url: '/api/v1/files/mine.txt',
      mime: 'text/plain',
      size: 1,
      kind: 'file',
      visibility: 'private',
      owner: other!._id,
      uploadedBy: other!._id,
    });

    const elevate = await request(app)
      .post(`/api/v1/files/item/${doc._id}/share`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: String(emp!._id), level: 'manager' });
    expect(elevate.status).toBe(403);
  });

  it('soft-deletes and restores for owners', async () => {
    const otherToken = await login('other@starmediainfluencer.com');
    const other = await User.findOne({ email: 'other@starmediainfluencer.com' });

    const doc = await DocumentFile.create({
      name: 'temp.txt',
      url: '/api/v1/files/temp.txt',
      mime: 'text/plain',
      size: 1,
      kind: 'file',
      visibility: 'private',
      owner: other!._id,
      uploadedBy: other!._id,
    });

    const trash = await request(app)
      .delete(`/api/v1/files/item/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(trash.status).toBe(200);

    const listed = await request(app)
      .get('/api/v1/files')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ view: 'trash' });
    expect(listed.body.data.items.some((i: { _id: string }) => i._id === String(doc._id))).toBe(true);

    const restore = await request(app)
      .patch(`/api/v1/files/item/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ restore: true });
    expect(restore.status).toBe(200);
    expect(restore.body.data.trashedAt).toBeFalsy();
  });
});
