import { describe, expect, it, vi } from 'vitest';
import { canSee } from '../src/routes/events.js';
import { createEventBus } from '../src/services/events.js';
import { createTaskService } from '../src/services/taskService.js';

const employees = [
  { id: 1, name: 'Amira Hassan', email: 'amira@example.com', role: 'Team Lead' },
  { id: 3, name: 'Priya Raman', email: 'priya@example.com', role: 'Support Engineer' },
  { id: 5, name: 'Sofia Lindqvist', email: 'sofia@example.com', role: 'IT' },
];
const employeeRepo = { list: async () => employees, findById: async (id) => employees.find((e) => e.id === id) };

function source() {
  const store = new Map([['T-1', { taskKey: 'helpdesk-T-1', source: 'helpdesk', sourceId: 'T-1', title: 'Ticket', employeeEmail: 'priya@example.com', deadline: '2026-10-26T09:00:00.000Z', status: 'open', urgency: 2, context: null, url: 'u' }]]);
  return {
    name: 'helpdesk', label: 'Helpdesk',
    fetchRecords: async () => [...store.values()],
    normalize: (r) => r,
    create: async (input) => { const t = { taskKey: 'helpdesk-T-2', source: 'helpdesk', sourceId: 'T-2', status: 'open', url: 'u', ...input }; store.set('T-2', t); return t; },
    update: async (id, input) => { const t = { ...store.get(id), ...input }; store.set(id, t); return t; },
    remove: async (id) => store.delete(id),
  };
}

const priya = { id: 3, name: 'Priya Raman', access: 'employee' };
const amira = { id: 1, name: 'Amira Hassan', access: 'manager' };

describe('task change events', () => {
  it('publishes completion with the previous status and who did it', async () => {
    const events = createEventBus();
    const seen = vi.fn();
    events.subscribe(seen);
    const service = createTaskService({ sources: [source()], employeeRepo, events, logger: { warn() {}, error() {} } });
    await service.updateTask('helpdesk-T-1', { status: 'done' }, priya);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({
      type: 'updated', actorId: 3, actorName: 'Priya Raman', previousStatus: 'open', previousEmployeeId: null,
      task: expect.objectContaining({ status: 'done', employeeId: 3 }),
    }));
  });

  it('publishes create, reassignment and delete', async () => {
    const events = createEventBus();
    const seen = [];
    events.subscribe((e) => seen.push(e));
    const service = createTaskService({ sources: [source()], employeeRepo, events, logger: { warn() {}, error() {} } });
    await service.createTask({ source: 'helpdesk', title: 'New', employeeId: 3, deadline: '2026-10-27T09:00:00.000Z', urgency: 3 }, amira);
    await service.updateTask('helpdesk-T-1', { employeeId: 5 }, amira);
    await service.deleteTask('helpdesk-T-2', amira);
    expect(seen.map((e) => e.type)).toEqual(['created', 'updated', 'deleted']);
    expect(seen[1]).toMatchObject({ previousEmployeeId: 3, task: { employeeId: 5 } });
    expect(seen[2].task.title).toBe('New');
  });
});

describe('canSee', () => {
  const event = { task: { employeeId: 3 }, previousEmployeeId: null };
  it('shows every event to managers', () => expect(canSee(amira, event)).toBe(true));
  it('shows employees only events about their own tasks', () => {
    expect(canSee(priya, event)).toBe(true);
    expect(canSee({ id: 5, access: 'employee' }, event)).toBe(false);
  });
  it('tells an employee when a task is taken away from them', () => {
    expect(canSee(priya, { task: { employeeId: 5 }, previousEmployeeId: 3 })).toBe(true);
  });
});
