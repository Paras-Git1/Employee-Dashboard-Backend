import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createLoginLimiter } from '../src/rateLimiter.js';

const config = {
  isProduction: false, jwtSecret: 'test-secret', jwtExpiresIn: '1h', cookieName: 'td_session',
  loginMaxAttempts: 3, loginWindowMs: 60_000, corsOrigins: ['http://localhost:5173'], cookieSameSite: 'lax',
};

let users;
const userRepo = {
  findByEmail: async (email) => users.find((u) => u.email === email),
  findByEmployeeId: async (id) => users.find((u) => u.employee_id === id),
  recordLogin: async () => {},
};

beforeAll(async () => {
  users = [{ id: 1, employee_id: 1, name: 'Amira Hassan', email: 'amira@example.com', access: 'manager', password_hash: await bcrypt.hash('Password123!', 4) }];
});

const app = () => createApp({ userRepo, config });

describe('POST /auth/login', () => {
  it('sets an httpOnly session cookie and returns the user without the hash', async () => {
    const res = await request(app()).post('/auth/login').send({ email: 'Amira@Example.com ', password: 'Password123!' }).expect(200);
    expect(res.body.user).toEqual({ id: 1, name: 'Amira Hassan', email: 'amira@example.com', access: 'manager' });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^td_session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = cookie.split(';')[0].split('=')[1];
    expect(jwt.verify(token, config.jwtSecret, { issuer: 'taskdash-auth', audience: 'taskdash' })).toMatchObject({ sub: '1', access: 'manager' });
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const a = await request(app()).post('/auth/login').send({ email: 'amira@example.com', password: 'nope' }).expect(401);
    const b = await request(app()).post('/auth/login').send({ email: 'ghost@example.com', password: 'nope' }).expect(401);
    expect(a.body.error).toBe(b.body.error);
  });

  it('validates input', async () => {
    await request(app()).post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    await request(app()).post('/auth/login').send({}).expect(400);
  });

  it('locks out after repeated failures', async () => {
    const instance = app();
    for (let i = 0; i < 3; i++) await request(instance).post('/auth/login').send({ email: 'amira@example.com', password: 'bad' }).expect(401);
    await request(instance).post('/auth/login').send({ email: 'amira@example.com', password: 'Password123!' }).expect(429);
  });
});

describe('session endpoints', () => {
  it('GET /auth/me returns the signed-in user', async () => {
    const instance = app();
    const login = await request(instance).post('/auth/login').send({ email: 'amira@example.com', password: 'Password123!' });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const res = await request(instance).get('/auth/me').set('Cookie', cookie).expect(200);
    expect(res.body.user.email).toBe('amira@example.com');
  });

  it('GET /auth/me is 401 without or with a forged cookie', async () => {
    await request(app()).get('/auth/me').expect(401);
    const forged = jwt.sign({ sub: '1' }, 'wrong', { issuer: 'taskdash-auth', audience: 'taskdash' });
    await request(app()).get('/auth/me').set('Cookie', `td_session=${forged}`).expect(401);
  });

  it('POST /auth/logout clears the cookie', async () => {
    const res = await request(app()).post('/auth/logout').expect(204);
    expect(res.headers['set-cookie'][0]).toMatch(/td_session=;/);
  });
});

describe('createLoginLimiter', () => {
  it('forgets failures after the window', () => {
    let t = 0;
    const limiter = createLoginLimiter({ maxAttempts: 2, windowMs: 1000, now: () => t });
    limiter.recordFailure('k'); limiter.recordFailure('k');
    expect(limiter.isBlocked('k')).toBe(true);
    t = 1001;
    expect(limiter.isBlocked('k')).toBe(false);
  });
});
