import assert from 'node:assert/strict';
import test from 'node:test';

import { readRegistry, verifyStoreListings } from './verify-store-listings.mjs';

const PRODUCTION_ID = 'com.agiworkforce.app';

function unpublishedRegistry() {
  return {
    surface: 'mobile',
    statusLabel: 'Coming soon',
    released: false,
    stores: {
      apple: {
        store: 'apple',
        status: 'unpublished',
        productionId: PRODUCTION_ID,
        listingId: null,
        listingUrl: null,
        subscriptionManagementUrl: null,
        evidence: 'test',
      },
      google: {
        store: 'google',
        status: 'unpublished',
        productionId: PRODUCTION_ID,
        listingId: null,
        listingUrl: null,
        subscriptionManagementUrl: null,
        evidence: 'test',
      },
    },
  };
}

function storeFetch({ appleResults = [], googleStatus = 404 } = {}) {
  return async (url) => {
    if (url.startsWith('https://itunes.apple.com/lookup')) {
      return new Response(
        JSON.stringify({ resultCount: appleResults.length, results: appleResults }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    if (url.startsWith('https://play.google.com/store/apps/details')) {
      return new Response(googleStatus === 200 ? '<html></html>' : 'not found', {
        status: googleStatus,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    throw new Error(`unexpected URL ${url}`);
  };
}

test('passes when neither store has a live listing and the registry says so', async () => {
  const result = await verifyStoreListings({
    registry: unpublishedRegistry(),
    fetchImpl: storeFetch(),
  });
  assert.equal(result.apple.live, false);
  assert.equal(result.google.live, false);
});

test('fails when the registry claims a published App Store listing that does not exist', async () => {
  const registry = unpublishedRegistry();
  registry.stores.apple.status = 'published';
  registry.stores.apple.listingId = '1234567890';
  registry.stores.apple.listingUrl = 'https://apps.apple.com/app/id1234567890';

  await assert.rejects(
    () => verifyStoreListings({ registry, fetchImpl: storeFetch() }),
    /says "apple" is published, but no live listing exists/,
  );
});

test('fails when a live listing appears while the registry still says unpublished', async () => {
  await assert.rejects(
    () =>
      verifyStoreListings({
        registry: unpublishedRegistry(),
        fetchImpl: storeFetch({ googleStatus: 200 }),
      }),
    /has a live listing .* while the release-state registry still says unpublished/,
  );
});

test('fails when the recorded listing id is not the live listing id', async () => {
  const registry = unpublishedRegistry();
  registry.stores.apple.status = 'published';
  registry.stores.apple.listingId = '1111111111';
  registry.stores.apple.listingUrl = 'https://apps.apple.com/app/id1111111111';

  await assert.rejects(
    () =>
      verifyStoreListings({
        registry,
        fetchImpl: storeFetch({
          appleResults: [
            { trackId: 2222222222, trackViewUrl: 'https://apps.apple.com/app/id2222222222' },
          ],
        }),
      }),
    /does not match the live listing/,
  );
});

test('fails closed when a store lookup cannot be completed', async () => {
  await assert.rejects(
    () =>
      verifyStoreListings({
        registry: unpublishedRegistry(),
        fetchImpl: async () => {
          throw new Error('network unreachable');
        },
      }),
    /network unreachable/,
  );
});

test('fails when an unpublished record still carries a store link', async () => {
  const registry = unpublishedRegistry();
  registry.stores.google.subscriptionManagementUrl =
    'https://play.google.com/store/account/subscriptions';

  await assert.rejects(
    () => verifyStoreListings({ registry, fetchImpl: storeFetch() }),
    /unpublished "google" record must keep subscriptionManagementUrl null/,
  );
});

test('the checked-in registry is shaped like a release-state registry', () => {
  const registry = readRegistry();
  assert.equal(registry.surface, 'mobile');
  for (const store of ['apple', 'google']) {
    assert.ok(registry.stores[store], `missing ${store} record`);
    assert.equal(typeof registry.stores[store].productionId, 'string');
  }
});
