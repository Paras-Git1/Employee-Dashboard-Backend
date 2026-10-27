import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { createLoginLimiter } from '../rateLimiter.js';

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (row) => ({ id: row.employee_id, name: row.name, email: row.email, access: row.access });

export function authRouter({ userRepo, config }) {
  const router = Router();
  const limiter = createLoginLimiter({ maxAttempts: config.loginMaxAttempts, windowMs: config.loginWindowMs });
  const cookieOptions = {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    // SameSite=None is only accepted by browsers on secure cookies.
    secure: config.isProduction || config.cookieSameSite === 'none',
    domain: config.cookieDomain,
    path: '/',
  };

  router.post('/login', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!EMAIL_PATTERN.test(email) || !password) {
      return res.status(400).json({ error: 'Enter a valid email and password.' });
    }

    const limitKey = `${req.ip}|${email}`;
    if (limiter.isBlocked(limitKey)) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    const user = await userRepo.findByEmail(email);
    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) {
      limiter.recordFailure(limitKey);
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    limiter.reset(limitKey);
    await userRepo.recordLogin(user.id);

    const token = jwt.sign(
      { sub: String(user.employee_id), email: user.email, name: user.name, access: user.access },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn, issuer: 'taskdash-auth', audience: 'taskdash' },
    );
    const { exp } = jwt.decode(token);
    res.cookie(config.cookieName, token, { ...cookieOptions, expires: new Date(exp * 1000) });
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(config.cookieName, cookieOptions);
    res.status(204).end();
  });

  router.get('/me', async (req, res) => {
    const token = req.cookies?.[config.cookieName];
    if (!token) return res.status(401).json({ error: 'Not signed in.' });
    try {
      const claims = jwt.verify(token, config.jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash' });
      const user = await userRepo.findByEmployeeId(Number(claims.sub));
      if (!user) return res.status(401).json({ error: 'Not signed in.' });
      res.json({ user: publicUser(user) });
    } catch {
      res.clearCookie(config.cookieName, cookieOptions);
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
  });

  return router;
}
