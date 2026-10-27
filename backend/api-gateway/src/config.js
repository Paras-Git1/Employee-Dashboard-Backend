function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

// TRUST_PROXY: number of proxies in front of the app (e.g. 2 for Vercel -> Caddy), so req.ip is the real client.
export function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

export function loadConfig() {
  const crmBaseUrl = process.env.CRM_BASE_URL || 'http://localhost:4001';
  const helpdeskBaseUrl = process.env.HELPDESK_BASE_URL || 'http://localhost:4002';
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
  return {
    port: Number(process.env.PORT) || 3001,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    cookieName: process.env.SESSION_COOKIE || 'td_session',
    crmBaseUrl,
    helpdeskBaseUrl,
    crmPublicUrl: process.env.CRM_PUBLIC_URL || crmBaseUrl,
    helpdeskPublicUrl: process.env.HELPDESK_PUBLIC_URL || helpdeskBaseUrl,
    serviceToken: process.env.SERVICE_TOKEN || undefined,
    dashboardUrl: process.env.DASHBOARD_URL || corsOrigins[0],
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
    sourceTimeoutMs: Number(process.env.SOURCE_TIMEOUT_MS) || 3000,
    corsOrigins,
    cacheTtlMs: (Number(process.env.CACHE_TTL_SECONDS) || 45) * 1000,
  };
}
