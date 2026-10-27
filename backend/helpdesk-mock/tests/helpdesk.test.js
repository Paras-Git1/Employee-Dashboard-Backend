import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

function memoryRepo() {
  const rows = new Map([['T-201', { ticket_id: 'T-201', title: 'Seed', assignee_email: 'a@example.com', sla_due_at: '2026-10-26T09:00:00.000Z', state: 'new', urgency: 3 }]]);
  let seq = 1001;
  return {
    list: async () => [...rows.values()],
    get: async (id) => rows.get(id),
    create: async (f) => { const row = { ticket_id: `T-${seq++}`, state: 'new', ...f }; rows.set(row.ticket_id, row); return row; },
    update: async (id, f) => { if (!rows.has(id)) return undefined; const row = { ...rows.get(id), ...f }; rows.set(id, row); return row; },
    remove: async (id) => rows.delete(id),
    ping: async () => {},
  };
}

let app;
beforeEach(() => { app = createApp({ repo: memoryRepo() }); });

describe('Helpdesk mock', () => {
  it('lists tickets and serves an HTML detail page', async () => {
    expect((await request(app).get('/helpdesk/tickets').expect(200)).body).toHaveLength(1);
    expect((await request(app).get('/helpdesk/tickets/T-201').expect(200)).text).toContain('Seed');
  });

  it('creates, updates and deletes a ticket', async () => {
    const created = await request(app).post('/helpdesk/tickets')
      .send({ title: 'Printer', assignee_email: 'b@example.com', sla_due_at: '2026-11-01T10:00:00Z', urgency: 2 }).expect(201);
    expect(created.body).toMatchObject({ ticket_id: 'T-1001', state: 'new', urgency: 2 });
    expect((await request(app).patch('/helpdesk/tickets/T-1001').send({ state: 'solved' }).expect(200)).body.state).toBe('solved');
    await request(app).delete('/helpdesk/tickets/T-1001').expect(204);
    await request(app).delete('/helpdesk/tickets/T-1001').expect(404);
  });

  it('validates urgency, state and required fields', async () => {
    await request(app).post('/helpdesk/tickets').send({ title: 'x', assignee_email: 'b@example.com', sla_due_at: '2026-11-01T10:00:00Z', urgency: 5 }).expect(400);
    await request(app).post('/helpdesk/tickets').send({ title: 'x', assignee_email: 'b@example.com', sla_due_at: '2026-11-01T10:00:00Z' }).expect(400);
    await request(app).patch('/helpdesk/tickets/T-201').send({ state: 'closed' }).expect(400);
  });
});
