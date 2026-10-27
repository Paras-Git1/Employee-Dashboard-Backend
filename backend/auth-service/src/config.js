function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

export function loadConfig() {
  return {
    port: Number(process.env.PORT) || 4003,
    isProduction: process.env.NODE_ENV === 'production',
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    cookieName: process.env.SESSION_COOKIE || 'td_session',
    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS) || 5,
    loginWindowMs: (Number(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60_000,
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  };
}
