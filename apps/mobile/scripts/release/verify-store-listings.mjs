#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(
  HERE,
  '..',
  '..',
  'src',
  'features',
  'release-state',
  'mobileReleaseState.json',
);
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

export function readRegistry(path = REGISTRY_PATH) {
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (!registry || typeof registry !== 'object' || typeof registry.stores !== 'object') {
    throw new Error(`${path} is not a release-state registry`);
  }
  return registry;
}

function requireRecord(registry, store) {
  const record = registry.stores?.[store];
  if (!record || typeof record !== 'object') {
    throw new Error(`release-state registry has no "${store}" record`);
  }
  if (record.status !== 'published' && record.status !== 'unpublished') {
    throw new Error(`"${store}" status must be published or unpublished`);
  }
  if (typeof record.productionId !== 'string' || record.productionId.length === 0) {
    throw new Error(`"${store}" record has no productionId to verify`);
  }
  return record;
}

async function readBoundedText(response, url) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${url} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (response.body === null) throw new Error(`${url} returned an empty body`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`${url} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * @returns {Promise<{live: boolean, listingId: string | null, listingUrl: string | null}>}
 */
export async function lookupAppleListing(bundleId, fetchImpl) {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`${url} returned HTTP ${response.status}`);

  let payload;
  try {
    payload = JSON.parse(await readBoundedText(response, url));
  } catch {
    throw new Error(`${url} did not return valid JSON`);
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (results.length === 0) return { live: false, listingId: null, listingUrl: null };

  const [entry] = results;
  const trackId = entry?.trackId;
  if (typeof trackId !== 'number' && typeof trackId !== 'string') {
    throw new Error(`${url} returned a listing with no trackId`);
  }
  return {
    live: true,
    listingId: String(trackId),
    listingUrl: typeof entry?.trackViewUrl === 'string' ? entry.trackViewUrl : null,
  };
}

/**
 * @returns {Promise<{live: boolean, listingId: string | null, listingUrl: string | null}>}
 */
export async function lookupGoogleListing(packageName, fetchImpl) {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}&hl=en`;
  const response = await fetchImpl(url, {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return { live: false, listingId: null, listingUrl: null };
  if (response.status !== 200) {
    throw new Error(`${url} returned HTTP ${response.status}; listing state is unverified`);
  }
  return {
    live: true,
    listingId: packageName,
    listingUrl: `https://play.google.com/store/apps/details?id=${packageName}`,
  };
}

function reconcile(store, record, live) {
  const published = record.status === 'published';

  if (published && !live.live) {
    throw new Error(
      `release-state registry says "${store}" is published, but no live listing exists for ${record.productionId}`,
    );
  }
  if (!published && live.live) {
    throw new Error(
      `"${store}" has a live listing (${live.listingId}) while the release-state registry still says unpublished, update src/features/release-state/mobileReleaseState.json deliberately`,
    );
  }
  if (!published) {
    for (const field of ['listingId', 'listingUrl', 'subscriptionManagementUrl']) {
      if (record[field] !== null) {
        throw new Error(`unpublished "${store}" record must keep ${field} null`);
      }
    }
    return;
  }
  if (record.listingId !== live.listingId) {
    throw new Error(
      `"${store}" listingId ${JSON.stringify(record.listingId)} does not match the live listing ${JSON.stringify(live.listingId)}`,
    );
  }
  if (
    typeof record.listingUrl !== 'string' ||
    !record.listingUrl.includes(String(live.listingId))
  ) {
    throw new Error(`"${store}" listingUrl must name the verified listing ${live.listingId}`);
  }
}

export async function verifyStoreListings({
  registry = readRegistry(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  const apple = requireRecord(registry, 'apple');
  const google = requireRecord(registry, 'google');

  const [appleLive, googleLive] = await Promise.all([
    lookupAppleListing(apple.productionId, fetchImpl),
    lookupGoogleListing(google.productionId, fetchImpl),
  ]);

  reconcile('apple', apple, appleLive);
  reconcile('google', google, googleLive);

  return { apple: appleLive, google: googleLive };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = await verifyStoreListings();
    console.log(
      `[release] store listings verified: apple live=${result.apple.live}, google live=${result.google.live}`,
    );
  } catch (error) {
    console.error(`[release] store listing verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
