import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { verifyDeployment } from './verify-deployment.mjs';

const HEALTHY_BODY = {
  status: 'healthy',
  timestamp: '2026-08-08T00:00:00.000Z',
  checks: {
    database: { status: 'healthy' },
    stripe: { status: 'healthy' },
    environment: { status: 'healthy' },
  },
};

const UNAUTHORIZED_BODY = {
  error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  requestId: 'test-request',
};

async function startDeployment(t, routes) {
  const server = createServer((request, response) => {
    const [status, body] = routes[request.url ?? ''] ?? [401, UNAUTHORIZED_BODY];
    response.statusCode = status;
    response.setHeader('content-type', typeof body === 'string' ? 'text/html' : 'application/json');
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  });

  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return `http://127.0.0.1:${address.port}`;
}

test('a deployment whose health and authenticated routes both answer passes', async (t) => {
  const baseUrl = await startDeployment(t, { '/api/health': [200, HEALTHY_BODY] });

  const result = await verifyDeployment(baseUrl, { attempts: 1 });

  assert.deepEqual(result.probes, ['/api/health', '/api/me', '/api/usage']);
});

test('healthy /api/health does not excuse a 500 from an authenticated route', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/health': [200, HEALTHY_BODY],
    '/api/me': [500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }],
  });

  await assert.rejects(verifyDeployment(baseUrl, { attempts: 1 }), /\/api\/me returned 500/);
});

test('a Deployment Protection challenge does not count as a signed-out refusal', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/health': [200, HEALTHY_BODY],
    '/api/me': [401, '<html>Authentication Required</html>'],
  });

  await assert.rejects(verifyDeployment(baseUrl, { attempts: 1 }), /non-JSON body/);
});

test('an authenticated route that answers without credentials fails the gate', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/health': [200, HEALTHY_BODY],
    '/api/usage': [200, { percentUsed: 0 }],
  });

  await assert.rejects(
    verifyDeployment(baseUrl, { attempts: 1 }),
    /\/api\/usage returned 200, expected 401/,
  );
});

test('a 200 from something that is not this app does not pass as health', async (t) => {
  const baseUrl = await startDeployment(t, { '/api/health': [200, { ok: true }] });

  await assert.rejects(
    verifyDeployment(baseUrl, { attempts: 1 }),
    /not this app’s health-check contract/,
  );
});

test('a deployment URL that is not http or https is rejected', async () => {
  await assert.rejects(
    verifyDeployment('ftp://example.com', { attempts: 1 }),
    /must use http or https/,
  );
});

test('an unhealthy deployment fails before the authenticated probes run', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/health': [503, { ...HEALTHY_BODY, status: 'unhealthy' }],
  });

  await assert.rejects(verifyDeployment(baseUrl, { attempts: 1 }), /\/api\/health returned 503/);
});

test('a transient failure is retried before the gate gives up', async (t) => {
  let healthHits = 0;
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/health') {
      healthHits += 1;
      response.statusCode = healthHits === 1 ? 503 : 200;
      response.end(
        JSON.stringify(healthHits === 1 ? { ...HEALTHY_BODY, status: 'unhealthy' } : HEALTHY_BODY),
      );
      return;
    }
    response.statusCode = 401;
    response.end(JSON.stringify(UNAUTHORIZED_BODY));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');

  const result = await verifyDeployment(`http://127.0.0.1:${address.port}`, {
    attempts: 2,
    retryDelayMs: 1,
  });

  assert.equal(healthHits, 2);
  assert.equal(result.probes.length, 3);
});
