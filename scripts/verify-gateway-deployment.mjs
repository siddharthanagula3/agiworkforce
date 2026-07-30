#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Gateway URL must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'x-request-id': `deploy-${randomUUID()}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const requestId = response.headers.get('x-request-id');
  const body = await response.json();
  return { response, requestId, body };
}

async function waitForHealthy(baseUrl, expectedRelease) {
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const health = await fetchJson(new URL('/health', baseUrl));
      if (!health.response.ok) throw new Error(`/health returned ${health.response.status}`);
      if (!health.requestId) throw new Error('/health omitted x-request-id');
      if (health.body.status !== 'ok' || health.body.service !== 'api-gateway') {
        throw new Error('/health returned an invalid service contract');
      }
      if (health.body.release !== expectedRelease) {
        throw new Error(
          `/health release ${JSON.stringify(health.body.release)} does not match ${expectedRelease}`,
        );
      }

      const ready = await fetchJson(new URL('/ready', baseUrl));
      if (!ready.response.ok) throw new Error(`/ready returned ${ready.response.status}`);
      if (!ready.requestId || ready.body.requestId !== ready.requestId) {
        throw new Error('/ready request-id contract is inconsistent');
      }
      if (ready.body.status !== 'ready' || ready.body.service !== 'api-gateway') {
        throw new Error('/ready returned an invalid service contract');
      }

      return;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await delay(RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function verifyWebSocket(baseUrl) {
  const websocketUrl = new URL('/ws', baseUrl);
  websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('WebSocket upgrade timed out'));
    }, REQUEST_TIMEOUT_MS);

    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        socket.close(1000, 'deployment probe complete');
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket upgrade failed'));
      },
      { once: true },
    );
  });
}

export async function verifyGatewayDeployment(rawBaseUrl, expectedRelease) {
  if (!expectedRelease?.trim()) throw new Error('Expected release SHA is required');
  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  await waitForHealthy(baseUrl, expectedRelease);
  await verifyWebSocket(baseUrl);
  return { baseUrl: baseUrl.href, release: expectedRelease };
}

async function main() {
  const [baseUrl, expectedRelease] = process.argv.slice(2);
  if (!baseUrl || !expectedRelease) {
    throw new Error(
      'Usage: node scripts/verify-gateway-deployment.mjs <base-url> <expected-release-sha>',
    );
  }

  const result = await verifyGatewayDeployment(baseUrl, expectedRelease);
  console.log(`Gateway deployment verified: ${result.baseUrl} release=${result.release}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
