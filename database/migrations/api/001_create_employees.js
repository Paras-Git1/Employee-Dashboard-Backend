export async function up(knex) {
  await knex.schema.createTable('employees', (table) => {
    table.integer('id').primary();
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('role').notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTable('employees');
}
