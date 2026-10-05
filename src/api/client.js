const API_BASE = '/api';

export async function request(path, options = {}, { on401 } = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : await res.text().catch(() => '');

  if (res.status === 401 && on401) {
    on401();
  }

  if (!res.ok) {
    const error = new Error(data?.error || (typeof data === 'string' && data) || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function jsonBody(body, userId) {
  return {
    headers: { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': userId } : {}) },
    body: JSON.stringify(body),
  };
}
