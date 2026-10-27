// Convert source records into the unified task shape (section 5.4).
// Each normalizer returns null for a record it cannot trust; the caller logs and skips it.
export const UNIFIED_STATUSES = ['open', 'in_progress', 'done'];

const CRM_STATUS = { open: 'open', in_progress: 'in_progress', done: 'done' };
const HELPDESK_STATUS = { new: 'open', open: 'open', pending: 'in_progress', solved: 'done' };

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isEmail = (v) => isNonEmptyString(v) && /^[^\s@]+@[^\s@]+$/.test(v);
const toIsoDate = (v) => {
  if (!isNonEmptyString(v)) return null;
  const time = Date.parse(v);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

export function normalizeCrmTask(record, { publicUrl }) {
  if (!record || typeof record !== 'object') return null;
  const deadline = toIsoDate(record.due_date);
  const status = CRM_STATUS[record.status];
  if (!isNonEmptyString(record.id) || !isNonEmptyString(record.subject) || !isEmail(record.owner_email) || !deadline || !status) {
    return null;
  }
  return {
    taskKey: `crm-${record.id}`,
    source: 'crm',
    sourceId: record.id,
    title: record.subject.trim(),
    employeeEmail: record.owner_email.toLowerCase(),
    deadline,
    status,
    urgency: null,
    context: isNonEmptyString(record.account_name) ? record.account_name : null,
    url: `${publicUrl}/crm/tasks/${encodeURIComponent(record.id)}`,
  };
}

export function normalizeHelpdeskTicket(record, { publicUrl }) {
  if (!record || typeof record !== 'object') return null;
  const deadline = toIsoDate(record.sla_due_at);
  const status = HELPDESK_STATUS[record.state];
  const urgency = record.urgency;
  if (
    !isNonEmptyString(record.ticket_id) || !isNonEmptyString(record.title) || !isEmail(record.assignee_email) ||
    !deadline || !status || !Number.isInteger(urgency) || urgency < 1 || urgency > 4
  ) {
    return null;
  }
  return {
    taskKey: `helpdesk-${record.ticket_id}`,
    source: 'helpdesk',
    sourceId: record.ticket_id,
    title: record.title.trim(),
    employeeEmail: record.assignee_email.toLowerCase(),
    deadline,
    status,
    urgency,
    context: null,
    url: `${publicUrl}/helpdesk/tickets/${encodeURIComponent(record.ticket_id)}`,
  };
}

// Unified fields -> source payloads, for create and update. Only fields present in `input` are sent.
const HELPDESK_STATE_FOR = { open: 'open', in_progress: 'pending', done: 'solved' };

export function toCrmPayload(input) {
  const out = {};
  if (input.title !== undefined) out.subject = input.title;
  if (input.employeeEmail !== undefined) out.owner_email = input.employeeEmail;
  if (input.deadline !== undefined) out.due_date = input.deadline;
  if (input.status !== undefined) out.status = input.status;
  if (input.context !== undefined) out.account_name = input.context;
  return out;
}

export function toHelpdeskPayload(input) {
  const out = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.employeeEmail !== undefined) out.assignee_email = input.employeeEmail;
  if (input.deadline !== undefined) out.sla_due_at = input.deadline;
  if (input.status !== undefined) out.state = HELPDESK_STATE_FOR[input.status];
  if (input.urgency !== undefined) out.urgency = input.urgency;
  return out;
}
