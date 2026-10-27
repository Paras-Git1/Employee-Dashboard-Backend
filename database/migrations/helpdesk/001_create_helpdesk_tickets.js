export async function up(knex) {
  // New tickets get ids like T-1001; seeded tickets keep their original ids.
  await knex.raw('CREATE SEQUENCE helpdesk_ticket_seq START 1001');
  await knex.schema.createTable('helpdesk_tickets', (table) => {
    table.string('ticket_id').primary().defaultTo(knex.raw("'T-' || nextval('helpdesk_ticket_seq')"));
    table.string('title', 200).notNullable();
    table.string('assignee_email').notNullable().index();
    table.timestamp('sla_due_at', { useTz: true }).notNullable();
    table.enu('state', ['new', 'open', 'pending', 'solved']).notNullable().defaultTo('new');
    table.integer('urgency').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('ALTER TABLE helpdesk_tickets ADD CONSTRAINT helpdesk_tickets_urgency_range CHECK (urgency BETWEEN 1 AND 4)');
}

export async function down(knex) {
  await knex.schema.dropTable('helpdesk_tickets');
  await knex.raw('DROP SEQUENCE helpdesk_ticket_seq');
}
