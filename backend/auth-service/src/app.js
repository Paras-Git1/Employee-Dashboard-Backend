import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { authRouter } from './routes/auth.js';

export function createApp({ userRepo, config, healthCheck = async () => true }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
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

  // Per-IP cap on all auth calls, on top of the per-account failed-login limiter.
  if (config.rateLimitPerMinute) {
    app.use('/auth', rateLimit({ windowMs: 60_000, limit: config.rateLimitPerMinute, standardHeaders: 'draft-8', legacyHeaders: false }));
  }
  app.use('/auth', authRouter({ userRepo, config }));

  app.use((err, req, res, next) => {
    console.error('[auth] unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
