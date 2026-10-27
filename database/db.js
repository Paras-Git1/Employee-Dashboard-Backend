// Manages a private PostgreSQL instance for this project only.
// Data lives in ./.pgdata, it listens on its own port, and it shares nothing
// with any other Postgres server on the machine.
//
//   node db.js init     create the data folder, role and databases (once)
//   node db.js start    start the server
//   node db.js stop     stop the server
//   node db.js status   show whether it is running
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(root, '.env')); } catch { /* defaults below */ }

const PGDATA = resolve(root, process.env.PGDATA_DIR || '.pgdata');
const PORT = process.env.PG_PORT || '5434';
const USER = process.env.PG_USER || 'taskdash';
const PASSWORD = process.env.PG_PASSWORD || 'taskdash';
const DATABASES = ['taskdash_auth', 'taskdash_api', 'taskdash_crm', 'taskdash_helpdesk'];
const LOG = join(PGDATA, 'server.log');

function findBinDir() {
  const candidates = [
    process.env.PG_BIN,
    '/usr/local/opt/postgresql@18/bin',
    '/opt/homebrew/opt/postgresql@18/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/opt/homebrew/opt/postgresql@16/bin',
  ].filter(Boolean);
  const found = candidates.find((dir) => existsSync(join(dir, 'pg_ctl')));
  if (!found) {
    console.error('Could not find PostgreSQL binaries. Install with "brew install postgresql@18" or set PG_BIN in .env.');
    process.exit(1);
  }
  return found;
}

const BIN = findBinDir();
const bin = (name) => join(BIN, name);

function isRunning() {
  if (!existsSync(join(PGDATA, 'PG_VERSION'))) return false;
  return spawnSync(bin('pg_ctl'), ['-D', PGDATA, 'status'], { stdio: 'ignore' }).status === 0;
}

function start() {
  if (isRunning()) return console.log(`Postgres already running on port ${PORT}`);
  // -k keeps the unix socket inside the data folder so nothing touches /tmp sockets of other servers.
  execFileSync(bin('pg_ctl'), ['-D', PGDATA, '-l', LOG, '-o', `-p ${PORT} -k ${PGDATA} -c listen_addresses=localhost`, '-w', 'start'], { stdio: 'inherit' });
  console.log(`Postgres running on localhost:${PORT} (data: ${PGDATA})`);
}

function stop() {
  if (!isRunning()) return console.log('Postgres is not running');
  execFileSync(bin('pg_ctl'), ['-D', PGDATA, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
}

function psql(sql, db = 'postgres') {
  return execFileSync(bin('psql'), ['-h', 'localhost', '-p', PORT, '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    env: { ...process.env, PGPASSWORD: PASSWORD },
    encoding: 'utf8',
  }).trim();
}

function init() {
  if (!existsSync(join(PGDATA, 'PG_VERSION'))) {
    const dir = mkdtempSync(join(tmpdir(), 'taskdash-pw-'));
    const pwFile = join(dir, 'pw');
    writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
    try {
      execFileSync(bin('initdb'), ['-D', PGDATA, '-U', USER, `--pwfile=${pwFile}`, '--auth=scram-sha-256', '-E', 'UTF8', '--locale=C'], { stdio: 'inherit' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    console.log(`Data folder already initialised at ${PGDATA}`);
  }
  start();
  for (const name of DATABASES) {
    const exists = psql(`SELECT 1 FROM pg_database WHERE datname = '${name}'`);
    if (exists) console.log(`Database ${name} already exists`);
    else { psql(`CREATE DATABASE ${name}`); console.log(`Created database ${name}`); }
  }
}

const command = process.argv[2];
const commands = {
  init,
  start,
  stop,
  status: () => console.log(isRunning() ? `running on localhost:${PORT}` : 'stopped'),
};
if (!commands[command]) {
  console.error('Usage: node db.js <init|start|stop|status>');
  process.exit(1);
}
commands[command]();
