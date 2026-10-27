export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.integer('employee_id').notNullable().unique();
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enu('access', ['employee', 'manager']).notNullable().defaultTo('employee');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_login_at', { useTz: true });
  });
}

export async function down(knex) {
  await knex.schema.dropTable('users');
}
