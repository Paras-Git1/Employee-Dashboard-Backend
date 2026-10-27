import knex from 'knex';

const COLUMNS = ['ticket_id', 'title', 'assignee_email', 'sla_due_at', 'state', 'urgency'];
const toRecord = (row) => row && { ...row, sla_due_at: new Date(row.sla_due_at).toISOString() };

export function createTicketRepo(databaseUrl) {
  const db = knex({ client: 'pg', connection: databaseUrl, pool: { min: 0, max: 10 } });
  return {
    list: async () => (await db('helpdesk_tickets').select(COLUMNS).orderBy('sla_due_at')).map(toRecord),
    get: async (id) => toRecord(await db('helpdesk_tickets').select(COLUMNS).where({ ticket_id: id }).first()),
    create: async (fields) => toRecord((await db('helpdesk_tickets').insert(fields).returning(COLUMNS))[0]),
    update: async (id, fields) =>
      toRecord((await db('helpdesk_tickets').where({ ticket_id: id }).update({ ...fields, updated_at: db.fn.now() }).returning(COLUMNS))[0]),
    remove: async (id) => (await db('helpdesk_tickets').where({ ticket_id: id }).del()) > 0,
    ping: () => db.raw('select 1'),
  };
}
