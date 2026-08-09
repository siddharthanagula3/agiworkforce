#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ATTEMPTS = 10;
const RETRY_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'];

/**
 * Probes the production gate runs against a freshly promoted web deployment.
 *
 * The gate used to be `curl /api/health` alone. That route imports
 * `lib/server/health-check` and nothing else, so when the argon2 native module
 * was not traced into the Vercel bundle it kept answering 200 while every route
 * that imports `lib/api-auth` returned 500 — a green gate over a dead site.
 *
 * The authenticated probes are sent WITHOUT credentials on purpose: a route
 * whose module graph resolved refuses with a typed 401 envelope, and a route
 * whose graph failed to load cannot get far enough to refuse.
 */
const PROBES = [
  {
    path: '/api/health',
    expectedStatus: 200,
    // Identity, not health. A 200 already means "not unhealthy" (the route
    // answers 503 otherwise), and `runHealthChecks()` cannot produce a status
    // outside the enum, so this cannot reject our own route. What it does
    // reject is a 200 JSON body that did not come from our health route at
    // all — an edge interstitial, a rewrite, or a URL aimed at another app.
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

/**
 * Vercel Deployment Protection also answers 401, but with an HTML challenge.
 * Requiring the app's own error envelope keeps a protected deployment from
 * reading as a healthy authenticated route.
 */
function assertUnauthorizedEnvelope(body) {
  if (body?.error?.code !== 'UNAUTHORIZED') {
    throw new Error('refused without the application UNAUTHORIZED envelope');
  }
}

/**
 * Validates the one argument this script takes. Every `probe.path` is
 * root-absolute, so `new URL(path, base)` already discards any pathname,
 * search, or hash on the base — there is nothing to strip. The scheme check
 * is here for the CLI entry point, which takes an arbitrary argv value.
 */
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
    // Credentials are deliberately absent — see PROBES.
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
      // Sequential, not Promise.all: the first broken probe is the one worth
      // reporting, and a cold deployment should not be hit three ways at once.
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

async function main() {
  const [baseUrl] = process.argv.slice(2);
  if (!baseUrl) {
    throw new Error('Usage: node scripts/verify-deployment.mjs <deployment-url>');
  }

  const result = await verifyDeployment(baseUrl, {
    onRetry: (attempt, error) => {
      console.warn(`attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
    },
  });
  console.log(`Deployment serving path verified: ${result.baseUrl} (${result.probes.join(', ')})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
