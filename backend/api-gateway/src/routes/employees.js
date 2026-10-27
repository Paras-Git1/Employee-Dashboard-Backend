import { Router } from 'express';

export function employeesRouter({ employeeRepo }) {
  const router = Router();

  // Managers get the full list for the filter; employees only see themselves.
  router.get('/', async (req, res) => {
    if (req.user.access === 'manager') return res.json(await employeeRepo.list());
    const me = await employeeRepo.findById(req.user.id);
    res.json(me ? [me] : []);
  });

  return router;
}
