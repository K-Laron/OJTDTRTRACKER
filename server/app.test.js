import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.js';

function startTestServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(res => server.close(res)),
      });
    });
  });
}

test('API responses include security headers and hide powered-by', async () => {
  const app = createApp({ allowedOrigins: new Set(['http://example.com']) });
  const server = await startTestServer(app);

  try {
    const res = await fetch(`${server.url}/api/unknown`, {
      headers: { Origin: 'http://example.com' },
    });
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(res.headers.has('x-powered-by'), false);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Not found' });
  } finally {
    await server.close();
  }
});

test('API rejects unapproved CORS origins with 403', async () => {
  const app = createApp({ allowedOrigins: new Set(['http://trusted.com']) });
  const server = await startTestServer(app);

  try {
    const res = await fetch(`${server.url}/api/unknown`, {
      headers: { Origin: 'http://malicious.com' },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'CORS origin not allowed');
  } finally {
    await server.close();
  }
});

test('Protected routes reject unauthenticated requests with 401', async () => {
  const app = createApp({ allowedOrigins: new Set(['http://example.com']) });
  const server = await startTestServer(app);

  try {
    const res = await fetch(`${server.url}/api/entries`, {
      headers: { Origin: 'http://example.com' },
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.deepEqual(body, { error: 'Unauthorized' });
  } finally {
    await server.close();
  }
});

test('Auth registration rejects empty username or password with 400', async () => {
  const app = createApp({ allowedOrigins: new Set(['http://example.com']) });
  const server = await startTestServer(app);

  try {
    const res = await fetch(`${server.url}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://example.com',
      },
      body: JSON.stringify({ username: '', password: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(typeof body.error, 'string');
    assert.equal(body.error.length > 0, true);
  } finally {
    await server.close();
  }
});
