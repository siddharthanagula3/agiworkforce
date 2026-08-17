#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ATTEMPTS = 10;
const RETRY_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'];
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

const PROBES = [
  {
    path: '/api/health',
    expectedStatus: 200,
    assertBody(body) {
      const isHealthContract =
        HEALTH_STATUSES.includes(body?.status) &&
        !!body?.checks?.database &&
        !!body?.checks?.environment;
      if (!isHealthContract) {
        throw new Error('returned a 200 that is not this app’s health-check contract');
      }
    },
  },
  {
    path: '/api/me',
    expectedStatus: 401,
    assertBody: assertUnauthorizedEnvelope,
  },
  {
    path: '/api/usage',
    expectedStatus: 401,
    assertBody: assertUnauthorizedEnvelope,
  },
];

function assertUnauthorizedEnvelope(body) {
  if (body?.error?.code !== 'UNAUTHORIZED') {
    throw new Error('refused without the application UNAUTHORIZED envelope');
  }
}

function parseDeploymentUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Deployment URL must use http or https');
  }
  return url;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runProbe(baseUrl, probe) {
  const response = await fetch(new URL(probe.path, baseUrl), {
    headers: { accept: 'application/json', 'x-request-id': `deploy-${randomUUID()}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status !== probe.expectedStatus) {
    throw new Error(`${probe.path} returned ${response.status}, expected ${probe.expectedStatus}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${probe.path} returned ${response.status} with a non-JSON body`);
  }

  try {
    probe.assertBody(body);
  } catch (error) {
    throw new Error(`${probe.path} ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function verifyDeployment(rawBaseUrl, options = {}) {
  const { attempts = ATTEMPTS, retryDelayMs = RETRY_DELAY_MS, onRetry = () => {} } = options;
  const baseUrl = parseDeploymentUrl(rawBaseUrl);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      for (const probe of PROBES) {
        await runProbe(baseUrl, probe);
      }
      return { baseUrl: baseUrl.href, probes: PROBES.map((probe) => probe.path) };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        onRetry(attempt, error);
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError;
}

function normalizeSha(value) {
  const sha = String(value ?? '')
    .trim()
    .toLowerCase();
  return SHA_PATTERN.test(sha) ? sha : null;
}

// Env-supplied SHAs are sometimes abbreviated, so compare on the shorter prefix.
function sameCommit(deployed, expected) {
  const length = Math.min(deployed.length, expected.length);
  return deployed.slice(0, length) === expected.slice(0, length);
}

// Drift is a durable fact about which build is promoted; retrying it only
// delays the alarm. Only transport and 5xx failures are worth another attempt.
function settled(message) {
  const error = new Error(message);
  error.retryable = false;
  return error;
}

async function readDeployedCommit(baseUrl) {
  const response = await fetch(new URL('/api/version', baseUrl), {
    headers: { accept: 'application/json', 'x-request-id': `drift-${randomUUID()}` },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw settled(
      `${baseUrl.origin} does not serve /api/version, so the promoted build predates the ` +
        'route that reports it; production is behind main',
    );
  }
  if (response.status !== 200) {
    throw new Error(`${baseUrl.origin}/api/version returned ${response.status}, expected 200`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw settled(`${baseUrl.origin}/api/version returned a non-JSON body`);
  }

  const deployed = normalizeSha(body?.commit);
  if (!deployed) {
    throw settled(
      `${baseUrl.origin}/api/version reported no deployed commit (got ${JSON.stringify(
        body?.commit ?? null,
      )}); the build was promoted without git metadata`,
    );
  }
  return deployed;
}

export async function verifyDeployedCommit(rawBaseUrl, rawExpectedSha, options = {}) {
  const { attempts = 3, retryDelayMs = RETRY_DELAY_MS, onRetry = () => {} } = options;
  const baseUrl = parseDeploymentUrl(rawBaseUrl);
  const expected = normalizeSha(rawExpectedSha);
  if (!expected) {
    throw new Error(`Expected commit ${JSON.stringify(rawExpectedSha ?? null)} is not a git SHA`);
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const deployed = await readDeployedCommit(baseUrl);
      if (!sameCommit(deployed, expected)) {
        throw settled(
          `${baseUrl.origin} is serving commit ${deployed}, but main is at ${expected}; ` +
            'the promotion did not happen',
        );
      }
      return { baseUrl: baseUrl.href, deployedCommit: deployed, expectedCommit: expected };
    } catch (error) {
      if (error?.retryable === false) throw error;
      lastError = error;
      if (attempt < attempts) {
        onRetry(attempt, error);
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError;
}

async function main() {
  const [baseUrl, expectedSha] = process.argv.slice(2);
  if (!baseUrl) {
    throw new Error(
      'Usage: node scripts/verify-deployment.mjs <deployment-url> [expected-commit-sha]',
    );
  }

  const onRetry = (attempt, error) => {
    console.warn(`attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
  };

  const result = await verifyDeployment(baseUrl, { onRetry });
  console.log(`Deployment serving path verified: ${result.baseUrl} (${result.probes.join(', ')})`);

  if (expectedSha) {
    const drift = await verifyDeployedCommit(baseUrl, expectedSha, { onRetry });
    console.log(`Deployed commit verified: ${drift.deployedCommit}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
