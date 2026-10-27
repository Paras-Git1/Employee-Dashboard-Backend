// Creates a .env next to every .env.example that does not have one yet,
// and fills JWT_SECRET with one random value shared by auth-service and api-gateway
// (the API must verify tokens the auth service signs). Existing .env files are never overwritten.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packages = [
  'database',
  'backend/crm-mock',
  'backend/helpdesk-mock',
  'backend/auth-service',
  'backend/api-gateway',
];

const readSecret = (dir) => {
  const file = join(dir, '.env');
  if (!existsSync(file)) return null;
  const match = readFileSync(file, 'utf8').match(/^JWT_SECRET=(.+)$/m);
  return match && match[1] !== 'change-me' ? match[1].trim() : null;
};

const secret = readSecret('backend/auth-service') || readSecret('backend/api-gateway') || randomBytes(48).toString('base64url');

for (const dir of packages) {
  const example = join(dir, '.env.example');
  const target = join(dir, '.env');
  if (!existsSync(example)) continue;
  if (existsSync(target)) {
    console.log(`kept     ${target}`);
    continue;
  }
  const content = readFileSync(example, 'utf8').replace(/^JWT_SECRET=change-me$/m, `JWT_SECRET=${secret}`);
  writeFileSync(target, content, { mode: 0o600 });
  console.log(`created  ${target}`);
}
