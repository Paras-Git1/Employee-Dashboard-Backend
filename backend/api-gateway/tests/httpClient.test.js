import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchJson } from '../src/services/clients/httpClient.js';

let server;
let base;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') return res.end('[1,2]');
    if (req.url === '/slow') return setTimeout(() => res.end('[]'), 500);
    if (req.url === '/fail') { res.statusCode = 500; return res.end('{}'); }
    if (req.url === '/object') return res.end('{"not":"a list"}');
    res.end('not json');
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
afterAll(() => server.close());

const call = (path, timeoutMs = 200) => fetchJson({ source: 'crm', label: 'CRM', url: `${base}${path}`, timeoutMs });

describe('fetchJson', () => {
  it('returns the parsed array', async () => {
    expect(await call('/ok')).toEqual([1, 2]);
  });
  it('times out with a clean message', async () => {
    await expect(call('/slow', 100)).rejects.toMatchObject({ source: 'crm', message: 'CRM service timed out after 100 ms' });
  });
  it('reports HTTP errors', async () => {
    await expect(call('/fail')).rejects.toMatchObject({ message: 'CRM service returned an error (HTTP 500)' });
  });
  it('rejects non-JSON and non-array bodies', async () => {
    await expect(call('/garbage')).rejects.toMatchObject({ message: 'CRM service returned invalid data' });
    await expect(call('/object')).rejects.toMatchObject({ message: 'CRM service returned invalid data' });
  });
  it('reports unreachable services', async () => {
    await expect(fetchJson({ source: 'crm', label: 'CRM', url: 'http://localhost:1/x', timeoutMs: 500 }))
      .rejects.toMatchObject({ message: 'CRM service is unreachable' });
  });
});
