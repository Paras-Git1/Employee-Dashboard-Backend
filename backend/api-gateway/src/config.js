function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

export function loadConfig() {
  const crmBaseUrl = process.env.CRM_BASE_URL || 'http://localhost:4001';
  const helpdeskBaseUrl = process.env.HELPDESK_BASE_URL || 'http://localhost:4002';
  return {
    port: Number(process.env.PORT) || 3001,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    cookieName: process.env.SESSION_COOKIE || 'td_session',
    crmBaseUrl,
    helpdeskBaseUrl,
    crmPublicUrl: process.env.CRM_PUBLIC_URL || crmBaseUrl,
    helpdeskPublicUrl: process.env.HELPDESK_PUBLIC_URL || helpdeskBaseUrl,
    sourceTimeoutMs: Number(process.env.SOURCE_TIMEOUT_MS) || 3000,
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean),
    cacheTtlMs: (Number(process.env.CACHE_TTL_SECONDS) || 45) * 1000,
  };
}
