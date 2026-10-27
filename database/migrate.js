// Applies migrations and seed data to each service's database.
//   auth database: users (login credentials, bcrypt hashes)
//   api database:       employees (filter list and email -> employee matching)
//   crm database:       crm_tasks (owned by the CRM service)
//   helpdesk database:  helpdesk_tickets (owned by the Helpdesk service)
import bcrypt from 'bcryptjs';
import knex from 'knex';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as createUsers from './migrations/auth/001_create_users.js';
import * as createEmployees from './migrations/api/001_create_employees.js';
import * as createCrmTasks from './migrations/crm/001_create_crm_tasks.js';
import * as createHelpdeskTickets from './migrations/helpdesk/001_create_helpdesk_tickets.js';

const root = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(root, '.env')); } catch { /* use defaults */ }

const readSeed = (name) => JSON.parse(readFileSync(join(root, 'seeds', name), 'utf8'));

// Shift a seed date so it keeps the same distance from now as it had from the file's reference_date.
const shiftFrom = (referenceDate) => {
  const offset = Date.now() - Date.parse(referenceDate);
  return (date) => new Date(Date.parse(date) + offset).toISOString();
};

// Knex migration source backed by ES module imports.
const sourceFor = (migrations) => ({
  getMigrations: async () => Object.keys(migrations),
  getMigrationName: (name) => name,
  getMigration: async (name) => migrations[name],
});

const targets = [
  {
    name: 'auth',
    url: process.env.AUTH_DATABASE_URL || 'postgres://taskdash:taskdash@localhost:5434/taskdash_auth',
    migrations: { '001_create_users': createUsers },
    async seed(db) {
      const { count } = await db('users').count('* as count').first();
      if (Number(count) > 0) return 0;
      const users = readSeed('auth-users.json');
      // In production nobody gets a password from the seed file: every account uses SEED_PASSWORD, which must be strong.
      const production = process.env.NODE_ENV === 'production';
      const seedPassword = process.env.SEED_PASSWORD || (production ? '' : 'Password123!');
      if (production && seedPassword.length < 12) throw new Error('Set SEED_PASSWORD (at least 12 characters) before seeding in production.');
      const defaultHash = await bcrypt.hash(seedPassword, 12);
      const rows = [];
      for (const { password, ...u } of users) {
        rows.push({ ...u, email: u.email.toLowerCase(), password_hash: password && !production ? await bcrypt.hash(password, 12) : defaultHash });
      }
      await db('users').insert(rows);
      return users.length;
    },
  },
  {
    name: 'api',
    url: process.env.API_DATABASE_URL || 'postgres://taskdash:taskdash@localhost:5434/taskdash_api',
    migrations: { '001_create_employees': createEmployees },
    async seed(db) {
      const { count } = await db('employees').count('* as count').first();
      if (Number(count) > 0) return 0;
      const employees = readSeed('api-employees.json');
      await db('employees').insert(employees.map((e) => ({ ...e, email: e.email.toLowerCase() })));
      return employees.length;
    },
  },
  {
    name: 'crm',
    url: process.env.CRM_DATABASE_URL || 'postgres://taskdash:taskdash@localhost:5434/taskdash_crm',
    migrations: { '001_create_crm_tasks': createCrmTasks },
    async seed(db) {
      const { count } = await db('crm_tasks').count('* as count').first();
      if (Number(count) > 0) return 0;
      const { reference_date: ref, tasks } = readSeed('crm-tasks.json');
      const shift = shiftFrom(ref);
      await db('crm_tasks').insert(tasks.map((t) => ({ ...t, owner_email: t.owner_email.toLowerCase(), due_date: shift(t.due_date) })));
      return tasks.length;
    },
  },
  {
    name: 'helpdesk',
    url: process.env.HELPDESK_DATABASE_URL || 'postgres://taskdash:taskdash@localhost:5434/taskdash_helpdesk',
    migrations: { '001_create_helpdesk_tickets': createHelpdeskTickets },
    async seed(db) {
      const { count } = await db('helpdesk_tickets').count('* as count').first();
      if (Number(count) > 0) return 0;
      const { reference_date: ref, tickets } = readSeed('helpdesk-tickets.json');
      const shift = shiftFrom(ref);
      await db('helpdesk_tickets').insert(tickets.map((t) => ({ ...t, assignee_email: t.assignee_email.toLowerCase(), sla_due_at: shift(t.sla_due_at) })));
      return tickets.length;
    },
  },
];

for (const target of targets) {
  const db = knex({ client: 'pg', connection: target.url });
  try {
    const [, applied] = await db.migrate.latest({ migrationSource: sourceFor(target.migrations), tableName: 'knex_migrations' });
    const seeded = await target.seed(db);
    console.log(`${target.name}: ${applied.length ? `applied ${applied.join(', ')}` : 'migrations up to date'}; ${seeded ? `seeded ${seeded} rows` : 'seed data already present'}`);
  } finally {
    await db.destroy();
  }
}
