import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import * as deploymentVerifier from './verify-deployment.mjs';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  apiHostUrlFor,
  verifyApiHost,
  verifyDeployedCommit,
  verifyDeployment,
  readRelayRelease,
  verifyRelayCommit,
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

test('relay verification reads the existing healthy release contract and checks the full candidate', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(
      JSON.stringify({
        status: 'healthy',
        deployment: { target: 'fly', version: HEAD_SHA },
        dependencies: { database: { status: 'ok' } },
      }),
    );
  };
  assert.equal(
    await verifyRelayCommit('https://relay.fixture.invalid', HEAD_SHA, {
      expectedTarget: 'fly',
      fetchImpl,
      attempts: 1,
    }),
    HEAD_SHA,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/health');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('a healthy old relay, abbreviated identity, wrong target or unready database cannot create a serving verdict', async () => {
  for (const mutate of [
    (body) => {
      body.deployment.version = OLDER_SHA;
    },
    (body) => {
      body.deployment.version = HEAD_SHA.slice(0, 7);
    },
    (body) => {
      delete body.deployment.version;
    },
    (body) => {
      body.deployment.target = 'railway';
    },
    (body) => {
      body.dependencies.database.status = 'down';
    },
    (body) => {
      body.status = 'degraded';
    },
  ]) {
    let reached = 0;
    const fetchImpl = async () => {
      reached += 1;
      const body = {
        status: 'healthy',
        deployment: { target: 'fly', version: HEAD_SHA },
        dependencies: { database: { status: 'ok' } },
      };
      mutate(body);
      return new Response(JSON.stringify(body));
    };
    await assert.rejects(
      verifyRelayCommit('https://relay.fixture.invalid', HEAD_SHA, {
        expectedTarget: 'fly',
        fetchImpl,
        attempts: 1,
      }),
    );
    assert.equal(reached, 1);
  }
});

test('relay verification waits for the candidate and refuses redirects, invalid bodies and transport errors', async () => {
  let calls = 0;
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        status: 'healthy',
        deployment: { target: 'fly', version: ++calls === 1 ? OLDER_SHA : HEAD_SHA },
        dependencies: { database: { status: 'ok' } },
      }),
    );
  assert.equal(
    await verifyRelayCommit('https://relay.fixture.invalid', HEAD_SHA, {
      expectedTarget: 'fly',
      fetchImpl,
      attempts: 2,
      sleep: async () => {},
    }),
    HEAD_SHA,
  );
  assert.equal(calls, 2);
  for (const fetchImpl of [
    async () => new Response('', { status: 302 }),
    async () => new Response('not json'),
    async () => {
      throw new Error('transport unavailable');
    },
  ]) {
    await assert.rejects(
      readRelayRelease('https://relay.fixture.invalid', { expectedTarget: 'fly', fetchImpl }),
    );
  }
});

const PREVIEW_URL = 'https://fixture-deployment.vercel.app';
const PREVIEW_OPTIONS = {
  token: 'fixture-vercel-token',
  orgId: 'team_fixture',
  projectId: 'prj_fixture',
  bypassSecret: 'fixture-automation-bypass',
  attempts: 1,
};
const PREVIEW_IDENTITY = {
  url: new URL(PREVIEW_URL).hostname,
  ownerId: PREVIEW_OPTIONS.orgId,
  projectId: PREVIEW_OPTIONS.projectId,
  readyState: 'READY',
  target: null,
};

function previewFetch(calls, mutate = () => {}) {
  return async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    if (url.origin === 'https://api.vercel.com') {
      assert.equal(options.headers.authorization, `Bearer ${PREVIEW_OPTIONS.token}`);
      assert.equal(options.headers['x-vercel-protection-bypass'], undefined);
      assert.equal(url.pathname, `/v13/deployments/${new URL(PREVIEW_URL).hostname}`);
      assert.equal(url.searchParams.get('teamId'), PREVIEW_OPTIONS.orgId);
      const identity = { ...PREVIEW_IDENTITY };
      mutate(identity);
      return Response.json(identity);
    }
    assert.equal(url.origin, PREVIEW_URL);
    assert.equal(options.headers.authorization, undefined);
    if (options.headers['x-vercel-protection-bypass'] !== PREVIEW_OPTIONS.bypassSecret) {
      return new Response('<html>Vercel Authentication</html>', { status: 401 });
    }
    if (url.pathname === '/api/health') return Response.json(HEALTHY_BODY);
    if (url.pathname === '/api/version') return Response.json({ commit: HEAD_SHA });
    return Response.json(UNAUTHORIZED_BODY, { status: 401 });
  };
}

function runPreviewCli(environment = {}, protectedResponses = true) {
  const preload = `
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => originalTimeout(callback, Math.min(delay, 1), ...args);
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.origin === 'https://api.vercel.com') return Response.json(${JSON.stringify(PREVIEW_IDENTITY)});
  if (url.origin !== ${JSON.stringify(PREVIEW_URL)}) throw new Error('Unexpected fixture host');
  if (${protectedResponses} && options.headers['x-vercel-protection-bypass'] !== ${JSON.stringify(PREVIEW_OPTIONS.bypassSecret)}) {
    return new Response('<html>Vercel Authentication</html>', { status: 401 });
  }
  if (url.pathname === '/api/health') return Response.json(${JSON.stringify(HEALTHY_BODY)});
  if (url.pathname === '/api/version') return Response.json({commit: ${JSON.stringify(HEAD_SHA)}});
  return Response.json(${JSON.stringify(UNAUTHORIZED_BODY)}, {status:401});
};`;
  return spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(preload)}`,
      new URL('./verify-deployment.mjs', import.meta.url).pathname,
      '--vercel-preview',
      PREVIEW_URL,
      HEAD_SHA,
    ],
    {
      env: {
        VERCEL_TOKEN: PREVIEW_OPTIONS.token,
        VERCEL_ORG_ID: PREVIEW_OPTIONS.orgId,
        VERCEL_PROJECT_ID: PREVIEW_OPTIONS.projectId,
        VERCEL_AUTOMATION_BYPASS_SECRET: PREVIEW_OPTIONS.bypassSecret,
        ...environment,
      },
      encoding: 'utf8',
      timeout: 3000,
    },
  );
}

test('staging preview CLI verifies the protected fresh deployment without a persistent origin', () => {
  const result = runPreviewCli();
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preview serving path and commit verified/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes(PREVIEW_OPTIONS.bypassSecret));
});

test('staging preview CLI fails closed without a bypass even when an origin answers publicly', () => {
  const result = runPreviewCli({ VERCEL_AUTOMATION_BYPASS_SECRET: '' }, false);
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires valid Vercel credentials and an automation bypass secret/);
});

test('protected preview probes authenticate ownership before all serving and full commit checks', async () => {
  const calls = [];
  const result = await deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
    ...PREVIEW_OPTIONS,
    fetchImpl: previewFetch(calls),
  });
  assert.equal(result.deployedCommit, HEAD_SHA);
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    [
      `/v13/deployments/${new URL(PREVIEW_URL).hostname}`,
      '/api/health',
      '/api/me',
      '/api/usage',
      '/api/version',
    ],
  );
  assert.ok(
    calls
      .slice(1)
      .every(
        ({ options }) =>
          options.headers['x-vercel-protection-bypass'] === PREVIEW_OPTIONS.bypassSecret,
      ),
  );
});

test('a foreign project, owner, URL, production target or unready deployment never receives the bypass', async () => {
  for (const delta of [
    { projectId: 'prj_foreign' },
    { ownerId: 'team_foreign' },
    { url: 'foreign-deployment.vercel.app' },
    { target: 'production' },
    { readyState: 'BUILDING' },
    { target: undefined },
    { projectId: undefined },
  ]) {
    const calls = [];
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        fetchImpl: previewFetch(calls, (identity) => Object.assign(identity, delta)),
      }),
      /did not confirm a ready preview/,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers['x-vercel-protection-bypass'], undefined);
  }
});

test('protected preview rejects foreign and malformed origins before sending either credential', async () => {
  for (const url of [
    'https://attacker.example',
    'https://vercel.app',
    'https://fixture.vercel.app.attacker.example',
    'https://fixture.attacker.vercel.app',
    'http://fixture-deployment.vercel.app',
    'https://user:pass@fixture-deployment.vercel.app',
    `${PREVIEW_URL}/path`,
    `${PREVIEW_URL}?token=hidden`,
    `${PREVIEW_URL}#hidden`,
    `${PREVIEW_URL}:8443`,
    `${PREVIEW_URL}:443`,
    `${PREVIEW_URL}\n`,
    'not a URL',
  ]) {
    let calls = 0;
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(url, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        fetchImpl: async () => {
          calls += 1;
          throw new Error('Unexpected fetch');
        },
      }),
      /must be an HTTPS Vercel origin/,
    );
    assert.equal(calls, 0);
  }
});

test('missing credentials, header controls and an abbreviated candidate fail before any fetch without leaking values', async () => {
  for (const delta of [
    { bypassSecret: '' },
    { bypassSecret: 'hidden\r\nheader' },
    { bypassSecret: 'hidden\0token' },
    { bypassSecret: 'hidden token' },
    { token: 'hidden\r\ntoken' },
    { token: '' },
    { orgId: '' },
    { projectId: '' },
  ]) {
    let calls = 0;
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        ...delta,
        fetchImpl: async () => {
          calls += 1;
          throw new Error('Unexpected fetch');
        },
      }),
      (error) =>
        /requires valid Vercel credentials/.test(error.message) &&
        !error.message.includes('hidden'),
    );
    assert.equal(calls, 0);
  }
  await assert.rejects(
    deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA.slice(0, 9), PREVIEW_OPTIONS),
    /must be a full commit/,
  );
});

test('preview lookup errors and redirects never send the automation secret to a deployment', async () => {
  for (const response of [
    new Response('', { status: 302, headers: { location: 'https://attacker.example' } }),
    new Response('', { status: 403 }),
    new Response('private invalid response'),
  ]) {
    let calls = 0;
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        fetchImpl: async (url, options) => {
          calls += 1;
          assert.equal(new URL(url).origin, 'https://api.vercel.com');
          assert.equal(options.redirect, 'manual');
          assert.equal(options.headers['x-vercel-protection-bypass'], undefined);
          return response;
        },
      }),
      /preview lookup returned/,
    );
    assert.equal(calls, 1);
  }
});

test('preview serving and version redirects remain manual and cannot forward the bypass', async () => {
  for (const redirectedPath of ['/api/health', '/api/me', '/api/version']) {
    const calls = [];
    const servingFetch = previewFetch(calls);
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        fetchImpl: async (url, options) => {
          assert.equal(options.redirect, 'manual');
          assert.ok(['https://api.vercel.com', PREVIEW_URL].includes(new URL(url).origin));
          if (new URL(url).pathname === redirectedPath) {
            calls.push({ url: new URL(url), options });
            return new Response('', {
              status: 307,
              headers: { location: 'https://attacker.example' },
            });
          }
          return servingFetch(url, options);
        },
      }),
      /returned 307/,
    );
    assert.ok(calls.every(({ url }) => url.origin !== 'https://attacker.example'));
  }
});

test('a protected preview still rejects old commits, bad health and anonymous authenticated responses', async () => {
  for (const [path, body, status, expected] of [
    ['/api/version', { commit: OLDER_SHA }, 200, /serving commit/],
    ['/api/health', { ok: true }, 200, /not this app/],
    ['/api/usage', { percentUsed: 0 }, 200, /expected 401/],
    ['/api/me', { error: { code: 'WRONG' } }, 401, /UNAUTHORIZED envelope/],
  ]) {
    const calls = [];
    const servingFetch = previewFetch(calls);
    await assert.rejects(
      deploymentVerifier.verifyVercelPreview(PREVIEW_URL, HEAD_SHA, {
        ...PREVIEW_OPTIONS,
        fetchImpl: (url, options) =>
          new URL(url).pathname === path
            ? Promise.resolve(Response.json(body, { status }))
            : servingFetch(url, options),
      }),
      expected,
    );
  }
});

test('public production probes do not acquire an implicit bypass from options or the environment', async () => {
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push(options);
    if (url.pathname === '/api/health') return Response.json(HEALTHY_BODY);
    if (url.pathname === '/api/version') return Response.json({ commit: HEAD_SHA });
    return Response.json(UNAUTHORIZED_BODY, { status: 401 });
  };
  await verifyDeployment('https://production.fixture.invalid', {
    fetchImpl,
    bypassSecret: PREVIEW_OPTIONS.bypassSecret,
  });
  await verifyDeployedCommit('https://production.fixture.invalid', HEAD_SHA, {
    fetchImpl,
    bypassSecret: PREVIEW_OPTIONS.bypassSecret,
  });
  assert.ok(calls.every((options) => options.headers['x-vercel-protection-bypass'] === undefined));
});
