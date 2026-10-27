import { Router } from 'express';
import { verifySession } from '../middleware/requireAuth.js';
import { HttpError } from '../services/errors.js';

// Detail pages of the source systems (the target of task links), served through the gateway
// so the CRM and Helpdesk never need to be reachable from the internet.
// Same rules as the API: signed in, and employees only see their own tasks.
export function sourcePagesRouter({ taskService, jwtSecret, cookieName, dashboardUrl }) {
  const router = Router();

  const page = (source) => async (req, res) => {
    const user = verifySession(req.cookies?.[cookieName], jwtSecret);
    if (!user) return res.redirect(302, dashboardUrl);
    const taskKey = `${source}-${req.params.id}`;
    try {
      if (user.access !== 'manager') {
        const task = await taskService.getTask(taskKey);
        // 404 rather than 403, so other people's task ids are not confirmed to exist.
        if (task.employeeId !== user.id) throw new HttpError(404, 'Task not found.');
      }
      const { status, html } = await taskService.fetchSourcePage(taskKey);
      if (status !== 200 && status !== 404) throw new HttpError(502, 'The source system could not show this task right now.');
      res.status(status).type('html').send(html);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).type('text').send(err.message);
      throw err;
    }
  };

  router.get('/crm/tasks/:id', page('crm'));
  router.get('/helpdesk/tickets/:id', page('helpdesk'));
  return router;
}
