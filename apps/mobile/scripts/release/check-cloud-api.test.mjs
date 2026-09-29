import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TERMS_ACCEPTANCE_PATH } from '../../../../packages/contracts/cloud-contracts/src/terms-acceptance.ts';
import { FREE_QUOTA_CATALOGUE_PATH } from '../../../../packages/contracts/cloud-contracts/src/free-quota.ts';
import { checkCloudApi } from './check-cloud-api.mjs';

test('required Cloud routes answer with an authentication challenge', async () => {
  const paths = [];
  const outcomes = await checkCloudApi({
    baseUrl: 'https://cloud.example.test',
    fetchImpl: async (url, options) => {
      paths.push(url.pathname);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      return new Response(
        JSON.stringify({ error: { code: 'authentication-required' }, requestId: 'request-1' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  assert.deepEqual(paths, [TERMS_ACCEPTANCE_PATH, FREE_QUOTA_CATALOGUE_PATH]);
  assert.equal(outcomes.length, 2);
});

test('missing deployed routes fail the release check', async () => {
  await assert.rejects(
    checkCloudApi({
      baseUrl: 'https://cloud.example.test',
      fetchImpl: async (url) => ({ status: url.pathname === TERMS_ACCEPTANCE_PATH ? 405 : 404 }),
    }),
    /Terms status returned HTTP 405[\s\S]*provider-funded Free catalogue returned HTTP 404/u,
  );
});

test('an unauthenticated success or redirect fails the release check', async () => {
  for (const status of [200, 302]) {
    await assert.rejects(
      checkCloudApi({
        baseUrl: 'https://cloud.example.test',
        fetchImpl: async () => ({ status }),
      }),
      new RegExp(`returned HTTP ${status} without a session`, 'u'),
    );
  }
});

test('a generic 401 cannot impersonate the deployed AGI API route', async () => {
  for (const body of [null, '<html>Unauthorized</html>', JSON.stringify({ error: 'denied' })]) {
    await assert.rejects(
      checkCloudApi({
        baseUrl: 'https://cloud.example.test',
        fetchImpl: async () =>
          new Response(body, {
            status: 401,
            headers: { 'content-type': body?.startsWith('{') ? 'application/json' : 'text/html' },
          }),
      }),
      /HTTP 401 without the AGI API error envelope/u,
    );
  }
});

test('an unreachable route and a non-TLS origin fail the release check', async () => {
  await assert.rejects(
    checkCloudApi({
      baseUrl: 'https://cloud.example.test',
      fetchImpl: async () => {
        throw new Error('network unavailable');
      },
    }),
    /could not be reached/u,
  );
  await assert.rejects(
    checkCloudApi({
      baseUrl: 'http://cloud.example.test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { code: 'authentication-required' }, requestId: 'request-1' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    }),
    /must use HTTPS/u,
  );
});

test('an omitted release API origin cannot silently probe a fallback deployment', async () => {
  const prior = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  try {
    await assert.rejects(checkCloudApi(), /Set EXPO_PUBLIC_API_URL/u);
  } finally {
    if (prior === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = prior;
  }
});
