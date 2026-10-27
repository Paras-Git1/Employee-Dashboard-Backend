import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createTaskService } from '../src/services/taskService.js';

const config = { jwtSecret: 'test-secret', cookieName: 'td_session', corsOrigins: ['http://localhost:5173'], dashboardUrl: 'http://localhost:5173' };
const employees = [
  { id: 1, name: 'Amira Hassan', email: 'amira@example.com', role: 'Team Lead' },
  { id: 3, name: 'Priya Raman', email: 'priya@example.com', role: 'Support Engineer' },
];
const employeeRepo = { list: async () => employees, findById: async (id) => employees.find((e) => e.id === id) };
const tasks = [
  { taskKey: 'crm-C-1', source: 'crm', sourceId: 'C-1', title: 'Amira task', employeeEmail: 'amira@example.com', deadline: '2026-10-30T00:00:00Z', status: 'open', urgency: null, url: 'u' },
  { taskKey: 'crm-C-2', source: 'crm', sourceId: 'C-2', title: 'Priya task', employeeEmail: 'priya@example.com', deadline: '2026-10-30T00:00:00Z', status: 'open', urgency: null, url: 'u' },
];
const pages = [];
const sources = [{
  name: 'crm',
  label: 'CRM',
  fetchRecords: async () => tasks,
  normalize: (r) => r,
  fetchPage: async (id) => { pages.push(id); return id === 'C-404' ? { status: 404, html: '<p>missing</p>' } : { status: 200, html: `<h1>${id}</h1>` }; },
}];
const app = () => createApp({ config, employeeRepo, taskService: createTaskService({ sources, employeeRepo }) });
const cookieFor = (user) =>
  `td_session=${jwt.sign({ sub: String(user.id), email: user.email, name: user.name, access: user.access }, config.jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash', expiresIn: '1h' })}`;
const manager = { id: 1, email: 'amira@example.com', name: 'Amira Hassan', access: 'manager' };
const employee = { id: 3, email: 'priya@example.com', name: 'Priya Raman', access: 'employee' };

describe('source detail pages through the gateway', () => {
  it('sends visitors without a session back to the dashboard', async () => {
    const res = await request(app()).get('/crm/tasks/C-1').expect(302);
    expect(res.headers.location).toBe('http://localhost:5173');
  });

  it('shows any task to a manager', async () => {
    const res = await request(app()).get('/crm/tasks/C-2').set('Cookie', cookieFor(manager)).expect(200);
    expect(res.text).toContain('C-2');
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('shows employees their own task and hides other people\'s', async () => {
    await request(app()).get('/crm/tasks/C-2').set('Cookie', cookieFor(employee)).expect(200);
    pages.length = 0;
    await request(app()).get('/crm/tasks/C-1').set('Cookie', cookieFor(employee)).expect(404);
    expect(pages).toEqual([]);
  });

  it('passes through a not-found page from the source', async () => {
    await request(app()).get('/crm/tasks/C-404').set('Cookie', cookieFor(manager)).expect(404);
  });
});
