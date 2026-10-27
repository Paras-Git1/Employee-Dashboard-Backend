export function createEmployeeRepo(db) {
  return {
    list: () => db('employees').select('id', 'name', 'email', 'role').orderBy('name'),
    findById: (id) => db('employees').select('id', 'name', 'email', 'role').where({ id }).first(),
  };
}
