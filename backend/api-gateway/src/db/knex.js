import knex from 'knex';

export function createDb(databaseUrl) {
  return knex({ client: 'pg', connection: databaseUrl, pool: { min: 0, max: 10 } });
}
