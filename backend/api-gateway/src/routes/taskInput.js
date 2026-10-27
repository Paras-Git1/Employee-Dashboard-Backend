// Validates task create / update bodies sent by the dashboard (unified field names).
import { UNIFIED_STATUSES } from '../services/normalizers.js';

const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const isoDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

// Returns { value } or { error }.
export function validateTaskInput(body, { partial, source }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Request body must be a JSON object.' };
  const value = {};
  const has = (k) => body[k] !== undefined;

  if (!partial) {
    if (!['crm', 'helpdesk'].includes(body.source)) return { error: 'source must be crm or helpdesk.' };
    value.source = body.source;
    source = body.source;
  } else if (has('source')) {
    return { error: 'A task cannot be moved to another system.' };
  }

  if (has('title') || !partial) {
    value.title = text(body.title, 200);
    if (!value.title) return { error: 'Title is required (max 200 characters).' };
  }
  if (has('employeeId') || !partial) {
    if (!Number.isInteger(body.employeeId) || body.employeeId < 1) return { error: 'Choose an employee to assign the task to.' };
    value.employeeId = body.employeeId;
  }
  if (has('deadline') || !partial) {
    value.deadline = isoDate(body.deadline);
    if (!value.deadline) return { error: 'Deadline must be a valid date.' };
  }
  if (has('status')) {
    if (!UNIFIED_STATUSES.includes(body.status)) return { error: `status must be one of ${UNIFIED_STATUSES.join(', ')}.` };
    value.status = body.status;
  }

  if (source === 'helpdesk') {
    if (has('urgency') || !partial) {
      if (!Number.isInteger(body.urgency) || body.urgency < 1 || body.urgency > 4) return { error: 'Urgency must be from 1 to 4.' };
      value.urgency = body.urgency;
    }
    if (has('context')) return { error: 'Helpdesk tickets do not have an account.' };
  } else {
    if (has('urgency')) return { error: 'CRM tasks do not have an urgency.' };
    if (has('context')) {
      if (body.context === null || body.context === '') value.context = null;
      else if (!(value.context = text(body.context, 120))) return { error: 'Account must be at most 120 characters.' };
    }
  }

  if (partial && Object.keys(value).length === 0) return { error: 'Nothing to update.' };
  return { value };
}
