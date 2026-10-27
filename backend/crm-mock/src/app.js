import express from 'express';
import { detailPage, notFoundPage } from './detailPage.js';
import { validateTask } from './validate.js';

export const FAIL_MODES = ['off', 'error', 'slow', 'malformed'];


export function createApp({ repo, failMode = 'off', slowDelayMs = 5000, dashboardUrl = 'http://localhost:5173' }) {
  const state = { failMode: FAIL_MODES.includes(failMode) ? failMode : 'off' };
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok', failMode: state.failMode });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  // Switch failure simulation at runtime: PUT /__control/fail-mode {"mode":"error"}
  app.put('/__control/fail-mode', (req, res) => {
    const mode = req.body?.mode;
    if (!FAIL_MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of ${FAIL_MODES.join(', ')}` });
    state.failMode = mode;
    res.json({ failMode: mode });
  });

  // Failure simulation applies to the JSON API (reads and writes), not to the HTML detail pages.
  const simulateFailure = async (req, res, next) => {
    if (state.failMode === 'error') return res.status(500).json({ error: 'Simulated CRM failure' });
    if (state.failMode === 'slow') await new Promise((r) => setTimeout(r, slowDelayMs));
    next();
  };

  app.get('/crm/tasks', simulateFailure, async (req, res) => {
    const tasks = await repo.list();
    if (state.failMode === 'malformed') {
      tasks.push({ id: 'C-999', subject: null, owner_email: 'nobody', due_date: 'not-a-date', status: 'weird' });
    }
    res.json(tasks);
  });

  app.post('/crm/tasks', simulateFailure, async (req, res) => {
    const { fields, errors } = validateTask(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.status(201).json(await repo.create(fields));
  });

  app.patch('/crm/tasks/:id', simulateFailure, async (req, res) => {
    const { fields, errors } = validateTask(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const task = await repo.update(req.params.id, fields);
    if (!task) return res.status(404).json({ error: 'CRM task not found' });
    res.json(task);
  });

  app.delete('/crm/tasks/:id', simulateFailure, async (req, res) => {
    if (!(await repo.remove(req.params.id))) return res.status(404).json({ error: 'CRM task not found' });
    res.status(204).end();
  });

  // Human-facing detail page: the target of task links on the dashboard.
  app.get('/crm/tasks/:id', async (req, res) => {
    const task = await repo.get(req.params.id);
    if (!task) return res.status(404).type('html').send(notFoundPage(req.params.id, { dashboardUrl }));
    res.type('html').send(detailPage(task, { dashboardUrl }));
  });

  app.use((err, req, res, next) => {
    console.error('[crm] unexpected error:', err);
    res.status(500).json({ error: 'CRM internal error' });
  });

  return app;
}
