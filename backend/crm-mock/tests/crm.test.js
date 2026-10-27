import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function memoryRepo() {
  const rows = new Map([['C-101', { id: 'C-101', subject: 'Seed', owner_email: 'a@example.com', due_date: '2026-10-26T09:00:00.000Z', status: 'open', account_name: 'Acme' }]]);
  let seq = 1001;
  return {
    list: async () => [...rows.values()],
    get: async (id) => rows.get(id),
    create: async (f) => { const row = { id: `C-${seq++}`, status: 'open', account_name: null, ...f }; rows.set(row.id, row); return row; },
    update: async (id, f) => { if (!rows.has(id)) return undefined; const row = { ...rows.get(id), ...f }; rows.set(id, row); return row; },
    remove: async (id) => rows.delete(id),
    ping: async () => {},
  };
}

let app;
beforeEach(() => { app = createApp({ repo: memoryRepo() }); });

describe('CRM mock', () => {
  it('lists tasks and serves an HTML detail page', async () => {
    expect((await request(app).get('/crm/tasks').expect(200)).body).toHaveLength(1);
    const page = await request(app).get('/crm/tasks/C-101').expect(200);
    expect(page.text).toContain('Seed');
    await request(app).get('/crm/tasks/C-404').expect(404);
  });

  it('creates, updates and deletes a task', async () => {
    const created = await request(app).post('/crm/tasks')
      .send({ subject: ' New ', owner_email: 'B@Example.com', due_date: '2026-11-01T10:00:00Z' }).expect(201);
    expect(created.body).toMatchObject({ id: 'C-1001', subject: 'New', owner_email: 'b@example.com', status: 'open' });
    const updated = await request(app).patch('/crm/tasks/C-1001').send({ status: 'done', account_name: 'Contoso' }).expect(200);
    expect(updated.body).toMatchObject({ status: 'done', account_name: 'Contoso' });
    await request(app).delete('/crm/tasks/C-1001').expect(204);
    await request(app).delete('/crm/tasks/C-1001').expect(404);
  });

  it('validates input', async () => {
    const res = await request(app).post('/crm/tasks').send({ subject: '', owner_email: 'x', due_date: 'nope' }).expect(400);
    expect(res.body.error).toMatch(/subject/);
    await request(app).patch('/crm/tasks/C-101').send({ status: 'weird' }).expect(400);
    await request(app).patch('/crm/tasks/C-101').send({}).expect(400);
    await request(app).patch('/crm/tasks/C-404').send({ status: 'done' }).expect(404);
  });

  it('simulates failures', async () => {
    const failing = createApp({ repo: memoryRepo(), failMode: 'error' });
    await request(failing).get('/crm/tasks').expect(500);
    await request(failing).post('/crm/tasks').send({}).expect(500);
    const malformed = createApp({ repo: memoryRepo(), failMode: 'malformed' });
    expect((await request(malformed).get('/crm/tasks')).body).toHaveLength(2);
    await request(app).put('/__control/fail-mode').send({ mode: 'error' }).expect(200);
    await request(app).get('/crm/tasks').expect(500);
    await request(app).put('/__control/fail-mode').send({ mode: 'bogus' }).expect(400);
  });

  it('requires the service token when one is configured, except for /health', async () => {
    const secured = createApp({ repo: memoryRepo(), serviceToken: 's3cret' });
    await request(secured).get('/health').expect(200);
    await request(secured).get('/crm/tasks').expect(401);
    await request(secured).get('/crm/tasks/C-101').set('Authorization', 'Bearer wrong').expect(401);
    await request(secured).get('/crm/tasks').set('Authorization', 'Bearer s3cret').expect(200);
  });

  it('removes the fail-mode switch when control is disabled', async () => {
    const locked = createApp({ repo: memoryRepo(), enableControl: false });
    await request(locked).put('/__control/fail-mode').send({ mode: 'error' }).expect(404);
  });
});
