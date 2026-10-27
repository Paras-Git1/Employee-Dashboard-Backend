import { fetchJson, requestJson } from './httpClient.js';

export function createCrmClient({ baseUrl, timeoutMs, fetchImpl }) {
  const base = { source: 'crm', label: 'CRM', timeoutMs, fetchImpl };
  const taskUrl = (id) => `${baseUrl}/crm/tasks/${encodeURIComponent(id)}`;
  return {
    fetchTasks: () => fetchJson({ ...base, url: `${baseUrl}/crm/tasks` }),
    createTask: (body) => requestJson({ ...base, method: 'POST', url: `${baseUrl}/crm/tasks`, body }),
    updateTask: (id, body) => requestJson({ ...base, method: 'PATCH', url: taskUrl(id), body }),
    deleteTask: (id) => requestJson({ ...base, method: 'DELETE', url: taskUrl(id) }),
  };
}
