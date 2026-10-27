import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/knex.js';
import { createUserRepo } from './repositories/userRepo.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);

const server = createApp({ userRepo: createUserRepo(db), config, healthCheck: () => db.raw('select 1') }).listen(config.port, () => {
  console.log(`Auth service listening on http://localhost:${config.port}`);
});

// On deploy (SIGTERM) finish in-flight requests, then close the database pool.
function shutdown() {
  server.close(() => db.destroy().finally(() => process.exit(0)));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 9000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
