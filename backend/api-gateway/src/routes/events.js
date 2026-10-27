import { Router } from 'express';

// Who may see an event: managers see everything, employees only events about their own tasks
// (including a task that was just taken away from them).
export function canSee(user, event) {
  if (user.access === 'manager') return true;
  return event.task?.employeeId === user.id || event.previousEmployeeId === user.id;
}

// Server-Sent Events stream: GET /api/events pushes task changes as they happen.
export function eventsRouter({ events, heartbeatMs = 25_000 }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');

    const unsubscribe = events.subscribe((event) => {
      if (canSee(req.user, event)) res.write(`event: task\ndata: ${JSON.stringify(event)}\n\n`);
    });
    // Comment lines keep proxies and the browser from closing an idle connection.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
