#!/usr/bin/env node
// Rolls production back to the last healthy deployment without building
// anything, and appends the act to the release audit trail. Independent of the
// run that deployed: it needs only a Vercel token and the database URL.

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client } from 'pg';

import { missingEnvironment, reportNotRun } from '../lib/ci-prerequisites.mjs';

const API_ORIGIN = 'https://api.vercel.com';
const DEPLOYMENT_PAGE_SIZE = 20;
const REQUIRED_ENVIRONMENT = ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'];
const ROLLBACK_FLOOR_PATH = fileURLToPath(
  new URL('../config/rollback-floor.json', import.meta.url),
);

export class RollbackError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'RollbackError';
    this.details = details;
  }
}

export function parseArguments(argv) {
  const options = { dryRun: false, drill: false, to: null, reason: null, runUrl: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--drill') {
      options.drill = true;
      options.dryRun = true;
    } else if (argument === '--to') options.to = argv[++index] ?? null;
    else if (argument === '--reason') options.reason = argv[++index] ?? null;
    else if (argument === '--run-url') options.runUrl = argv[++index] ?? null;
    else throw new RollbackError(`Unknown argument ${argument}`);
  }
  if (!options.drill && !options.reason?.trim()) {
    throw new RollbackError('A rollback requires --reason; it is what the audit trail records');
  }
  return options;
}

export function readEnvironment(env) {
  const missing = missingEnvironment(REQUIRED_ENVIRONMENT, env);
  if (missing.length > 0) {
    throw new RollbackError('The rollback path is not configured', missing);
  }
  return {
    token: env.VERCEL_TOKEN.trim(),
    orgId: env.VERCEL_ORG_ID.trim(),
    projectId: env.VERCEL_PROJECT_ID.trim(),
    databaseUrl: env.AGI_DATABASE_URL?.trim() ?? null,
    actor: env.GITHUB_ACTOR?.trim() || 'unknown',
  };
}

// Only a team scope is a valid teamId; a personal account has none.
export function teamQuery(orgId) {
  const query = new URLSearchParams();
  if (orgId.startsWith('team_')) query.set('teamId', orgId);
  return query;
}

async function readJson(response, what) {
  if (!response.ok) {
    throw new RollbackError(`${what} returned ${response.status}`);
  }
  return response.json();
}

export async function readProductionTarget(fetchImpl, config) {
  const query = teamQuery(config.orgId);
  const body = await readJson(
    await fetchImpl(`${API_ORIGIN}/v9/projects/${encodeURIComponent(config.projectId)}?${query}`, {
      headers: { authorization: `Bearer ${config.token}` },
    }),
    'Vercel project lookup',
  );
  return body?.targets?.production ?? null;
}

export async function listProductionDeployments(fetchImpl, config) {
  const query = teamQuery(config.orgId);
  query.set('projectId', config.projectId);
  query.set('target', 'production');
  query.set('state', 'READY');
  query.set('limit', String(DEPLOYMENT_PAGE_SIZE));
  const body = await readJson(
    await fetchImpl(`${API_ORIGIN}/v6/deployments?${query}`, {
      headers: { authorization: `Bearer ${config.token}` },
    }),
    'Vercel deployment listing',
  );
  return Array.isArray(body?.deployments) ? body.deployments : [];
}

const MAX_EPOCH_MILLISECONDS = 8.64e15;

function parseCreatedAt(value) {
  if (Number.isSafeInteger(value) && value > 0 && value <= MAX_EPOCH_MILLISECONDS) return value;
  return null;
}

// The oldest web deployment production may be rolled back to. It is recorded in
// scripts/config/rollback-floor.json by the deploy that first carries a stored
// size check, and a file that cannot be read as that record stops the rollback
// instead of being treated as "no floor". createdAt is epoch milliseconds, the
// provider's own unit; chooseRollbackTarget checks it against the listing.
export function parseRollbackFloor(document) {
  const web = document?.web;
  if (web === null) return null;
  const createdAt = parseCreatedAt(web?.createdAt);
  if (
    typeof web?.deploymentId !== 'string' ||
    web.deploymentId.trim() === '' ||
    typeof web?.reason !== 'string' ||
    web.reason.trim() === '' ||
    createdAt === null
  ) {
    throw new RollbackError(
      'scripts/config/rollback-floor.json must hold {"web": null} or {"web": {"deploymentId", "createdAt", "reason"}}',
    );
  }
  return { deploymentId: web.deploymentId.trim(), createdAt, reason: web.reason.trim() };
}

export function readRollbackFloor(path = ROLLBACK_FLOOR_PATH) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new RollbackError(
      `The rollback floor could not be read from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseRollbackFloor(document);
}

export function describeRollbackFloor(floor) {
  return floor
    ? `rollback floor ${floor.deploymentId} created ${new Date(floor.createdAt).toISOString()} (${floor.reason})`
    : 'no rollback floor recorded';
}

function belowFloor(deployment, floor) {
  return floor !== null && !(Number(deployment.createdAt) >= floor.createdAt);
}

function floorRefusal(subject, floor) {
  return new RollbackError(
    `${subject} was created before the rollback floor ${floor.deploymentId}: ${floor.reason}. Production is never rolled back below it.`,
  );
}

// The newest READY production deployment created before the one serving now.
// "Newest ready" alone is wrong after a previous rollback: the build that was
// rolled back away from stays READY and is newer than the one now serving.
export function chooseRollbackTarget(current, deployments, requestedId = null, floor = null) {
  const identify = (deployment) => deployment?.uid ?? deployment?.id ?? null;
  const ready = deployments.filter(
    (deployment) => identify(deployment) !== null && deployment.readyState === 'READY',
  );

  if (floor !== null) {
    const listedFloor = deployments.find(
      (deployment) => identify(deployment) === floor.deploymentId,
    );
    if (listedFloor && Number(listedFloor.createdAt) !== floor.createdAt) {
      throw new RollbackError(
        `The rollback floor ${floor.deploymentId} is recorded as created at ${floor.createdAt} but the provider reports ${listedFloor.createdAt}. Fix scripts/config/rollback-floor.json before rolling back.`,
      );
    }
  }

  if (requestedId) {
    const match = ready.find((deployment) => identify(deployment) === requestedId);
    if (!match) {
      throw new RollbackError(
        `${requestedId} is not a ready production deployment of this project`,
      );
    }
    if (current && identify(match) === current.id) {
      throw new RollbackError('That deployment is the one already serving production');
    }
    if (belowFloor(match, floor)) throw floorRefusal(requestedId, floor);
    return match;
  }

  if (!current?.id) {
    throw new RollbackError('The project has no production target, so there is nothing to undo');
  }
  const olderThanCurrent = ready
    .filter((deployment) => identify(deployment) !== current.id)
    .filter((deployment) => Number(deployment.createdAt ?? 0) < Number(current.createdAt ?? 0))
    .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));

  const target = olderThanCurrent.find((deployment) => !belowFloor(deployment, floor));
  if (!target) {
    if (olderThanCurrent.length > 0) {
      throw new RollbackError(
        `Every earlier ready production deployment was created before the rollback floor ${floor.deploymentId}: ${floor.reason}. Production is never rolled back below it.`,
      );
    }
    throw new RollbackError('No earlier ready production deployment exists to roll back to');
  }
  return target;
}

export async function requestRollback(fetchImpl, config, deploymentId, description) {
  const query = teamQuery(config.orgId);
  if (description) query.set('description', description);
  const response = await fetchImpl(
    `${API_ORIGIN}/v1/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(deploymentId)}?${query}`,
    { method: 'POST', headers: { authorization: `Bearer ${config.token}` } },
  );
  if (!response.ok) {
    throw new RollbackError(`Vercel rollback returned ${response.status}`);
  }
  return true;
}

export async function appendReleaseEvent(client, event) {
  const result = await client.query(
    `select id, entry_hash, previous_hash, recorded_at
       from public.append_release_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      event.event,
      event.surface,
      event.environment,
      event.outcome,
      event.actor,
      event.source,
      event.commitSha ?? null,
      event.deploymentId ?? null,
      event.previousDeploymentId ?? null,
      event.reason ?? null,
      event.runUrl ?? null,
      JSON.stringify(event.detail ?? {}),
    ],
  );
  return result.rows[0];
}

async function recordEvent(config, event) {
  if (!config.databaseUrl) {
    console.warn('WARNING: AGI_DATABASE_URL is unset; the release audit trail was not written');
    return null;
  }
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: 'agiworkforce-release-rollback',
  });
  await client.connect();
  try {
    return await appendReleaseEvent(client, event);
  } finally {
    await client.end();
  }
}

export async function runRollback({
  argv,
  env,
  fetchImpl = fetch,
  recordEventImpl = recordEvent,
  report = reportNotRun,
  readFloor = readRollbackFloor,
}) {
  const options = parseArguments(argv);
  const missing = missingEnvironment(REQUIRED_ENVIRONMENT, env);
  if (options.drill && missing.length > 0) {
    report(
      {
        title: 'Rollback drill',
        reason: `Missing repository secrets: ${missing.join(', ')}. No rollback target was resolved.`,
        unblockedBy: `Add the repository secrets ${missing.join(', ')} and rerun Recovery Drills.`,
        flawId: 'CI-ROLLBACK-DRILL-CONFIG-MISSING-01',
      },
      { env },
    );
    return { rolledBack: false, notRun: true, missing };
  }
  const config = readEnvironment(env);
  const floor = readFloor();

  const current = await readProductionTarget(fetchImpl, config);
  const deployments = await listProductionDeployments(fetchImpl, config);
  const target = chooseRollbackTarget(current, deployments, options.to, floor);
  const targetId = target.uid ?? target.id;

  if (options.dryRun) {
    console.log(
      `resolved rollback target ${targetId} (currently serving ${current?.id ?? 'nothing'}; ${describeRollbackFloor(floor)})`,
    );
    if (options.drill) {
      await recordEventImpl(config, {
        event: 'rollback_drill',
        surface: 'web',
        environment: 'production',
        outcome: 'succeeded',
        actor: config.actor,
        source: 'rollback_workflow',
        commitSha: null,
        deploymentId: targetId,
        previousDeploymentId: current?.id ?? null,
        reason: options.reason,
        runUrl: options.runUrl,
        detail: {
          resolvedWithoutActing: true,
          readyProductionDeployments: deployments.length,
          rollbackFloor: floor,
        },
      });
    }
    return { rolledBack: false, targetId, currentId: current?.id ?? null };
  }

  await requestRollback(fetchImpl, config, targetId, options.reason);
  console.log(`production rolled back from ${current?.id ?? 'nothing'} to ${targetId}`);
  let auditRecorded = true;
  try {
    const row = await recordEventImpl(config, {
      event: 'rolled_back',
      surface: 'web',
      environment: 'production',
      outcome: 'succeeded',
      actor: config.actor,
      source: 'rollback_workflow',
      commitSha:
        typeof target.meta?.githubCommitSha === 'string' ? target.meta.githubCommitSha : null,
      deploymentId: targetId,
      previousDeploymentId: current?.id ?? null,
      reason: options.reason,
      runUrl: options.runUrl,
      detail: { requested: options.to ?? null },
    });
    auditRecorded = row !== null;
  } catch (error) {
    auditRecorded = false;
    console.warn(
      `::warning::Production was rolled back to ${targetId}, but the release audit trail was not written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { rolledBack: true, auditRecorded, targetId, currentId: current?.id ?? null };
}

async function main() {
  try {
    await runRollback({ argv: process.argv.slice(2), env: process.env });
    return 0;
  } catch (error) {
    if (error instanceof RollbackError) {
      console.error(`ERROR: ${error.message}`);
      for (const detail of error.details) console.error(`- ${detail}`);
      return 1;
    }
    throw error;
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await main();
