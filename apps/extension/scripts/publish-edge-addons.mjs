#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API_ORIGIN = 'https://api.addons.microsoftedge.microsoft.com';
const MAX_STATUS_POLLS = 24;
const STATUS_POLL_INTERVAL_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 4_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function required(value, name, pattern) {
  const trimmed = value?.trim();
  if (!trimmed || (pattern && !pattern.test(trimmed))) {
    throw new Error(`${name} is missing or malformed`);
  }
  return trimmed;
}

function operationIdFrom(response, step) {
  const location = response.headers.get('location')?.trim();
  const operationId = location?.split('/').filter(Boolean).pop();
  if (!operationId) throw new Error(`Edge Add-ons ${step} returned no operation id`);
  return operationId;
}

async function failure(response, step) {
  const text = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
  return new Error(`Edge Add-ons ${step} returned HTTP ${response.status}: ${text}`);
}

async function waitForOperation({ fetchImpl, url, headers, sleep, step }) {
  for (let attempt = 1; attempt <= MAX_STATUS_POLLS; attempt += 1) {
    if (attempt > 1) await sleep(STATUS_POLL_INTERVAL_MS);
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (response.status === 429 || response.status >= 500) continue;
    if (!response.ok) throw await failure(response, `${step} status`);
    const status = await response.json();
    if (status.status === 'Succeeded') return status;
    if (status.status === 'Failed') {
      const detail = [status.errorCode, status.message, ...(status.errors ?? []).map(String)]
        .filter(Boolean)
        .join('; ');
      throw new Error(`Edge Add-ons ${step} failed: ${detail}`);
    }
  }
  throw new Error(`Edge Add-ons ${step} did not finish within two minutes`);
}

export async function publishEdgeAddons({
  apiKey,
  clientId,
  productId,
  notes,
  packagePath,
  packageBytes,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const key = required(apiKey, 'EDGE_API_KEY');
  const client = required(clientId, 'EDGE_CLIENT_ID', GUID);
  const product = required(productId, 'EDGE_PRODUCT_ID', GUID);
  const bytes = packageBytes ?? fs.readFileSync(path.resolve(packagePath));
  if (bytes.length === 0) throw new Error('Edge Add-ons package is empty');

  const headers = { Authorization: `ApiKey ${key}`, 'X-ClientID': client };
  const productUrl = `${API_ORIGIN}/v1/products/${product}/submissions`;

  const upload = await fetchImpl(`${productUrl}/draft/package`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (upload.status !== 202) throw await failure(upload, 'package upload');
  const uploadOperation = operationIdFrom(upload, 'package upload');
  await waitForOperation({
    fetchImpl,
    url: `${productUrl}/draft/package/operations/${uploadOperation}`,
    headers,
    sleep,
    step: 'package upload',
  });

  const publish = await fetchImpl(productUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/plain' },
    body: notes ?? '',
    signal: AbortSignal.timeout(30_000),
  });
  if (publish.status !== 202) throw await failure(publish, 'publish');
  const publishOperation = operationIdFrom(publish, 'publish');
  const result = await waitForOperation({
    fetchImpl,
    url: `${productUrl}/operations/${publishOperation}`,
    headers,
    sleep,
    step: 'publish',
  });
  return { outcome: 'submitted', message: result.message ?? '' };
}

async function main() {
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
  );
  const result = await publishEdgeAddons({
    apiKey: process.env.EDGE_API_KEY,
    clientId: process.env.EDGE_CLIENT_ID,
    productId: process.env.EDGE_PRODUCT_ID,
    notes: process.env.EDGE_CERTIFICATION_NOTES ?? `AGI Workforce ${manifest.version}`,
    packagePath: process.argv[2] ?? fileURLToPath(new URL('../extension.zip', import.meta.url)),
  });
  console.log(`Edge Add-ons release ${result.outcome}: ${result.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}
