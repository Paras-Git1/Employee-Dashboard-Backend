// Source adapters. Adding a third system means adding one entry here
// (a client plus normalizers); the task service and UI stay unchanged.
import { createCrmClient } from './clients/crmClient.js';
import { createHelpdeskClient } from './clients/helpdeskClient.js';
import { normalizeCrmTask, normalizeHelpdeskTicket, toCrmPayload, toHelpdeskPayload } from './normalizers.js';

export function createSources(config, { fetchImpl } = {}) {
  const crm = createCrmClient({ baseUrl: config.crmBaseUrl, timeoutMs: config.sourceTimeoutMs, serviceToken: config.serviceToken, fetchImpl });
  const helpdesk = createHelpdeskClient({ baseUrl: config.helpdeskBaseUrl, timeoutMs: config.sourceTimeoutMs, serviceToken: config.serviceToken, fetchImpl });
  const crmNormalize = (record) => normalizeCrmTask(record, { publicUrl: config.crmPublicUrl });
  const helpdeskNormalize = (record) => normalizeHelpdeskTicket(record, { publicUrl: config.helpdeskPublicUrl });
  return [
    {
      name: 'crm',
      label: 'CRM',
      fetchRecords: () => crm.fetchTasks(),
      normalize: crmNormalize,
      create: async (input) => crmNormalize(await crm.createTask(toCrmPayload(input))),
      update: async (id, input) => crmNormalize(await crm.updateTask(id, toCrmPayload(input))),
      remove: (id) => crm.deleteTask(id),
      fetchPage: (id) => crm.fetchPage(id),
    },
    {
      name: 'helpdesk',
      label: 'Helpdesk',
      fetchRecords: () => helpdesk.fetchTickets(),
      normalize: helpdeskNormalize,
      create: async (input) => helpdeskNormalize(await helpdesk.createTicket(toHelpdeskPayload(input))),
      update: async (id, input) => helpdeskNormalize(await helpdesk.updateTicket(id, toHelpdeskPayload(input))),
      remove: (id) => helpdesk.deleteTicket(id),
      fetchPage: (id) => helpdesk.fetchPage(id),
    },
  ];
}
