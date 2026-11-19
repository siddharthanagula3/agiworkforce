import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_IOS_PATHS,
  normalizeSha256Fingerprint,
  verifyProductionAssociations,
} from './verify-production-associations.mjs';

const AASA_BUILDER_SOURCE = fileURLToPath(
  new URL('../../../web/lib/server/mobile-app-association.ts', import.meta.url),
);
const RAW_FINGERPRINT = 'AA'.repeat(32);
const NORMALIZED_FINGERPRINT = normalizeSha256Fingerprint(RAW_FINGERPRINT);

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function appleDocument(paths = EXPECTED_IOS_PATHS) {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ['D2PR62RLT4.com.agiworkforce.app'],
          components: paths.map((path) => ({ '/': path })),
        },
      ],
    },
  };
}

function androidDocument(fingerprints = [NORMALIZED_FINGERPRINT]) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.agiworkforce.app',
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function associationFetch({ apple = appleDocument(), android = androidDocument() } = {}) {
  return async (url) => {
    if (url.endsWith('/apple-app-site-association')) return jsonResponse(apple);
    if (url.endsWith('/assetlinks.json')) return jsonResponse(android);
    throw new Error(`unexpected URL ${url}`);
  };
}

test('accepts exact production Apple paths and the protected Play signing fingerprint', async () => {
  await verifyProductionAssociations({
    rawFingerprints: RAW_FINGERPRINT,
    fetchImpl: associationFetch(),
  });
});

test('rejects redirects before reading an association document', async () => {
  await assert.rejects(
    verifyProductionAssociations({
      rawFingerprints: RAW_FINGERPRINT,
      fetchImpl: async () => jsonResponse({}, { status: 307, headers: { Location: '/login' } }),
    }),
    /redirected instead of serving/u,
  );
});

test('rejects an Android document signed by a different certificate', async () => {
  await assert.rejects(
    verifyProductionAssociations({
      rawFingerprints: RAW_FINGERPRINT,
      fetchImpl: associationFetch({ android: androidDocument(['BB'.repeat(32)]) }),
    }),
    /fingerprints do not match/u,
  );
});

test('rejects an overbroad Apple path contract', async () => {
  await assert.rejects(
    verifyProductionAssociations({
      rawFingerprints: RAW_FINGERPRINT,
      fetchImpl: associationFetch({
        apple: appleDocument([...EXPECTED_IOS_PATHS, '*']),
      }),
    }),
    /Apple association paths do not match/u,
  );
});

test('rejects production still claiming the pairing paths', async () => {
  await assert.rejects(
    verifyProductionAssociations({
      rawFingerprints: RAW_FINGERPRINT,
      fetchImpl: associationFetch({
        apple: appleDocument([...EXPECTED_IOS_PATHS, '/pair', '/pair/*']),
      }),
    }),
    /Apple association paths do not match/u,
  );
});

test('rejects production dropping a path the app routes', async () => {
  for (const dropped of EXPECTED_IOS_PATHS) {
    await assert.rejects(
      verifyProductionAssociations({
        rawFingerprints: RAW_FINGERPRINT,
        fetchImpl: associationFetch({
          apple: appleDocument(EXPECTED_IOS_PATHS.filter((path) => path !== dropped)),
        }),
      }),
      /Apple association paths do not match/u,
    );
  }
});

test('expects exactly the paths the web builder declares', () => {
  const declared = [...readFileSync(AASA_BUILDER_SOURCE, 'utf8').matchAll(/'\/':\s*'([^']+)'/gu)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(declared, [...EXPECTED_IOS_PATHS]);
  assert.deepEqual([...EXPECTED_IOS_PATHS], [...EXPECTED_IOS_PATHS].sort());
});

test('rejects a malformed protected fingerprint before network access', async () => {
  let fetchCalled = false;
  await assert.rejects(
    verifyProductionAssociations({
      rawFingerprints: 'upload-key-is-not-accepted',
      fetchImpl: async () => {
        fetchCalled = true;
        return jsonResponse({});
      },
    }),
    /invalid SHA-256 fingerprint/u,
  );
  assert.equal(fetchCalled, false);
});
