import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { requireAuth } from './middleware/requireAuth.js';
import { employeesRouter } from './routes/employees.js';
import { eventsRouter } from './routes/events.js';
import { tasksRouter } from './routes/tasks.js';
import { SourceError } from './services/clients/httpClient.js';
import { HttpError } from './services/errors.js';

export function createApp({ config, taskService, employeeRepo, events, healthCheck = async () => true }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/health', async (req, res) => {
    try {
      await healthCheck();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'database unavailable' });
    }
  });

  const auth = requireAuth({ jwtSecret: config.jwtSecret, cookieName: config.cookieName });
  app.use('/api/tasks', auth, tasksRouter({ taskService }));
  app.use('/api/employees', auth, employeesRouter({ employeeRepo }));
  if (events) app.use('/api/events', auth, eventsRouter({ events }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof SourceError) {
      // Pass through "not found" and validation answers from the source; anything else means it is unavailable.
      if (err.status === 404) return res.status(404).json({ error: 'Task not found.' });
      if (err.status === 400) return res.status(400).json({ error: err.message });
      console.error(`[${err.source}] write failed: ${err.message}`, err.cause ?? '');
      return res.status(502).json({ error: `${err.message}. Your change was not saved, please try again.` });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' });
    console.error('[api] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
