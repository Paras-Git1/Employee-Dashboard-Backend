import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/knex.js';
import { createUserRepo } from './repositories/userRepo.js';

const config = loadConfig();
const db = createDb(config.databaseUrl);

createApp({ userRepo: createUserRepo(db), config, healthCheck: () => db.raw('select 1') }).listen(config.port, () => {
  console.log(`Auth service listening on http://localhost:${config.port}`);
});
