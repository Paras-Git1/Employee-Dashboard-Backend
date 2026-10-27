import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { detailPage, notFoundPage } from './detailPage.js';
import { validateTicket } from './validate.js';

export const FAIL_MODES = ['off', 'error', 'slow', 'malformed'];


// serviceToken: when set, every route except /health requires "Authorization: Bearer <token>"
// (only the API gateway knows it). enableControl: false removes the fail-mode switch.
export function createApp({ repo, failMode = 'off', slowDelayMs = 5000, dashboardUrl = 'http://localhost:5173', serviceToken, enableControl = true }) {
  const state = { failMode: FAIL_MODES.includes(failMode) ? failMode : 'off' };
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  if (serviceToken) {
    const expected = Buffer.from(`Bearer ${serviceToken}`);
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      const given = Buffer.from(req.get('authorization') ?? '');
      if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
      res.status(401).json({ error: 'Unauthorized' });
    });
  }

  app.get('/health', async (req, res) => {
    try {
      await repo.ping();
      res.json({ status: 'ok', failMode: state.failMode });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  // Switch failure simulation at runtime: PUT /__control/fail-mode {"mode":"slow"}
  if (enableControl) app.put('/__control/fail-mode', (req, res) => {
    const mode = req.body?.mode;
    if (!FAIL_MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of ${FAIL_MODES.join(', ')}` });
    state.failMode = mode;
    res.json({ failMode: mode });
  });

  // Failure simulation applies to the JSON API (reads and writes), not to the HTML detail pages.
  const simulateFailure = async (req, res, next) => {
    if (state.failMode === 'error') return res.status(500).json({ error: 'Simulated Helpdesk failure' });
    if (state.failMode === 'slow') await new Promise((r) => setTimeout(r, slowDelayMs));
    next();
  };

  app.get('/helpdesk/tickets', simulateFailure, async (req, res) => {
    const tickets = await repo.list();
    if (state.failMode === 'malformed') {
      tickets.push({ ticket_id: 'T-999', title: '', assignee_email: 42, sla_due_at: null, state: 'unknown', urgency: 9 });
    }
    res.json(tickets);
  });

  app.post('/helpdesk/tickets', simulateFailure, async (req, res) => {
    const { fields, errors } = validateTicket(req.body, { partial: false });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    res.status(201).json(await repo.create(fields));
  });

  app.patch('/helpdesk/tickets/:id', simulateFailure, async (req, res) => {
    const { fields, errors } = validateTicket(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    const ticket = await repo.update(req.params.id, fields);
    if (!ticket) return res.status(404).json({ error: 'Helpdesk ticket not found' });
    res.json(ticket);
  });

  app.delete('/helpdesk/tickets/:id', simulateFailure, async (req, res) => {
    if (!(await repo.remove(req.params.id))) return res.status(404).json({ error: 'Helpdesk ticket not found' });
    res.status(204).end();
  });

  // Human-facing detail page: the target of task links on the dashboard.
  app.get('/helpdesk/tickets/:id', async (req, res) => {
    const ticket = await repo.get(req.params.id);
    if (!ticket) return res.status(404).type('html').send(notFoundPage(req.params.id, { dashboardUrl }));
    res.type('html').send(detailPage(ticket, { dashboardUrl }));
  });

  app.use((err, req, res, next) => {
    console.error('[helpdesk] unexpected error:', err);
    res.status(500).json({ error: 'Helpdesk internal error' });
  });

  return app;
}
