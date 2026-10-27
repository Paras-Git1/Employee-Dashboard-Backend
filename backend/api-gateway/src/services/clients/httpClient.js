// Errors safe to show to the browser; details stay in the server log.
// status is the HTTP status the source returned (undefined for timeouts / network errors).
export class SourceError extends Error {
  constructor(source, message, { cause, status } = {}) {
    super(message);
    this.source = source;
    this.cause = cause;
    this.status = status;
  }
}

export async function requestJson({ source, label, url, timeoutMs, method = 'GET', body, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new SourceError(source, `${label} service timed out after ${timeoutMs} ms`, { cause: err });
    }
    throw new SourceError(source, `${label} service is unreachable`, { cause: err });
  }
  if (response.status === 204) return null;

  let data;
  try {
    data = await response.json();
  } catch (err) {
    if (!response.ok) throw new SourceError(source, `${label} service returned an error (HTTP ${response.status})`, { status: response.status });
    throw new SourceError(source, `${label} service returned invalid data`, { cause: err });
  }
  if (!response.ok) {
    // 4xx messages come from the source's own validation and are safe to pass on.
    const message = response.status < 500 && typeof data?.error === 'string'
      ? data.error
      : `${label} service returned an error (HTTP ${response.status})`;
    throw new SourceError(source, message, { status: response.status });
  }
  return data;
}

export async function fetchJson(options) {
  const body = await requestJson(options);
  if (!Array.isArray(body)) throw new SourceError(options.source, `${options.label} service returned invalid data`);
  return body;
}
