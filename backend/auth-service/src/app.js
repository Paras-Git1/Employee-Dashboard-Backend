import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.js';

export function createApp({ userRepo, config, healthCheck = async () => true }) {
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

  app.use('/auth', authRouter({ userRepo, config }));

  app.use((err, req, res, next) => {
    console.error('[auth] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
