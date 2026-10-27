import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { SourceError } from '../src/services/clients/httpClient.js';
import { createTaskService } from '../src/services/taskService.js';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const at = (hours) => new Date(NOW + hours * 3600_000).toISOString();
const config = { jwtSecret: 'test-secret', cookieName: 'td_session', corsOrigins: ['http://localhost:5173'] };

const employees = [
  { id: 1, name: 'Amira Hassan', email: 'amira@example.com', role: 'Team Lead' },
  { id: 3, name: 'Priya Raman', email: 'priya@example.com', role: 'Support Engineer' },
];
const employeeRepo = { list: async () => employees, findById: async (id) => employees.find((e) => e.id === id) };

const crmTasks = [
  { taskKey: 'crm-C-1', source: 'crm', sourceId: 'C-1', title: 'Overdue CRM', employeeEmail: 'amira@example.com', deadline: at(-2), status: 'open', urgency: null, context: 'Contoso', url: 'u' },
  { taskKey: 'crm-C-2', source: 'crm', sourceId: 'C-2', title: 'Done CRM', employeeEmail: 'priya@example.com', deadline: at(-50), status: 'done', urgency: null, context: null, url: 'u' },
];
const helpdeskTasks = [
  { taskKey: 'helpdesk-T-1', source: 'helpdesk', sourceId: 'T-1', title: 'Urgent ticket', employeeEmail: 'priya@example.com', deadline: at(12), status: 'open', urgency: 4, context: null, url: 'u' },
  { taskKey: 'helpdesk-T-2', source: 'helpdesk', sourceId: 'T-2', title: 'Pending ticket', employeeEmail: 'amira@example.com', deadline: at(100), status: 'in_progress', urgency: 2, context: null, url: 'u' },
];

function source(name, label, behaviour) {
  return { name, label, fetchRecords: behaviour, normalize: (r) => r };
}

const silentLogger = { warn: vi.fn(), error: vi.fn() };
let crmFetch;
let helpdeskFetch;

function makeApp() {
  const taskService = createTaskService({
    sources: [source('crm', 'CRM', () => crmFetch()), source('helpdesk', 'Helpdesk', () => helpdeskFetch())],
    employeeRepo,
    now: () => NOW,
    logger: silentLogger,
  });
  return createApp({ config, taskService, employeeRepo });
}

const cookieFor = (user) =>
  `td_session=${jwt.sign({ sub: String(user.id), email: user.email, name: user.name, access: user.access }, config.jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash', expiresIn: '1h' })}`;
const manager = { id: 1, email: 'amira@example.com', name: 'Amira Hassan', access: 'manager' };
const employee = { id: 3, email: 'priya@example.com', name: 'Priya Raman', access: 'employee' };

beforeEach(() => {
  crmFetch = async () => crmTasks;
  helpdeskFetch = async () => helpdeskTasks;
});

describe('authentication', () => {
  it('rejects requests without a session', async () => {
    await request(makeApp()).get('/api/tasks').expect(401);
    await request(makeApp()).get('/api/employees').expect(401);
  });
  it('rejects a token signed with another secret', async () => {
    const bad = `td_session=${jwt.sign({ sub: '1' }, 'other', { issuer: 'taskdash-auth', audience: 'taskdash' })}`;
    await request(makeApp()).get('/api/tasks').set('Cookie', bad).expect(401);
  });
  it('allows the configured frontend origin with credentials', async () => {
    const res = await request(makeApp()).get('/api/tasks').set('Origin', 'http://localhost:5173').set('Cookie', cookieFor(manager));
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('GET /api/tasks', () => {
  it('returns all tasks from both sources, prioritized, with done last', async () => {
    const res = await request(makeApp()).get('/api/tasks').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.tasks.map((t) => t.taskKey)).toEqual(['helpdesk-T-1', 'crm-C-1', 'helpdesk-T-2', 'crm-C-2']);
    expect(res.body.tasks[0]).toMatchObject({ priorityScore: 80, priorityLabel: 'critical', employeeId: 3, employeeName: 'Priya Raman' });
    expect(res.body.tasks[1]).toMatchObject({ priorityScore: 65, priorityLabel: 'high' });
  });

  it('filters by employee', async () => {
    const res = await request(makeApp()).get('/api/tasks?employee=1').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.tasks.every((t) => t.employeeId === 1)).toBe(true);
    expect(res.body.tasks).toHaveLength(2);
  });

  it('filters by status', async () => {
    const res = await request(makeApp()).get('/api/tasks?status=done').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.tasks.map((t) => t.taskKey)).toEqual(['crm-C-2']);
  });

  it('combines both filters', async () => {
    const res = await request(makeApp()).get('/api/tasks?employee=3&status=open').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.tasks.map((t) => t.taskKey)).toEqual(['helpdesk-T-1']);
  });

  it.each([['status=closed'], ['employee=abc'], ['employee=1.5'], ['employee=-1']])('returns 400 for %s', async (query) => {
    const res = await request(makeApp()).get(`/api/tasks?${query}`).set('Cookie', cookieFor(manager)).expect(400);
    expect(res.body.error).toBeTruthy();
  });

  it('limits employees to their own tasks', async () => {
    const res = await request(makeApp()).get('/api/tasks').set('Cookie', cookieFor(employee)).expect(200);
    expect(res.body.tasks.every((t) => t.employeeId === 3)).toBe(true);
    await request(makeApp()).get('/api/tasks?employee=1').set('Cookie', cookieFor(employee)).expect(403);
  });

  it('returns partial data with an error when one source fails', async () => {
    crmFetch = async () => { throw new SourceError('crm', 'CRM service timed out after 3000 ms'); };
    const res = await request(makeApp()).get('/api/tasks').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.errors).toEqual([{ source: 'crm', message: 'CRM service timed out after 3000 ms' }]);
    expect(res.body.tasks.every((t) => t.source === 'helpdesk')).toBe(true);
    expect(res.body.sources).toEqual([
      { source: 'crm', label: 'CRM', ok: false, openCount: 0 },
      { source: 'helpdesk', label: 'Helpdesk', ok: true, openCount: 2 },
    ]);
  });

  it('returns 502 with two errors when both sources fail', async () => {
    crmFetch = async () => { throw new SourceError('crm', 'CRM service returned an error (HTTP 500)'); };
    helpdeskFetch = async () => { throw new Error('socket hang up with internal details'); };
    const res = await request(makeApp()).get('/api/tasks').set('Cookie', cookieFor(manager)).expect(502);
    expect(res.body.tasks).toEqual([]);
    expect(res.body.errors).toEqual([
      { source: 'crm', message: 'CRM service returned an error (HTTP 500)' },
      { source: 'helpdesk', message: 'Helpdesk service failed' },
    ]);
  });

  it('skips malformed records and keeps valid ones', async () => {
    const taskService = createTaskService({
      sources: [{ name: 'crm', label: 'CRM', fetchRecords: async () => [crmTasks[0], { junk: true }], normalize: (r) => (r.taskKey ? r : null) }],
      employeeRepo, now: () => NOW, logger: silentLogger,
    });
    const res = await request(createApp({ config, taskService, employeeRepo })).get('/api/tasks').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(silentLogger.warn).toHaveBeenCalled();
  });
});

describe('GET /api/employees', () => {
  it('returns the full list to managers', async () => {
    const res = await request(makeApp()).get('/api/employees').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body).toEqual(employees);
  });
  it('returns only the employee themselves to employees', async () => {
    const res = await request(makeApp()).get('/api/employees').set('Cookie', cookieFor(employee)).expect(200);
    expect(res.body).toEqual([employees[1]]);
  });
});

describe('caching', () => {
  it('reuses successful source responses within the TTL', async () => {
    const fetchSpy = vi.fn(async () => crmTasks);
    const taskService = createTaskService({
      sources: [{ name: 'crm', label: 'CRM', fetchRecords: fetchSpy, normalize: (r) => r }],
      employeeRepo, cacheTtlMs: 45_000, now: () => NOW, logger: silentLogger,
    });
    await taskService.getTasks();
    await taskService.getTasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('source filter', () => {
  it('returns only the chosen system, with open counts for both in sources', async () => {
    const res = await request(makeApp()).get('/api/tasks?source=crm').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.body.tasks.every((t) => t.source === 'crm')).toBe(true);
    expect(res.body.sources).toEqual([
      { source: 'crm', label: 'CRM', ok: true, openCount: 1 },
      { source: 'helpdesk', label: 'Helpdesk', ok: true, openCount: 2 },
    ]);
  });
  it('rejects an unknown source', async () => {
    await request(makeApp()).get('/api/tasks?source=jira').set('Cookie', cookieFor(manager)).expect(400);
  });
});
