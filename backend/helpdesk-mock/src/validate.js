// Validates a create (all required fields) or a partial update for a Helpdesk ticket.
export const STATES = ['new', 'open', 'pending', 'solved'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTicket(body, { partial }) {
  const fields = {};
  const errors = [];
  const has = (k) => body?.[k] !== undefined;

  if (has('title') || !partial) {
    const v = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!v || v.length > 200) errors.push('title is required (max 200 characters)');
    else fields.title = v;
  }
  if (has('assignee_email') || !partial) {
    const v = typeof body?.assignee_email === 'string' ? body.assignee_email.trim().toLowerCase() : '';
    if (!EMAIL.test(v)) errors.push('assignee_email must be a valid email');
    else fields.assignee_email = v;
  }
  if (has('sla_due_at') || !partial) {
    const t = typeof body?.sla_due_at === 'string' ? Date.parse(body.sla_due_at) : NaN;
    if (Number.isNaN(t)) errors.push('sla_due_at must be an ISO date');
    else fields.sla_due_at = new Date(t).toISOString();
  }
  if (has('urgency') || !partial) {
    if (!Number.isInteger(body?.urgency) || body.urgency < 1 || body.urgency > 4) errors.push('urgency must be an integer from 1 to 4');
    else fields.urgency = body.urgency;
  }
  if (has('state')) {
    if (!STATES.includes(body.state)) errors.push(`state must be one of ${STATES.join(', ')}`);
    else fields.state = body.state;
  }
  if (partial && Object.keys(fields).length === 0 && errors.length === 0) errors.push('nothing to update');
  return { fields, errors };
}
