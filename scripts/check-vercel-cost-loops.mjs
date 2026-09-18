#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VERCEL_CONFIG = 'vercel.json';
const API_ROOT = 'apps/web/app/api';

// Every way a function can address the deployment it is already running in.
// A fetch to one of these pays for a second invocation of the same project, and
// when the target reaches the caller again nothing stops it.
const SELF_ORIGIN = [
  /NEXT_PUBLIC_APP_URL/,
  /\bVERCEL_URL\b/,
  /\bVERCEL_BRANCH_URL\b/,
  /\bVERCEL_PROJECT_PRODUCTION_URL\b/,
  /nextUrl\s*\.\s*origin/,
  /new\s+URL\s*\(\s*request\s*\.\s*url\s*\)\s*\.\s*origin/,
];

const EVERY_MINUTE = /^\s*\*(?:\/1)?\s+\*\s+\*\s+\*\s+\*\s*$/;

function routeFiles(root) {
  const base = path.join(root, API_ROOT);
  if (!fs.existsSync(base)) return [];
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(child);
        continue;
      }
      if (entry.name === 'route.ts' || entry.name === 'route.tsx') found.push(child);
    }
  };
  walk(base);
  return found.sort();
}

// The negative lookbehind keeps the // in an https:// URL out of the comment
// rule, which otherwise swallowed the rest of the line the fetch was on.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/[^\n]*/g, ' ');
}

export function fetchArguments(source) {
  const args = [];
  const pattern = /\bfetch\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      index += 1;
    }
    args.push(source.slice(start, index - 1));
  }
  return args;
}

export function selfInvokingRoutes(root) {
  const failures = [];
  for (const file of routeFiles(root)) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    for (const argument of fetchArguments(source)) {
      const self = SELF_ORIGIN.find((pattern) => pattern.test(argument));
      if (!self) continue;
      failures.push(
        `${path.relative(root, file)} fetches its own deployment origin. A function that calls ` +
          `the host it is running on bills a second invocation for the same work, and a webhook ` +
          `or cron that reaches itself does not stop. Call the handler directly instead.`,
      );
      break;
    }
  }
  return failures;
}

export function cronScheduleFailures(root) {
  const configPath = path.join(root, VERCEL_CONFIG);
  if (!fs.existsSync(configPath)) return [`${VERCEL_CONFIG} does not exist.`];

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const crons = Array.isArray(config.crons) ? config.crons : [];
  const failures = [];
  const seen = new Map();

  for (const cron of crons) {
    const cronPath = typeof cron?.path === 'string' ? cron.path : '';
    const schedule = typeof cron?.schedule === 'string' ? cron.schedule : '';
    if (cronPath === '' || schedule === '') {
      failures.push(`${VERCEL_CONFIG} has a cron entry with no path or no schedule.`);
      continue;
    }
    seen.set(cronPath, (seen.get(cronPath) ?? 0) + 1);
    if (EVERY_MINUTE.test(schedule)) {
      failures.push(
        `${VERCEL_CONFIG} schedules ${cronPath} every minute. A run that takes longer than a ` +
          `minute overlaps the next one and the two compete over the same rows. Widen the ` +
          `schedule, or make the handler claim its work under a lease first.`,
      );
    }
  }

  for (const [cronPath, count] of seen) {
    if (count > 1) {
      failures.push(
        `${VERCEL_CONFIG} schedules ${cronPath} ${count} times. Each entry is billed and run ` +
          `separately. Keep one.`,
      );
    }
  }

  return failures;
}

export function vercelCostLoops(root) {
  return [...selfInvokingRoutes(root), ...cronScheduleFailures(root)];
}

function main() {
  const failures = vercelCostLoops(process.cwd());
  if (failures.length > 0) {
    console.error('Vercel cost loop check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Vercel cost loop check passed.');
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const realpath = (value) => {
    try {
      return fs.realpathSync(value);
    } catch {
      return value;
    }
  };
  return realpath(fileURLToPath(import.meta.url)) === realpath(path.resolve(entry));
}

if (isEntryPoint()) main();
