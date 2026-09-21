#!/usr/bin/env node

// Scheduled work is the part of the product nobody is watching when it runs.
// This enumerates every cron route on disk and every schedule in vercel.json
// and proves, for each one, that it authenticates, declares its own ceiling,
// cannot loop without a bound, and does not share a firing minute with another
// route of the same weight.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'scripts/config/cron-contract.json';

export const CRON_DIR = 'apps/web/app/api/cron';

export const VERCEL_CONFIG = 'vercel.json';

const ROUTE_PREFIX = '/api/cron/';

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

export function cronRoutes(repoRoot = REPO_ROOT) {
  const root = path.join(repoRoot, CRON_DIR);
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(path.join(root, entry.name)).includes('route.ts'))
    .map((entry) => entry.name)
    .sort();
}

export function readRoute(repoRoot, name) {
  return readFileSync(path.join(repoRoot, CRON_DIR, name, 'route.ts'), 'utf8');
}

export function registeredCrons(repoRoot = REPO_ROOT) {
  const config = JSON.parse(readFileSync(path.join(repoRoot, VERCEL_CONFIG), 'utf8'));
  return config.crons ?? [];
}

function declaredNumber(source, name) {
  const match = new RegExp(`export const ${name} = (\\d+)`).exec(source);
  return match ? Number(match[1]) : null;
}

function declaredString(source, name) {
  const match = new RegExp(`export const ${name} = '([^']+)'`).exec(source);
  return match ? match[1] : null;
}

/** Every minute of the day a five field expression fires, as "hh:mm". */
export function firingMinutes(schedule) {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour] = fields;
  const expand = (field, max) => {
    const values = new Set();
    for (const part of field.split(',')) {
      const step = part.includes('/') ? Number(part.slice(part.indexOf('/') + 1)) : 1;
      const range = part.includes('/') ? part.slice(0, part.indexOf('/')) : part;
      if (!Number.isFinite(step) || step <= 0) return null;
      if (range === '*') {
        for (let value = 0; value <= max; value += step) values.add(value);
        continue;
      }
      if (range.includes('-')) {
        const [from, to] = range.split('-').map(Number);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        for (let value = from; value <= to; value += step) values.add(value);
        continue;
      }
      const value = Number(range);
      if (!Number.isFinite(value)) return null;
      values.add(value);
    }
    return values;
  };
  const minutes = expand(minute, 59);
  const hours = expand(hour, 23);
  if (minutes === null || hours === null) return null;
  const slots = new Set();
  for (const h of hours)
    for (const m of minutes)
      slots.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  return slots;
}

/** A schedule that names its hours runs a handful of times a day; `*` is a drain. */
export function isFixedHour(schedule) {
  const fields = schedule.trim().split(/\s+/);
  return fields.length === 5 && !fields[1].includes('*');
}

/** Seconds between the two closest firings, wrapping past midnight. */
export function shortestInterval(schedule) {
  const slots = firingMinutes(schedule);
  if (slots === null || slots.size === 0) return null;
  const minutes = [...slots]
    .map((slot) => Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3)))
    .sort((left, right) => left - right);
  if (minutes.length === 1) return 24 * 60 * 60;
  let shortest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < minutes.length; index += 1) {
    const next = index + 1 < minutes.length ? minutes[index + 1] : minutes[0] + 24 * 60;
    shortest = Math.min(shortest, next - minutes[index]);
  }
  return shortest * 60;
}

/** A structured log call, which is the record a run leaves behind. */
export function leavesARecord(source) {
  return /\blogger\s*\.\s*(?:info|warn|error|fatal)\s*\(/.test(source);
}

function checkRouteContract({ repoRoot, routes, contract, errors }) {
  const bounded = new Map((contract.boundedByConstruction ?? []).map((entry) => [entry.id, entry]));
  const ceilings = new Map();

  for (const name of routes) {
    const source = readRoute(repoRoot, name);
    const where = `${CRON_DIR}/${name}/route.ts`;

    if (!source.includes('verifyCronRequest(request)')) {
      errors.push(
        `${where}: does not call verifyCronRequest(request), so anything that can reach the URL ` +
          'can run the job.',
      );
    } else if (!/if \(!verifyCronRequest\(request\)\)/.test(source)) {
      errors.push(
        `${where}: calls verifyCronRequest but does not refuse on a false answer, so the check ` +
          'decides nothing.',
      );
    }
    if (!/status: 401/.test(source)) {
      errors.push(`${where}: never answers 401, so an unauthenticated caller is not turned away.`);
    }

    const runtime = declaredString(source, 'runtime');
    if (runtime === null) {
      errors.push(
        `${where}: declares no runtime, so which runtime it gets, and the ceiling that comes with ` +
          'it, is decided outside this repository.',
      );
    } else if (!contract.allowedRuntimes.includes(runtime)) {
      errors.push(
        `${where}: declares runtime "${runtime}", which ${CONTRACT_PATH} does not allow.`,
      );
    }

    const maxDuration = declaredNumber(source, 'maxDuration');
    if (maxDuration === null) {
      errors.push(
        `${where}: declares no maxDuration. A scheduled job with no ceiling of its own is cut off ` +
          'by whatever the platform default happens to be on the day.',
      );
    } else {
      ceilings.set(name, maxDuration);
      if (maxDuration < contract.minSeconds || maxDuration > contract.maxSeconds) {
        errors.push(
          `${where}: maxDuration is ${maxDuration}, outside the ${contract.minSeconds} to ` +
            `${contract.maxSeconds} second band ${CONTRACT_PATH} declares.`,
        );
      }
    }

    if (!leavesARecord(source)) {
      errors.push(
        `${where}: emits no structured log, so a run that did nothing and a run that never ` +
          'happened are the same from outside.',
      );
    }

    const loops = /\n\s*(?:for|while)\s*\(/.test(source);
    const hasCeiling =
      /\n(?:const|let) [A-Z][A-Z0-9_]*(?:MAX|BATCH|BUDGET|LIMIT|PER_RUN)[A-Z0-9_]* =|\nconst MAX_[A-Z0-9_]+ =/.test(
        source,
      );
    if (loops && !hasCeiling) {
      const entry = bounded.get(name);
      if (!entry) {
        errors.push(
          `${where}: loops without a declared per-run ceiling. Give it one, or record in ` +
            `${CONTRACT_PATH} under boundedByConstruction why the collection it walks is bounded.`,
        );
      } else if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
        errors.push(`${CONTRACT_PATH}: boundedByConstruction entry ${name} carries no reason.`);
      }
    }
    if (!loops && bounded.has(name)) {
      errors.push(
        `${CONTRACT_PATH}: boundedByConstruction still lists ${name}, which no longer loops. ` +
          'Delete the entry.',
      );
    }
  }

  for (const name of bounded.keys()) {
    if (!routes.includes(name)) {
      errors.push(
        `${CONTRACT_PATH}: boundedByConstruction names ${name}, which is not a cron route.`,
      );
    }
  }

  return ceilings;
}

function checkRegistration({ routes, crons, errors }) {
  const scheduled = new Map(crons.map((cron) => [cron.path, cron.schedule]));
  for (const name of routes) {
    if (!scheduled.has(`${ROUTE_PREFIX}${name}`)) {
      errors.push(
        `${VERCEL_CONFIG}: schedules no ${ROUTE_PREFIX}${name}, so the route never runs.`,
      );
    }
  }
  for (const [routePath, schedule] of scheduled) {
    const name = routePath.startsWith(ROUTE_PREFIX) ? routePath.slice(ROUTE_PREFIX.length) : null;
    if (name === null || !routes.includes(name)) {
      errors.push(`${VERCEL_CONFIG}: schedules ${routePath}, which has no route on disk.`);
      continue;
    }
    if (firingMinutes(schedule) === null) {
      errors.push(
        `${VERCEL_CONFIG}: ${routePath} has schedule "${schedule}", which is not a five field expression.`,
      );
    }
  }
  if (new Set(crons.map((cron) => cron.path)).size !== crons.length) {
    errors.push(`${VERCEL_CONFIG}: schedules the same path more than once.`);
  }
}

/**
 * A run that can still be going when the next one starts is two runs over the
 * same rows. Either the schedule leaves room for the ceiling, or the route says
 * what stops the second run touching what the first one holds.
 */
function checkOverlap({ crons, ceilings, contract, errors }) {
  const declared = new Map((contract.overlapSafe ?? []).map((entry) => [entry.id, entry]));
  const found = new Set();

  for (const cron of crons) {
    const name = cron.path.startsWith(ROUTE_PREFIX) ? cron.path.slice(ROUTE_PREFIX.length) : null;
    if (name === null) continue;
    const ceiling = ceilings.get(name);
    const interval = shortestInterval(cron.schedule);
    if (ceiling === undefined || interval === null || interval > ceiling) continue;
    found.add(name);

    const entry = declared.get(name);
    if (!entry) {
      errors.push(
        `${CRON_DIR}/${name}/route.ts: fires every ${interval}s and may run for ${ceiling}s, so a ` +
          'slow run is still going when the next one starts. Lengthen the schedule, lower ' +
          `maxDuration, or record in ${CONTRACT_PATH} under overlapSafe what stops the second run ` +
          'touching what the first one holds.',
      );
      continue;
    }
    if (typeof entry.mechanism !== 'string' || entry.mechanism.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: overlapSafe entry ${name} names no mechanism.`);
    }
  }

  for (const id of declared.keys()) {
    if (found.has(id)) continue;
    errors.push(
      `${CONTRACT_PATH}: overlapSafe still lists ${id}, whose schedule now leaves room for its ` +
        'ceiling. Delete the entry.',
    );
  }
}

function checkCollisions({ crons, ceilings, contract, errors }) {
  const declared = new Map((contract.allowedCollisions ?? []).map((entry) => [entry.id, entry]));
  const heavy = crons
    .map((cron) => ({
      name: cron.path.slice(ROUTE_PREFIX.length),
      schedule: cron.schedule,
      slots: firingMinutes(cron.schedule),
    }))
    .filter(
      (cron) =>
        cron.slots !== null &&
        isFixedHour(cron.schedule) &&
        (ceilings.get(cron.name) ?? 0) >= contract.heavySeconds,
    );

  const found = new Set();
  for (let left = 0; left < heavy.length; left += 1) {
    for (let right = left + 1; right < heavy.length; right += 1) {
      const shared = [...heavy[left].slots].filter((slot) => heavy[right].slots.has(slot));
      if (shared.length === 0) continue;
      found.add([heavy[left].name, heavy[right].name].sort().join(' + '));
    }
  }

  for (const id of found) {
    const entry = declared.get(id);
    if (!entry) {
      errors.push(
        `${VERCEL_CONFIG}: ${id} are both long-running and fire in the same minute every day, so ` +
          'they compete for the same database at the same moment. Move one, or record it in ' +
          `${CONTRACT_PATH} under allowedCollisions with the reason.`,
      );
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: allowedCollisions entry ${id} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: allowedCollisions entry ${id} names no fix.`);
    }
  }
  for (const id of declared.keys()) {
    if (!found.has(id)) {
      errors.push(
        `${CONTRACT_PATH}: allowedCollisions still lists ${id}, which no longer collides. Delete ` +
          'the entry so the baseline cannot grow back.',
      );
    }
  }
}

export function checkCronContract(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const routes = cronRoutes(repoRoot);

  if (routes.length === 0) {
    return {
      errors: [`${CRON_DIR}: no cron routes were read, so nothing below was measured.`],
      report: { routes: 0, scheduled: 0 },
    };
  }

  let crons;
  try {
    crons = registeredCrons(repoRoot);
  } catch (error) {
    return {
      errors: [`${VERCEL_CONFIG}: could not be read (${String(error)}).`],
      report: { routes: routes.length, scheduled: 0 },
    };
  }

  const ceilings = checkRouteContract({ repoRoot, routes, contract, errors });
  checkRegistration({ routes, crons, errors });
  checkOverlap({ crons, ceilings, contract, errors });
  checkCollisions({ crons, ceilings, contract, errors });

  return { errors, report: { routes: routes.length, scheduled: crons.length } };
}

function main() {
  const { errors, report } = checkCronContract(REPO_ROOT);
  if (errors.length > 0) {
    console.error('Cron contract check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`check-cron-contract: OK (${report.routes} routes, ${report.scheduled} schedules)`);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
