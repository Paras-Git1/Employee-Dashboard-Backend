export async function up(knex) {
  // New tasks get ids like C-1001; seeded tasks keep their original ids.
  await knex.raw('CREATE SEQUENCE crm_task_seq START 1001');
  await knex.schema.createTable('crm_tasks', (table) => {
    table.string('id').primary().defaultTo(knex.raw("'C-' || nextval('crm_task_seq')"));
    table.string('subject', 200).notNullable();
    table.string('owner_email').notNullable().index();
    table.timestamp('due_date', { useTz: true }).notNullable();
    table.enu('status', ['open', 'in_progress', 'done']).notNullable().defaultTo('open');
    table.string('account_name', 120);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTable('crm_tasks');
  await knex.raw('DROP SEQUENCE crm_task_seq');
}
