import knex from 'knex';

const COLUMNS = ['id', 'subject', 'owner_email', 'due_date', 'status', 'account_name'];
const toRecord = (row) => row && { ...row, due_date: new Date(row.due_date).toISOString() };

export function createTaskRepo(databaseUrl) {
  const db = knex({ client: 'pg', connection: databaseUrl, pool: { min: 0, max: 10 } });
  return {
    list: async () => (await db('crm_tasks').select(COLUMNS).orderBy('due_date')).map(toRecord),
    get: async (id) => toRecord(await db('crm_tasks').select(COLUMNS).where({ id }).first()),
    create: async (fields) => toRecord((await db('crm_tasks').insert(fields).returning(COLUMNS))[0]),
    update: async (id, fields) =>
      toRecord((await db('crm_tasks').where({ id }).update({ ...fields, updated_at: db.fn.now() }).returning(COLUMNS))[0]),
    remove: async (id) => (await db('crm_tasks').where({ id }).del()) > 0,
    ping: () => db.raw('select 1'),
  };
}
