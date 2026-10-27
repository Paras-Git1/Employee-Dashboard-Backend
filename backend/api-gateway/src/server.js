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

createApp({ config, taskService, employeeRepo, events, healthCheck: () => db.raw('select 1') }).listen(config.port, () => {
  console.log(`API gateway listening on http://localhost:${config.port}`);
});
