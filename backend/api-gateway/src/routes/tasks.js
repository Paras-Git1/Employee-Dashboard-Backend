import { Router } from 'express';
import { HttpError } from '../services/errors.js';
import { UNIFIED_STATUSES } from '../services/normalizers.js';
import { parseTaskKey } from '../services/taskService.js';
import { validateTaskInput } from './taskInput.js';

const SOURCES = ['crm', 'helpdesk'];

// Returns { employeeId, status, source } or { error } for an invalid query.
function parseQuery(query) {
  const result = { employeeId: undefined, status: undefined, source: undefined };
  if (query.employee !== undefined && query.employee !== '') {
    if (typeof query.employee !== 'string' || !/^\d+$/.test(query.employee)) {
      return { error: 'employee must be a numeric employee id' };
    }
    result.employeeId = Number(query.employee);
  }
  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string' || !UNIFIED_STATUSES.includes(query.status)) {
      return { error: `status must be one of ${UNIFIED_STATUSES.join(', ')}` };
    }
    result.status = query.status;
  }
  if (query.source !== undefined && query.source !== '') {
    if (typeof query.source !== 'string' || !SOURCES.includes(query.source)) {
      return { error: `source must be one of ${SOURCES.join(', ')}` };
    }
    result.source = query.source;
  }
  return result;
}

const isManager = (req) => req.user.access === 'manager';

function requireManager(req) {
  if (!isManager(req)) throw new HttpError(403, 'Only admins can do this.');
}

export function tasksRouter({ taskService }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const parsed = parseQuery(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    // Employees only ever see their own tasks; managers may see everyone's.
    let { employeeId } = parsed;
    if (!isManager(req)) {
      if (employeeId !== undefined && employeeId !== req.user.id) {
        return res.status(403).json({ error: 'You can only view your own tasks.' });
      }
      employeeId = req.user.id;
    }

    const { allFailed, ...body } = await taskService.getTasks({ employeeId, status: parsed.status, source: parsed.source });
    res.status(allFailed ? 502 : 200).json(body);
  });

  // Create and assign a task (admins only).
  router.post('/', async (req, res) => {
    requireManager(req);
    const { value, error } = validateTaskInput(req.body, { partial: false });
    if (error) return res.status(400).json({ error });
    res.status(201).json({ task: await taskService.createTask(value, req.user) });
  });

  // Update a task. Admins can change anything; employees can only change the status of their own tasks.
  router.patch('/:taskKey', async (req, res) => {
    const parsed = parseTaskKey(req.params.taskKey);
    if (!parsed) return res.status(404).json({ error: 'Task not found.' });
    const { value, error } = validateTaskInput(req.body, { partial: true, source: parsed.source });
    if (error) return res.status(400).json({ error });

    if (!isManager(req)) {
      const onlyStatus = Object.keys(value).every((k) => k === 'status');
      if (!onlyStatus) return res.status(403).json({ error: 'You can only change the status of your tasks.' });
      const existing = await taskService.getTask(req.params.taskKey);
      if (existing.employeeId !== req.user.id) return res.status(403).json({ error: 'You can only update your own tasks.' });
    }

    res.json({ task: await taskService.updateTask(req.params.taskKey, value, req.user) });
  });

  // Delete a task (admins only).
  router.delete('/:taskKey', async (req, res) => {
    requireManager(req);
    await taskService.deleteTask(req.params.taskKey, req.user);
    res.status(204).end();
  });

  return router;
}
