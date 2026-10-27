import { describe, expect, it } from 'vitest';
import { normalizeCrmTask, normalizeHelpdeskTicket } from '../src/services/normalizers.js';

const crm = { id: 'C-1', subject: 'Call Contoso', owner_email: 'A@Example.com', due_date: '2026-10-26T09:00:00Z', status: 'in_progress', account_name: 'Contoso' };
const ticket = { ticket_id: 'T-1', title: 'VPN down', assignee_email: 'b@example.com', sla_due_at: '2026-10-26T09:00:00Z', state: 'pending', urgency: 4 };

describe('normalizeCrmTask', () => {
  it('maps CRM fields to the unified shape', () => {
    expect(normalizeCrmTask(crm, { publicUrl: 'http://crm' })).toEqual({
      taskKey: 'crm-C-1', source: 'crm', sourceId: 'C-1', title: 'Call Contoso', employeeEmail: 'a@example.com',
      deadline: '2026-10-26T09:00:00.000Z', status: 'in_progress', urgency: null, context: 'Contoso', url: 'http://crm/crm/tasks/C-1',
    });
  });
  it.each(['open', 'in_progress', 'done'])('keeps status %s unchanged', (status) => {
    expect(normalizeCrmTask({ ...crm, status }, { publicUrl: '' }).status).toBe(status);
  });
  it.each([
    ['missing id', { id: undefined }],
    ['empty subject', { subject: '  ' }],
    ['bad email', { owner_email: 'nobody' }],
    ['bad date', { due_date: 'not-a-date' }],
    ['unknown status', { status: 'weird' }],
  ])('rejects %s', (_, patch) => {
    expect(normalizeCrmTask({ ...crm, ...patch }, { publicUrl: '' })).toBeNull();
  });
});

describe('normalizeHelpdeskTicket', () => {
  it('maps Helpdesk fields to the unified shape', () => {
    expect(normalizeHelpdeskTicket(ticket, { publicUrl: 'http://hd' })).toEqual({
      taskKey: 'helpdesk-T-1', source: 'helpdesk', sourceId: 'T-1', title: 'VPN down', employeeEmail: 'b@example.com',
      deadline: '2026-10-26T09:00:00.000Z', status: 'in_progress', urgency: 4, context: null, url: 'http://hd/helpdesk/tickets/T-1',
    });
  });
  it.each([['new', 'open'], ['open', 'open'], ['pending', 'in_progress'], ['solved', 'done']])('maps state %s → %s', (state, status) => {
    expect(normalizeHelpdeskTicket({ ...ticket, state }, { publicUrl: '' }).status).toBe(status);
  });
  it.each([
    ['urgency 0', { urgency: 0 }],
    ['urgency 5', { urgency: 5 }],
    ['urgency as string', { urgency: '3' }],
    ['null deadline', { sla_due_at: null }],
    ['numeric email', { assignee_email: 42 }],
    ['unknown state', { state: 'unknown' }],
  ])('rejects %s', (_, patch) => {
    expect(normalizeHelpdeskTicket({ ...ticket, ...patch }, { publicUrl: '' })).toBeNull();
  });
});
