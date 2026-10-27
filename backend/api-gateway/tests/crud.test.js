import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { SourceError } from '../src/services/clients/httpClient.js';
import { toCrmPayload, toHelpdeskPayload } from '../src/services/normalizers.js';
import { createTaskService } from '../src/services/taskService.js';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const config = { jwtSecret: 'test-secret', cookieName: 'td_session', corsOrigins: [] };
const employees = [
  { id: 1, name: 'Amira Hassan', email: 'amira@example.com', role: 'Team Lead' },
  { id: 3, name: 'Priya Raman', email: 'priya@example.com', role: 'Support Engineer' },
];
const employeeRepo = { list: async () => employees, findById: async (id) => employees.find((e) => e.id === id) };

// In-memory source that stores unified tasks, like the real adapters do after normalizing.
function memorySource(name, label, rows) {
  const store = new Map(rows.map((r) => [r.sourceId, r]));
  let seq = 1001;
  const prefix = name === 'crm' ? 'C' : 'T';
  return {
    name, label, store,
    fetchRecords: async () => [...store.values()],
    normalize: (r) => r,
    create: vi.fn(async (input) => {
      const sourceId = `${prefix}-${seq++}`;
      const task = { taskKey: `${name}-${sourceId}`, source: name, sourceId, status: 'open', urgency: null, context: null, url: 'u', ...input };
      store.set(sourceId, task);
      return task;
    }),
    update: vi.fn(async (id, input) => {
      if (!store.has(id)) throw new SourceError(name, `${label} task not found`, { status: 404 });
      const task = { ...store.get(id), ...input };
      store.set(id, task);
      return task;
    }),
    remove: vi.fn(async (id) => {
      if (!store.delete(id)) throw new SourceError(name, 'not found', { status: 404 });
      return null;
    }),
  };
}

let crm;
let helpdesk;
let app;
beforeEach(() => {
  crm = memorySource('crm', 'CRM', [
    { taskKey: 'crm-C-1', source: 'crm', sourceId: 'C-1', title: 'Amira task', employeeEmail: 'amira@example.com', deadline: '2026-10-26T09:00:00.000Z', status: 'open', urgency: null, context: 'Acme', url: 'u' },
  ]);
  helpdesk = memorySource('helpdesk', 'Helpdesk', [
    { taskKey: 'helpdesk-T-1', source: 'helpdesk', sourceId: 'T-1', title: 'Priya ticket', employeeEmail: 'priya@example.com', deadline: '2026-10-26T09:00:00.000Z', status: 'open', urgency: 2, context: null, url: 'u' },
  ]);
  const taskService = createTaskService({ sources: [crm, helpdesk], employeeRepo, cacheTtlMs: 60_000, now: () => NOW, logger: { warn() {}, error() {} } });
  app = createApp({ config, taskService, employeeRepo });
});

const cookie = (user) => `td_session=${jwt.sign({ sub: String(user.id), name: user.name, email: user.email, access: user.access }, config.jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash', expiresIn: '1h' })}`;
const admin = cookie({ id: 1, name: 'Amira Hassan', email: 'amira@example.com', access: 'manager' });
const priya = cookie({ id: 3, name: 'Priya Raman', email: 'priya@example.com', access: 'employee' });

describe('POST /api/tasks', () => {
  it('lets an admin create and assign a helpdesk ticket', async () => {
    const res = await request(app).post('/api/tasks').set('Cookie', admin)
      .send({ source: 'helpdesk', title: 'New ticket', employeeId: 3, deadline: '2026-10-25T20:00:00Z', urgency: 4 }).expect(201);
    expect(res.body.task).toMatchObject({ taskKey: 'helpdesk-T-1001', employeeId: 3, employeeName: 'Priya Raman', priorityLabel: 'critical' });
    expect(helpdesk.create).toHaveBeenCalledWith({ title: 'New ticket', deadline: '2026-10-25T20:00:00.000Z', urgency: 4, employeeEmail: 'priya@example.com' });
  });

  it('shows the new task in the list straight away (cache invalidated)', async () => {
    await request(app).get('/api/tasks').set('Cookie', admin);
    await request(app).post('/api/tasks').set('Cookie', admin)
      .send({ source: 'crm', title: 'Fresh', employeeId: 1, deadline: '2026-10-30T10:00:00Z', context: 'Contoso' }).expect(201);
    const list = await request(app).get('/api/tasks').set('Cookie', admin);
    expect(list.body.tasks.map((t) => t.title)).toContain('Fresh');
  });

  it.each([
    [{ source: 'jira', title: 'x', employeeId: 1, deadline: '2026-10-30T10:00:00Z' }, /source/],
    [{ source: 'crm', title: '', employeeId: 1, deadline: '2026-10-30T10:00:00Z' }, /Title/],
    [{ source: 'crm', title: 'x', deadline: '2026-10-30T10:00:00Z' }, /employee/],
    [{ source: 'crm', title: 'x', employeeId: 1, deadline: 'tomorrow-ish' }, /Deadline/],
    [{ source: 'helpdesk', title: 'x', employeeId: 1, deadline: '2026-10-30T10:00:00Z' }, /Urgency/],
    [{ source: 'crm', title: 'x', employeeId: 1, deadline: '2026-10-30T10:00:00Z', urgency: 2 }, /urgency/],
    [{ source: 'crm', title: 'x', employeeId: 99, deadline: '2026-10-30T10:00:00Z' }, /does not exist/],
  ])('rejects invalid input %#', async (body, message) => {
    const res = await request(app).post('/api/tasks').set('Cookie', admin).send(body).expect(400);
    expect(res.body.error).toMatch(message);
  });

  it('forbids employees from creating tasks', async () => {
    await request(app).post('/api/tasks').set('Cookie', priya)
      .send({ source: 'crm', title: 'x', employeeId: 3, deadline: '2026-10-30T10:00:00Z' }).expect(403);
  });
});

describe('PATCH /api/tasks/:taskKey', () => {
  it('lets an admin edit and reassign any task', async () => {
    const res = await request(app).patch('/api/tasks/crm-C-1').set('Cookie', admin)
      .send({ title: 'Renamed', employeeId: 3, context: 'Globex' }).expect(200);
    expect(res.body.task).toMatchObject({ title: 'Renamed', employeeId: 3, employeeName: 'Priya Raman', context: 'Globex' });
  });

  it('lets an employee change the status of their own task', async () => {
    const res = await request(app).patch('/api/tasks/helpdesk-T-1').set('Cookie', priya).send({ status: 'done' }).expect(200);
    expect(res.body.task.status).toBe('done');
    const back = await request(app).patch('/api/tasks/helpdesk-T-1').set('Cookie', priya).send({ status: 'in_progress' }).expect(200);
    expect(back.body.task.status).toBe('in_progress');
  });

  it("forbids employees from editing other fields or other people's tasks", async () => {
    await request(app).patch('/api/tasks/helpdesk-T-1').set('Cookie', priya).send({ title: 'Mine now' }).expect(403);
    await request(app).patch('/api/tasks/crm-C-1').set('Cookie', priya).send({ status: 'done' }).expect(403);
    expect(crm.update).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown tasks and 400 for bad fields', async () => {
    await request(app).patch('/api/tasks/crm-C-404').set('Cookie', admin).send({ status: 'done' }).expect(404);
    await request(app).patch('/api/tasks/nonsense').set('Cookie', admin).send({ status: 'done' }).expect(404);
    await request(app).patch('/api/tasks/crm-C-1').set('Cookie', admin).send({ status: 'finished' }).expect(400);
    await request(app).patch('/api/tasks/crm-C-1').set('Cookie', admin).send({ source: 'helpdesk' }).expect(400);
    await request(app).patch('/api/tasks/crm-C-1').set('Cookie', admin).send({}).expect(400);
  });

  it('reports a source outage as 502 without pretending it saved', async () => {
    crm.update.mockRejectedValueOnce(new SourceError('crm', 'CRM service timed out after 3000 ms'));
    const res = await request(app).patch('/api/tasks/crm-C-1').set('Cookie', admin).send({ status: 'done' }).expect(502);
    expect(res.body.error).toMatch(/not saved/);
  });
});

describe('DELETE /api/tasks/:taskKey', () => {
  it('lets an admin delete a task', async () => {
    await request(app).delete('/api/tasks/crm-C-1').set('Cookie', admin).expect(204);
    expect(crm.store.has('C-1')).toBe(false);
    await request(app).delete('/api/tasks/crm-C-1').set('Cookie', admin).expect(404);
  });

  it('forbids employees from deleting', async () => {
    await request(app).delete('/api/tasks/helpdesk-T-1').set('Cookie', priya).expect(403);
    expect(helpdesk.remove).not.toHaveBeenCalled();
  });
});

describe('payload mapping to the source systems', () => {
  it('maps unified fields to CRM fields', () => {
    expect(toCrmPayload({ title: 't', employeeEmail: 'e@x.io', deadline: 'd', status: 'in_progress', context: 'Acme' }))
      .toEqual({ subject: 't', owner_email: 'e@x.io', due_date: 'd', status: 'in_progress', account_name: 'Acme' });
  });
  it.each([['open', 'open'], ['in_progress', 'pending'], ['done', 'solved']])('maps status %s to helpdesk state %s', (status, state) => {
    expect(toHelpdeskPayload({ status })).toEqual({ state });
  });
  it('only sends fields that were provided', () => {
    expect(toHelpdeskPayload({ urgency: 3 })).toEqual({ urgency: 3 });
  });
});
