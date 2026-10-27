import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/knex.js';
import { createEmployeeRepo } from './repositories/employeeRepo.js';
import { createEventBus } from './services/events.js';
import { createSources } from './services/sources.js';
import { createTaskService } from './services/taskService.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);
const employeeRepo = createEmployeeRepo(db);
const events = createEventBus();
const taskService = createTaskService({ sources: createSources(config), employeeRepo, events, cacheTtlMs: config.cacheTtlMs });

const server = createApp({ config, taskService, employeeRepo, events, healthCheck: () => db.raw('select 1') }).listen(config.port, () => {
  console.log(`API gateway listening on http://localhost:${config.port}`);
});

// On deploy (SIGTERM) finish in-flight requests, then close live event streams and the database pool.
function shutdown() {
  server.close(() => db.destroy().finally(() => process.exit(0)));
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
  setTimeout(() => process.exit(1), 9000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
