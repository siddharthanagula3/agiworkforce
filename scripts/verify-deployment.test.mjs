import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  apiHostUrlFor,
  verifyApiHost,
  verifyDeployedCommit,
  verifyDeployment,
} from './verify-deployment.mjs';

const HEAD_SHA = 'e15df56e3a1b4c5d6e7f8091a2b3c4d5e6f70819';
const OLDER_SHA = '4bfc99dc1f0e9d8c7b6a5948372615043f2e1d0c';

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

test('a production origin serving main HEAD passes the drift check', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [200, { commit: HEAD_SHA, environment: 'production', deploymentId: 'dpl_1' }],
  });

  const result = await verifyDeployedCommit(baseUrl, HEAD_SHA, { attempts: 1 });

  assert.equal(result.deployedCommit, HEAD_SHA);
});

test('an abbreviated deployed SHA still matches the full expected SHA', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [200, { commit: HEAD_SHA.slice(0, 9), environment: 'production' }],
  });

  const result = await verifyDeployedCommit(baseUrl, HEAD_SHA, { attempts: 1 });

  assert.equal(result.deployedCommit, HEAD_SHA.slice(0, 9));
});

test('a production origin left on an older build fails and names both commits', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [200, { commit: OLDER_SHA, environment: 'production' }],
  });

  await assert.rejects(
    verifyDeployedCommit(baseUrl, HEAD_SHA, { attempts: 1 }),
    new RegExp(`serving commit ${OLDER_SHA}, but main is at ${HEAD_SHA}`),
  );
});

test('a build predating /api/version reads as drift, not as a passing check', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [404, { error: { code: 'NOT_FOUND', message: 'Not found' } }],
  });

  await assert.rejects(
    verifyDeployedCommit(baseUrl, HEAD_SHA, { attempts: 1 }),
    /does not serve \/api\/version/,
  );
});

test('a deployed build that reports no commit does not pass as a match', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [200, { commit: 'unknown', environment: 'production' }],
  });

  await assert.rejects(
    verifyDeployedCommit(baseUrl, HEAD_SHA, { attempts: 1 }),
    /reported no deployed commit/,
  );
});

test('drift is reported on the first attempt instead of being retried away', async (t) => {
  let versionHits = 0;
  const server = createServer((request, response) => {
    versionHits += 1;
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ commit: OLDER_SHA }));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');

  await assert.rejects(
    verifyDeployedCommit(`http://127.0.0.1:${address.port}`, HEAD_SHA, {
      attempts: 5,
      retryDelayMs: 1,
    }),
    /the promotion did not happen/,
  );
  assert.equal(versionHits, 1);
});

test('a promotion still propagating is retried instead of failing the deploy gate', async (t) => {
  let versionHits = 0;
  const server = createServer((request, response) => {
    versionHits += 1;
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ commit: versionHits < 3 ? OLDER_SHA : HEAD_SHA }));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');

  const result = await verifyDeployedCommit(`http://127.0.0.1:${address.port}`, HEAD_SHA, {
    attempts: 5,
    retryDelayMs: 1,
    awaitPromotion: true,
  });

  assert.equal(result.deployedCommit, HEAD_SHA);
  assert.equal(versionHits, 3);
});

test('awaiting a promotion still gives up and names both commits when it never lands', async (t) => {
  const baseUrl = await startDeployment(t, {
    '/api/version': [200, { commit: OLDER_SHA, environment: 'production' }],
  });

  await assert.rejects(
    verifyDeployedCommit(baseUrl, HEAD_SHA, {
      attempts: 2,
      retryDelayMs: 1,
      awaitPromotion: true,
    }),
    new RegExp(`serving commit ${OLDER_SHA}, but main is at ${HEAD_SHA}`),
  );
});

test('an expected commit that is not a git SHA is rejected before any request', async () => {
  await assert.rejects(
    verifyDeployedCommit('https://example.com', 'main', { attempts: 1 }),
    /is not a git SHA/,
  );
});

const MODEL_LIST_BODY = { object: 'list', data: [] };
const NOT_FOUND_PAGE = '<!DOCTYPE html><html><body>This page could not be found.</body></html>';

const SERVED_API_HOST = {
  '/health': { status: 200, contentType: 'application/json', body: HEALTHY_BODY },
  '/v1/models': { status: 200, contentType: 'application/json', body: MODEL_LIST_BODY },
};

async function startApiHost(t, routes) {
  const hits = [];
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    hits.push(path);
    const route = routes[path];
    if (!route) {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(NOT_FOUND_PAGE);
      return;
    }
    response.statusCode = route.status;
    if (route.location) response.setHeader('location', route.location);
    response.setHeader('content-type', route.contentType);
    response.end(typeof route.body === 'string' ? route.body : JSON.stringify(route.body));
  });

  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return { url: `http://127.0.0.1:${address.port}`, hits };
}

test('an API host that serves both OpenAI-compatible aliases passes', async (t) => {
  const { url } = await startApiHost(t, SERVED_API_HOST);

  const result = await verifyApiHost(url, { attempts: 1 });

  assert.deepEqual(result.probes, ['/health', '/v1/models']);
});

test('a /v1 alias bounced back to the app host fails as an inert rewrite', async (t) => {
  const { url, hits } = await startApiHost(t, {
    ...SERVED_API_HOST,
    '/v1/models': {
      status: 307,
      contentType: 'text/plain',
      location: 'https://agiworkforce.com/v1/models',
      body: '',
    },
  });

  await assert.rejects(
    verifyApiHost(url, { attempts: 5, retryDelayMs: 1 }),
    /the host-scoped rewrite never ran/,
  );
  assert.equal(
    hits.filter((path) => path === '/v1/models').length,
    1,
    'an inert rewrite is a settled fact, not a transient failure to retry',
  );
});

test('a /v1 alias answered with the app not-found page does not pass as the API', async (t) => {
  const { url } = await startApiHost(t, {
    ...SERVED_API_HOST,
    '/v1/models': { status: 200, contentType: 'text/html; charset=utf-8', body: NOT_FOUND_PAGE },
  });

  await assert.rejects(verifyApiHost(url, { attempts: 1 }), /serving the app shell, not the API/);
});

test('a JSON 404 from a /v1 alias fails instead of counting as served', async (t) => {
  const { url } = await startApiHost(t, {
    ...SERVED_API_HOST,
    '/v1/models': {
      status: 404,
      contentType: 'application/json',
      body: { error: { code: 'NOT_FOUND' } },
    },
  });

  await assert.rejects(verifyApiHost(url, { attempts: 1 }), /returned 404, expected 200/);
});

test('a /v1/models 200 without the OpenAI list envelope fails the gate', async (t) => {
  const { url } = await startApiHost(t, {
    ...SERVED_API_HOST,
    '/v1/models': { status: 200, contentType: 'application/json', body: { models: [] } },
  });

  await assert.rejects(
    verifyApiHost(url, { attempts: 1 }),
    /answered without the OpenAI-compatible model list envelope/,
  );
});

test('an API host /health answering as something other than this app fails', async (t) => {
  const { url } = await startApiHost(t, {
    ...SERVED_API_HOST,
    '/health': { status: 200, contentType: 'application/json', body: { ok: true } },
  });

  await assert.rejects(
    verifyApiHost(url, { attempts: 1 }),
    /is not this app’s health-check contract/,
  );
});

test('the probed host is the api. subdomain of the app host, not the app host', () => {
  assert.equal(apiHostUrlFor('https://agiworkforce.com').href, 'https://api.agiworkforce.com/');
  assert.equal(apiHostUrlFor('https://agiworkforce.com/chat').host, 'api.agiworkforce.com');
});

test('an app URL that is not http or https is rejected before any API host probe', () => {
  assert.throws(() => apiHostUrlFor('ftp://agiworkforce.com'), /must use http or https/);
});
