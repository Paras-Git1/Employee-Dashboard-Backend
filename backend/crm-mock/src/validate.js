// Validates a create (all required fields) or a partial update for a CRM task.
export const STATUSES = ['open', 'in_progress', 'done'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTask(body, { partial }) {
  const fields = {};
  const errors = [];
  const has = (k) => body?.[k] !== undefined;

  if (has('subject') || !partial) {
    const v = typeof body?.subject === 'string' ? body.subject.trim() : '';
    if (!v || v.length > 200) errors.push('subject is required (max 200 characters)');
    else fields.subject = v;
  }
  if (has('owner_email') || !partial) {
    const v = typeof body?.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
    if (!EMAIL.test(v)) errors.push('owner_email must be a valid email');
    else fields.owner_email = v;
  }
  if (has('due_date') || !partial) {
    const t = typeof body?.due_date === 'string' ? Date.parse(body.due_date) : NaN;
    if (Number.isNaN(t)) errors.push('due_date must be an ISO date');
    else fields.due_date = new Date(t).toISOString();
  }
  if (has('status')) {
    if (!STATUSES.includes(body.status)) errors.push(`status must be one of ${STATUSES.join(', ')}`);
    else fields.status = body.status;
  }
  if (has('account_name')) {
    const v = body.account_name === null ? null : typeof body.account_name === 'string' ? body.account_name.trim() : undefined;
    if (v === undefined || (v && v.length > 120)) errors.push('account_name must be text (max 120 characters)');
    else fields.account_name = v || null;
  }
  if (partial && Object.keys(fields).length === 0 && errors.length === 0) errors.push('nothing to update');
  return { fields, errors };
}
