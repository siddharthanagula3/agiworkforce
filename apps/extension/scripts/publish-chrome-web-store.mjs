#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://chromewebstore.googleapis.com';
const CHROMEWEBSTORE_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const MAX_STATUS_POLLS = 12;
const STATUS_POLL_INTERVAL_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 4_000;

function requiredIdentifier(value, name, pattern) {
  const trimmed = value?.trim();
  if (!trimmed || !pattern.test(trimmed)) {
    throw new Error(`${name} is missing or malformed`);
  }
  return trimmed;
}

function parseResponseBody(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, MAX_ERROR_BODY_CHARS) };
  }
}

async function requestJson(fetchImpl, url, init, { retryGet = true, sleep } = {}) {
  const method = init.method ?? 'GET';
  const attempts = retryGet && method === 'GET' ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const body = parseResponseBody(text);
    if (response.ok) return body;

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < attempts) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      const delay = Number.isFinite(retryAfter)
        ? Math.min(Math.max(retryAfter * 1_000, 250), 10_000)
        : attempt * 500;
      await sleep(delay);
      continue;
    }

    throw new Error(
      `Chrome Web Store ${method} ${new URL(url).pathname} returned HTTP ${response.status}: ${JSON.stringify(body).slice(0, MAX_ERROR_BODY_CHARS)}`,
    );
  }
  throw new Error('Chrome Web Store request retry budget exhausted');
}

function normalizeUploadState(value) {
  return String(value ?? '')
    .replace(/^UPLOAD_/u, '')
    .toUpperCase();
}

function revisionVersion(status, key) {
  const channels = status?.[key]?.distributionChannels;
  if (!Array.isArray(channels)) return undefined;
  return channels.find((channel) => typeof channel?.crxVersion === 'string')?.crxVersion;
}

async function waitForUpload({ fetchImpl, statusUrl, headers, sleep }) {
  for (let attempt = 1; attempt <= MAX_STATUS_POLLS; attempt += 1) {
    if (attempt > 1) await sleep(STATUS_POLL_INTERVAL_MS);
    const status = await requestJson(fetchImpl, statusUrl, { headers }, { sleep });
    const state = normalizeUploadState(status.lastAsyncUploadState);
    if (state === 'SUCCEEDED') return status;
    if (state === 'FAILED' || state === 'NOT_FOUND') {
      throw new Error(`Chrome Web Store async upload ended in ${state}`);
    }
  }
  throw new Error('Chrome Web Store async upload did not finish within 60 seconds');
}

export async function publishChromeWebStore({
  accessToken,
  publisherId,
  extensionId,
  expectedVersion,
  packagePath,
  packageBytes,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const token = accessToken?.trim();
  if (!token) throw new Error('CWS_ACCESS_TOKEN is required');
  const publisher = requiredIdentifier(publisherId, 'CWS_PUBLISHER_ID', /^[A-Za-z0-9_-]{1,128}$/u);
  const item = requiredIdentifier(extensionId, 'CWS_EXTENSION_ID', /^[a-p]{32}$/u);
  const version = requiredIdentifier(
    expectedVersion,
    'CWS_EXPECTED_VERSION',
    /^\d+(?:\.\d+){0,3}$/u,
  );
  const bytes = packageBytes ?? fs.readFileSync(path.resolve(packagePath));
  if (bytes.length === 0) throw new Error('Chrome Web Store package is empty');

  const itemName = `publishers/${publisher}/items/${item}`;
  const statusUrl = `${API_ORIGIN}/v2/${itemName}:fetchStatus`;
  const uploadUrl = `${API_ORIGIN}/upload/v2/${itemName}:upload`;
  const publishUrl = `${API_ORIGIN}/v2/${itemName}:publish`;
  const headers = { Authorization: `Bearer ${token}` };

  const initialStatus = await requestJson(fetchImpl, statusUrl, { headers }, { sleep });
  if (initialStatus.takenDown || initialStatus.warned) {
    throw new Error('Chrome Web Store item is taken down or has an unresolved policy warning');
  }
  const publishedVersion = revisionVersion(initialStatus, 'publishedItemRevisionStatus');
  if (publishedVersion === version) {
    return { outcome: 'already-published', version, state: 'PUBLISHED' };
  }
  const submittedVersion = revisionVersion(initialStatus, 'submittedItemRevisionStatus');
  if (submittedVersion === version) {
    return {
      outcome: 'already-submitted',
      version,
      state: initialStatus.submittedItemRevisionStatus?.state ?? 'SUBMITTED',
    };
  }
  if (submittedVersion && submittedVersion !== version) {
    throw new Error(
      `Chrome Web Store already has submitted version ${submittedVersion}; resolve it before uploading ${version}`,
    );
  }

  const upload = await requestJson(
    fetchImpl,
    uploadUrl,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/zip' },
      body: bytes,
    },
    { retryGet: false, sleep },
  );
  const uploadState = normalizeUploadState(upload.uploadState);
  if (uploadState === 'IN_PROGRESS') {
    await waitForUpload({ fetchImpl, statusUrl, headers, sleep });
  } else if (uploadState !== 'SUCCEEDED') {
    throw new Error(`Chrome Web Store upload ended in ${uploadState || 'an unknown state'}`);
  }
  if (upload.crxVersion && upload.crxVersion !== version) {
    throw new Error(
      `Chrome Web Store accepted package version ${upload.crxVersion}, expected ${version}`,
    );
  }

  const publication = await requestJson(
    fetchImpl,
    publishUrl,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publishType: 'DEFAULT_PUBLISH',
        skipReview: false,
        blockOnWarnings: true,
      }),
    },
    { retryGet: false, sleep },
  );
  if (publication.itemId !== item || typeof publication.state !== 'string') {
    throw new Error('Chrome Web Store publish response did not identify the submitted item/state');
  }

  return {
    outcome: 'submitted',
    version,
    state: publication.state,
    warnings: publication.warningInfo?.warnings?.length ?? 0,
  };
}

async function main() {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
  );
  const result = await publishChromeWebStore({
    accessToken: process.env.CWS_ACCESS_TOKEN,
    publisherId: process.env.CWS_PUBLISHER_ID,
    extensionId: process.env.CWS_EXTENSION_ID,
    expectedVersion: manifest.version,
    packagePath: process.argv[2] ?? fileURLToPath(new URL('../extension.zip', import.meta.url)),
  });
  console.log(
    `Chrome Web Store release ${result.outcome}: version ${result.version}, state ${result.state}, warnings ${result.warnings ?? 0}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    console.error(`Required OAuth scope: ${CHROMEWEBSTORE_SCOPE}`);
    process.exit(1);
  });
}
