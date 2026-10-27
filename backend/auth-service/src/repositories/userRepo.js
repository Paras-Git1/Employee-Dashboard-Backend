export function createUserRepo(db) {
  return {
    findByEmail: (email) => db('users').where({ email }).first(),
    findByEmployeeId: (employeeId) => db('users').where({ employee_id: employeeId }).first(),
    recordLogin: (id) => db('users').where({ id }).update({ last_login_at: db.fn.now() }),
  };
}
