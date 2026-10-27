import { fetchJson, requestJson } from './httpClient.js';

export function createHelpdeskClient({ baseUrl, timeoutMs, fetchImpl }) {
  const base = { source: 'helpdesk', label: 'Helpdesk', timeoutMs, fetchImpl };
  const ticketUrl = (id) => `${baseUrl}/helpdesk/tickets/${encodeURIComponent(id)}`;
  return {
    fetchTickets: () => fetchJson({ ...base, url: `${baseUrl}/helpdesk/tickets` }),
    createTicket: (body) => requestJson({ ...base, method: 'POST', url: `${baseUrl}/helpdesk/tickets`, body }),
    updateTicket: (id, body) => requestJson({ ...base, method: 'PATCH', url: ticketUrl(id), body }),
    deleteTicket: (id) => requestJson({ ...base, method: 'DELETE', url: ticketUrl(id) }),
  };
}
