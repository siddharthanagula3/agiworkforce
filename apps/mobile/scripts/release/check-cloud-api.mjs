#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS_ACCEPTANCE_PATH } from '../../../../packages/contracts/cloud-contracts/src/terms-acceptance.ts';
import { FREE_QUOTA_CATALOGUE_PATH } from '../../../../packages/contracts/cloud-contracts/src/free-quota.ts';

const REQUIRED_ROUTES = [
  { label: 'Terms status', path: TERMS_ACCEPTANCE_PATH },
  { label: 'provider-funded Free catalogue', path: FREE_QUOTA_CATALOGUE_PATH },
];

export async function checkCloudApi({
  baseUrl = process.env.EXPO_PUBLIC_API_URL,
  fetchImpl = fetch,
} = {}) {
  if (!baseUrl) throw new Error('Set EXPO_PUBLIC_API_URL to the release build Cloud API origin.');
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:') throw new Error('Mobile Cloud API must use HTTPS.');
  const outcomes = await Promise.all(
    REQUIRED_ROUTES.map(async ({ label, path }) => {
      const url = new URL(path, origin);
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'manual',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status !== 401) {
          return {
            label,
            status: response.status,
            error: `${label} returned HTTP ${response.status} without a session; expected HTTP 401`,
          };
        }
        const contentType = response.headers?.get('content-type') ?? '';
        const body = await response.json?.().catch(() => null);
        const routeAnswered =
          contentType.includes('application/json') &&
          typeof body?.error?.code === 'string' &&
          typeof body?.requestId === 'string';
        return routeAnswered
          ? { label, status: response.status, error: null }
          : {
              label,
              status: response.status,
              error: `${label} returned HTTP 401 without the AGI API error envelope`,
            };
      } catch {
        return { label, status: null, error: `${label} could not be reached` };
      }
    }),
  );
  const failures = outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : []));
  if (failures.length > 0) throw new Error(failures.join('\n'));
  return outcomes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outcomes = await checkCloudApi();
    for (const { label, status } of outcomes) {
      process.stdout.write(`${label}: HTTP ${status}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Cloud API check failed'}\n`);
    process.exitCode = 1;
  }
}
