import { createApp } from './app.js';
import { createTaskRepo } from './db/taskRepo.js';

const port = Number(process.env.PORT) || 4001;
const failMode = process.env.FAIL_MODE || 'off';
const slowDelayMs = Number(process.env.SLOW_DELAY_MS) || 5000;
const databaseUrl = process.env.DATABASE_URL || 'postgres://taskdash:taskdash@localhost:5434/taskdash_crm';

const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';
const serviceToken = process.env.SERVICE_TOKEN || undefined;
// The fail-mode switch is for demos; off in production unless explicitly enabled.
const enableControl = process.env.NODE_ENV !== 'production' || process.env.ENABLE_FAIL_CONTROL === 'true';

createApp({ dashboardUrl, repo: createTaskRepo(databaseUrl), failMode, slowDelayMs, serviceToken, enableControl }).listen(port, () => {
  console.log(`CRM mock listening on http://localhost:${port} (FAIL_MODE=${failMode})`);
});
