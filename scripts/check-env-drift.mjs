#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { contracts } from './env-doctor.mjs';

const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const PAGER_TIMEOUT_MS = 5000;
const TARGETS = ['production', 'preview', 'development'];

export function declaredContract(scope, target) {
  const contract = contracts[scope];
  if (!contract) throw new Error(`Unknown scope: ${scope}`);
  const mode = target === 'production' ? 'production' : 'development';
  return {
    required: contract.required?.[mode] ?? [],
    groups: contract.requiredGroups?.[mode] ?? [],
    forbidden:
      target === 'production'
        ? [
            ...(contract.productionForbiddenKeys ?? []),
            ...Object.keys(contract.productionForbiddenValues ?? {}),
          ]
        : [],
  };
}

export function compareEnvKeys({ required = [], groups = [], forbidden = [], present = [] }) {
  const configured = new Set(present);
  return {
    missing: required.filter((name) => !configured.has(name)),
    unsatisfiedGroups: groups.filter((group) => !group.some((name) => configured.has(name))),
    forbiddenPresent: forbidden.filter((name) => configured.has(name)),
  };
}

export function hasDrift(drift) {
  return (
    drift.missing.length > 0 ||
    drift.unsatisfiedGroups.length > 0 ||
    drift.forbiddenPresent.length > 0
  );
}

export function formatDrift(scope, target, drift) {
  const lines = [
    ...drift.missing.map((name) => `missing required ${name}`),
    ...drift.unsatisfiedGroups.map((group) => `missing one of ${group.join(' / ')}`),
    ...drift.forbiddenPresent.map((name) => `escape hatch ${name} is configured`),
  ];
  return [`${scope} ${target} drifted from the declared environment contract:`]
    .concat(lines.map((line) => `- ${line}`))
    .join('\n');
}

export async function fetchProjectEnvKeys({
  token,
  projectId,
  orgId,
  target,
  fetchImpl = globalThis.fetch,
}) {
  const query = new URLSearchParams({ decrypt: 'false' });
  if (orgId?.startsWith('team_')) query.set('teamId', orgId);

  const response = await fetchImpl(
    `${VERCEL_API_ORIGIN}/v10/projects/${encodeURIComponent(projectId)}/env?${query}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(
      `Vercel environment listing returned ${response.status}; cannot reconcile ${target}`,
    );
  }

  const body = await response.json();
  const entries = Array.isArray(body) ? body : (body?.envs ?? []);
  const keys = new Set();
  for (const entry of entries) {
    if (typeof entry?.key !== 'string' || entry.gitBranch) continue;
    const entryTargets = Array.isArray(entry.target) ? entry.target : [entry.target];
    if (entryTargets.includes(target)) keys.add(entry.key);
  }
  return [...keys].sort();
}

export async function pageOnDrift({ webhook, subject, text, fetchImpl = globalThis.fetch }) {
  if (!webhook) return 'unconfigured';
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ severity: 'critical', subject, text, source: 'env-drift' }),
      signal: AbortSignal.timeout(PAGER_TIMEOUT_MS),
    });
    return response.ok ? 'paged' : 'failed';
  } catch {
    return 'failed';
  }
}

function parseArgs(argv) {
  const options = { scope: 'web', target: 'production' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--scope') options.scope = argv[++index];
    else if (argument === '--target') options.target = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!contracts[options.scope]) throw new Error(`Unknown scope: ${options.scope}`);
  if (!TARGETS.includes(options.target)) throw new Error(`Unknown target: ${options.target}`);
  return options;
}

export async function run(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const { fetchImpl = globalThis.fetch } = deps;
  const options = parseArgs(argv);

  const missingCredentials = ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'].filter((name) => !env[name]);
  if (missingCredentials.length > 0) {
    console.error(`Cannot reconcile ${options.target}: ${missingCredentials.join(', ')} unset`);
    return 1;
  }

  let present;
  try {
    present = await fetchProjectEnvKeys({
      token: env.VERCEL_TOKEN,
      projectId: env.VERCEL_PROJECT_ID,
      orgId: env.VERCEL_ORG_ID,
      target: options.target,
      fetchImpl,
    });
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const drift = compareEnvKeys({ ...declaredContract(options.scope, options.target), present });
  if (!hasDrift(drift)) {
    console.log(
      `${options.scope} ${options.target}: ${present.length} variables configured, contract satisfied`,
    );
    return 0;
  }

  const report = formatDrift(options.scope, options.target, drift);
  console.error(report);

  const paged = await pageOnDrift({
    webhook: env.PAGER_WEBHOOK_URL,
    subject: `Environment drift in ${options.scope} ${options.target}`,
    text: report,
    fetchImpl,
  });
  if (paged === 'unconfigured') {
    console.error('PAGER_WEBHOOK_URL is unset; this drift reached the job log and nothing else');
  }
  if (paged === 'failed') console.error('Pager webhook could not be reached');
  return 1;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await run();
