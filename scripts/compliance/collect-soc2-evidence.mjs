#!/usr/bin/env node
// Every command this runs is a list, get, view or audit. A collector that needs
// a CLI or credential it does not have reports itself unavailable with the
// reason, so a partial pack is still a pack and never a crash.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { ROOT_CHAIN, inventory as guardInventory } from '../check-guard-inventory.mjs';
import { APPLIED_STATE_PATH } from '../check-migration-dependencies.mjs';
import { readConstantObject } from '../check-policy-versions.mjs';
import {
  PAGE as SUBPROCESSOR_PAGE,
  declaredProviderIds,
  recipientNames,
} from '../check-subprocessor-coverage.mjs';
import { DEFAULT_MIGRATIONS_DIR, loadMigrationInventory } from '../lib/neon-migrations.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CATALOG_PATH = 'docs/compliance/soc2-controls.json';
export const COLLECTOR_MODULE = 'scripts/compliance/collect-soc2-evidence.mjs';
export const DEFAULT_OUT_ROOT = '.cache/soc2-evidence';
export const DEFAULT_PERIOD_DAYS = 31;

const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const LEGAL_CONSTANTS = 'apps/web/lib/legal-constants.ts';
const POLICY_REGISTRY = 'docs/compliance/policy-versions.json';
const TRUST_CLAIMS = 'docs/compliance/trust-claims.json';
const KNOWN_FLAWS = 'audit/registers/known-flaws.md';
const DECLARED_RULESET = '.github/rulesets/main.json';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const WORKFLOW_DIR = '.github/workflows';
const VERCEL_LINK = '.vercel/project.json';
const PRE_PUSH_FILES = ['.husky/pre-push', 'scripts/prepush-clean-worktree.sh'];
const SECRET_SCAN_GUARD = 'scripts/check-secrets.mjs';
const DATA_PROTECTION_GUARDS = [
  'scripts/check-rls-boundary.mjs',
  'scripts/check-db-isolation.mjs',
  'scripts/check-retention-graph.mjs',
  'scripts/check-legal-hold-coverage.mjs',
];
const SECRET_ENV = ['GH_TOKEN', 'GITHUB_TOKEN', 'VERCEL_TOKEN', 'NEON_API_KEY'];
const COMMAND_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 256 * 1024 * 1024;
const DAY_MS = 86_400_000;
const VERCEL_PAGE_LIMIT = 25;
const RUN_LIST_LIMIT = 1000;
const GUARD_OUTPUT_LINES = 5;
const GUARD_LOG_LINES = 20;
const MIN_GAP_LENGTH = 40;

const STATUSES = new Set(['operated', 'not-yet-operated']);
const CYCLE1 = new Set(['in-scope', 'out-of-scope']);
const AUTOMATION = new Set(['automated', 'manual']);
const CRITERION_SHAPE = /^(?:CC[1-9]\.[1-9]|A1\.[1-9]|C1\.[1-9]|PI1\.[1-9]|P[1-8]\.[1-9])$/;
const CONTROL_ID = /^[A-Z]{2}-\d{2}$/;

export class Unavailable extends Error {}

const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi;
const TOKEN_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];

/** Emails keep only their domain; credentials, known token shapes and the run's own secrets go entirely. */
export function redactText(text, secrets = []) {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8)
      out = out.split(secret).join('[redacted]');
  }
  out = out.replace(URL_CREDENTIALS, '$1[redacted]@');
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, '[redacted]');
  return out.replace(EMAIL, '[redacted]@$1');
}

export function redact(value, secrets = []) {
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redact(item, secrets)]),
    );
  }
  return value;
}

/** A fact the collector could not see. It is recorded as unseen, never guessed. */
export function unseen(reason) {
  return { status: 'unavailable', reason };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The Trust Services category a criterion belongs to, read from the catalog's prefix map, longest prefix first. */
export function categoryOf(catalog, id) {
  const prefixes = Object.keys(catalog.categories ?? {}).sort((a, b) => b.length - a.length);
  const prefix = prefixes.find((candidate) => id.startsWith(candidate));
  return prefix === undefined ? null : catalog.categories[prefix];
}

function cycle1Categories(catalog) {
  return new Set(catalog.scope?.cycle1 ?? []);
}

export function validateCatalog(catalog, collectorKeys, exists) {
  const errors = [];
  const criteria = new Set(Object.keys(catalog.criteria ?? {}));
  const owners = new Set(catalog.owners ?? []);
  const frequencies = new Set(catalog.frequencies ?? []);
  const known = new Set(collectorKeys);
  const referenced = new Set();
  const ids = new Set();

  if (criteria.size === 0)
    errors.push('criteria is empty, so no control can be checked against it');
  for (const id of criteria) {
    if (!CRITERION_SHAPE.test(id))
      errors.push(`criteria: ${id} is not a Trust Services Criterion id`);
  }
  for (const id of criteria) {
    if (categoryOf(catalog, id) === null)
      errors.push(`criteria: ${id} matches no prefix in categories`);
  }
  const knownCategories = new Set(Object.values(catalog.categories ?? {}));
  const inCycle1 = cycle1Categories(catalog);
  if (inCycle1.size === 0) errors.push('scope.cycle1 names no category');
  for (const category of inCycle1) {
    if (!knownCategories.has(category)) errors.push(`scope.cycle1: ${category} is not a category`);
  }
  if (!Array.isArray(catalog.controls) || catalog.controls.length === 0) {
    errors.push('controls is empty');
  }

  for (const control of catalog.controls ?? []) {
    const label = control.id ?? '(control with no id)';
    if (!CONTROL_ID.test(control.id ?? '')) errors.push(`${label}: id must look like CM-01`);
    if (ids.has(control.id)) errors.push(`${label}: id is used twice`);
    ids.add(control.id);
    for (const field of ['title', 'description']) {
      if (!nonEmpty(control[field])) errors.push(`${label}: ${field} is empty`);
    }
    if (!Array.isArray(control.criteria) || control.criteria.length === 0) {
      errors.push(`${label}: maps to no criterion`);
    }
    for (const id of control.criteria ?? []) {
      if (!criteria.has(id)) errors.push(`${label}: ${id} is not in the catalog's criteria`);
    }
    if (!owners.has(control.owner))
      errors.push(`${label}: owner ${control.owner} is not listed in owners`);
    if (!frequencies.has(control.frequency)) {
      errors.push(`${label}: frequency ${control.frequency} is not listed in frequencies`);
    }
    if (!STATUSES.has(control.status)) {
      errors.push(`${label}: status must be one of ${[...STATUSES].join(', ')}`);
    }
    if (!AUTOMATION.has(control.automation)) {
      errors.push(`${label}: automation must be one of ${[...AUTOMATION].join(', ')}`);
    }
    const categories = (control.criteria ?? []).map((id) => categoryOf(catalog, id));
    if (!CYCLE1.has(control.cycle1)) {
      errors.push(`${label}: cycle1 must be one of ${[...CYCLE1].join(', ')}`);
    } else if (
      control.cycle1 === 'in-scope' &&
      !categories.some((category) => inCycle1.has(category))
    ) {
      errors.push(
        `${label}: in scope for cycle 1 but cites no criterion in ${[...inCycle1].join(', ')}`,
      );
    } else if (
      control.cycle1 === 'out-of-scope' &&
      categories.every((category) => inCycle1.has(category))
    ) {
      errors.push(`${label}: out of scope for cycle 1 but every criterion it cites is in scope`);
    }

    const collectors = Array.isArray(control.collectors) ? control.collectors : null;
    if (collectors === null)
      errors.push(`${label}: collectors must be a list, empty when evidence is manual`);
    for (const key of collectors ?? []) {
      referenced.add(key);
      if (!known.has(key))
        errors.push(`${label}: collector ${key} does not exist in ${COLLECTOR_MODULE}`);
    }
    const hasCollector = (collectors ?? []).length > 0;

    if (control.status === 'operated') {
      if (control.automation === 'automated' && !hasCollector) {
        errors.push(`${label}: an automated control needs a collector that shows it running`);
      }
      if (!hasCollector && !nonEmpty(control.manualEvidence)) {
        errors.push(
          `${label}: names no collector and no manualEvidence, so nothing proves it operates`,
        );
      }
      if (control.gap !== undefined) {
        errors.push(
          `${label}: an operated control carries a gap; mark it not-yet-operated or state the limit in its description`,
        );
      }
    }
    if (control.status === 'not-yet-operated') {
      if (!nonEmpty(control.gap) || control.gap.trim().length < MIN_GAP_LENGTH) {
        errors.push(`${label}: a not-yet-operated control must say what is missing`);
      }
    }

    if (!Array.isArray(control.implementation)) {
      errors.push(`${label}: implementation must be a list of repository paths`);
    } else {
      if (control.status === 'operated' && control.implementation.length === 0) {
        errors.push(`${label}: an operated control names no path that implements it`);
      }
      for (const file of control.implementation) {
        if (!exists(file)) errors.push(`${label}: ${file} does not exist`);
      }
    }
  }

  for (const key of known) {
    if (!referenced.has(key)) errors.push(`collector ${key} proves no control in ${CATALOG_PATH}`);
  }
  return errors;
}

/** Which criteria an operated control covers, which only a gap entry names, and which nothing names. */
export function criteriaCoverage(catalog) {
  const operated = new Map();
  const planned = new Map();
  for (const control of catalog.controls ?? []) {
    const target = control.status === 'operated' ? operated : planned;
    for (const id of control.criteria ?? []) {
      target.set(id, [...(target.get(id) ?? []), control.id]);
    }
  }
  const all = Object.keys(catalog.criteria ?? {});
  const inCycle1 = cycle1Categories(catalog);
  const cycle1 = all.filter((id) => inCycle1.has(categoryOf(catalog, id)));
  return {
    total: all.length,
    covered: all.filter((id) => operated.has(id)),
    gapOnly: all.filter((id) => !operated.has(id) && planned.has(id)),
    unnamed: all.filter((id) => !operated.has(id) && !planned.has(id)),
    cycle1: {
      total: cycle1.length,
      covered: cycle1.filter((id) => operated.has(id)),
      uncovered: cycle1.filter((id) => !operated.has(id)),
    },
    byCriterion: Object.fromEntries(
      all.map((id) => [
        id,
        { operated: operated.get(id) ?? [], notYetOperated: planned.get(id) ?? [] },
      ]),
    ),
  };
}

export function controlCounts(catalog) {
  const controls = catalog.controls ?? [];
  const operated = controls.filter((control) => control.status === 'operated');
  return {
    total: controls.length,
    operatedAutomated: operated.filter((control) => control.automation === 'automated').length,
    operatedManual: operated.filter((control) => control.automation === 'manual').length,
    notYetOperated: controls.length - operated.length,
    outOfScopeCycle1: controls.filter((control) => control.cycle1 === 'out-of-scope').length,
  };
}

export function runCommand(command, args, { cwd, env, timeout = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, env, timeout, maxBuffer: MAX_BUFFER, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error?.code === 'ENOENT') {
          reject(new Unavailable(`${command} is not installed`));
          return;
        }
        if (error?.killed) {
          reject(new Error(`${command} ${args[0] ?? ''} timed out after ${timeout / 1000}s`));
          return;
        }
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

function firstLine(text) {
  return (
    String(text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}

function lastLines(text, count) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-count);
}

function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function day(date) {
  return date.toISOString().slice(0, 10);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function countBy(items, pick) {
  const counts = {};
  for (const item of items) {
    const key = String(pick(item) ?? 'unknown');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function createContext({
  root = REPO_ROOT,
  since,
  until,
  env = process.env,
  exec = runCommand,
  fetchImpl = globalThis.fetch,
  options = {},
}) {
  const memo = new Map();
  return {
    root,
    since,
    until,
    env,
    options,
    fetchImpl,
    secrets: SECRET_ENV.map((name) => env[name]).filter(Boolean),
    exec: (command, args, extra = {}) => exec(command, args, { cwd: root, env, ...extra }),
    once(key, factory) {
      if (!memo.has(key)) memo.set(key, factory());
      return memo.get(key);
    },
    read(relative) {
      return fs.readFileSync(path.join(root, relative), 'utf8');
    },
    exists(relative) {
      return fs.existsSync(path.join(root, relative));
    },
  };
}

function readJson(ctx, relative) {
  return JSON.parse(ctx.read(relative));
}

export function parseGitHubRemote(url) {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export function httpStatus(stderr) {
  const match = /\(HTTP (\d{3})\)/.exec(String(stderr));
  return match ? Number(match[1]) : null;
}

async function ghRequest(ctx, args) {
  let result = await ctx.exec('gh', args);
  if (result.code !== 0 && httpStatus(result.stderr) === null) result = await ctx.exec('gh', args);
  if (result.code === 0) {
    return {
      ok: true,
      status: 200,
      data: result.stdout.trim() === '' ? null : JSON.parse(result.stdout),
    };
  }
  return { ok: false, status: httpStatus(result.stderr), message: firstLine(result.stderr) };
}

async function ghJson(ctx, args) {
  const response = await ghRequest(ctx, args);
  if (response.ok) return response.data;
  if (response.status === 401 || response.status === 403) {
    throw new Unavailable(
      `GitHub refused ${args[1] ?? args[0]} (HTTP ${response.status}): ${response.message}`,
    );
  }
  throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${response.message}`);
}

function paginated(pages) {
  return (Array.isArray(pages) ? pages : [pages]).flatMap((page) =>
    Array.isArray(page) ? page : [],
  );
}

function github(ctx) {
  return ctx.once('github', async () => {
    const auth = await ctx.exec('gh', ['auth', 'status']);
    if (auth.code !== 0) throw new Unavailable('gh is not authenticated (gh auth login)');
    let repo = ctx.options.repo ?? null;
    if (repo === null) {
      const remote = await ctx.exec('git', ['remote', 'get-url', 'origin']);
      repo = remote.code === 0 ? parseGitHubRemote(remote.stdout) : null;
    }
    if (repo === null)
      throw new Unavailable('origin is not a GitHub remote; pass --repo owner/name');
    const metadata = await ghJson(ctx, ['api', `repos/${repo}`]);
    return {
      repo,
      owner: metadata.owner?.login ?? repo.split('/')[0],
      ownerType: metadata.owner?.type ?? null,
      defaultBranch: metadata.default_branch,
      visibility: metadata.visibility ?? null,
      securityAndAnalysis: metadata.security_and_analysis ?? null,
    };
  });
}

function createdRange(ctx) {
  return `${day(ctx.since)}..${day(new Date(ctx.until.getTime() - 1))}`;
}

function inPeriod(ctx, timestamp) {
  const at = new Date(timestamp);
  return at >= ctx.since && at < ctx.until;
}

const HISTORY_QUERY = `query($owner:String!,$name:String!,$branch:String!,$since:GitTimestamp!,$until:GitTimestamp!,$endCursor:String){
  repository(owner:$owner,name:$name){ref(qualifiedName:$branch){target{... on Commit{
    history(since:$since,until:$until,first:100,after:$endCursor){
      totalCount pageInfo{hasNextPage endCursor}
      nodes{oid messageHeadline committedDate author{name user{login}}
        associatedPullRequests(first:1){nodes{number mergedAt baseRefName author{login}
          reviews(states:APPROVED,first:20){nodes{author{login}}}}}}}}}}}}`;

/** A commit counts as reviewed only when a merged pull request into the branch carries an approval from someone other than its author. */
export function summarizeHistory(nodes, branch) {
  const commits = nodes.map((node) => {
    const author = node.author?.user?.login ?? node.author?.name ?? null;
    const pr = node.associatedPullRequests?.nodes?.[0] ?? null;
    const merged = pr !== null && pr.mergedAt !== null && pr.baseRefName === branch;
    const approvers = merged
      ? [
          ...new Set(
            (pr.reviews?.nodes ?? []).map((review) => review.author?.login).filter(Boolean),
          ),
        ].filter((login) => login !== pr.author?.login && login !== author)
      : [];
    return {
      sha: node.oid,
      committedAt: node.committedDate,
      author,
      subject: node.messageHeadline,
      pullRequest: merged
        ? { number: pr.number, mergedAt: pr.mergedAt, author: pr.author?.login ?? null }
        : null,
      approvedBy: approvers,
      reviewedByAnother: approvers.length > 0,
    };
  });
  return {
    commits,
    total: commits.length,
    viaPullRequest: commits.filter((commit) => commit.pullRequest !== null).length,
    reviewedByAnother: commits.filter((commit) => commit.reviewedByAnother).length,
    authors: countBy(commits, (commit) => commit.author),
  };
}

/** Each pushed head commit with the conclusion of every workflow run on it, and the CI verdict alone. */
export function groupRunsByCommit(runs, ciWorkflowName) {
  const byCommit = new Map();
  for (const run of runs) {
    const entry = byCommit.get(run.headSha) ?? {
      sha: run.headSha,
      firstRunAt: run.createdAt,
      runs: [],
    };
    if (run.createdAt < entry.firstRunAt) entry.firstRunAt = run.createdAt;
    entry.runs.push({
      workflow: run.workflowName,
      conclusion: run.conclusion || run.status,
      attempt: run.attempt ?? 1,
      runId: run.databaseId,
    });
    byCommit.set(run.headSha, entry);
  }
  const commits = [...byCommit.values()]
    .map((entry) => {
      const ci = entry.runs.filter((run) => run.workflow === ciWorkflowName);
      const latest = ci.sort((a, b) => b.attempt - a.attempt || b.runId - a.runId)[0];
      return { ...entry, ci: latest ? latest.conclusion : 'not-run' };
    })
    .sort((a, b) => (a.firstRunAt < b.firstRunAt ? 1 : -1));
  return { commits, ciConclusions: countBy(commits, (commit) => commit.ci) };
}

function workflowName(ctx, file) {
  const document = parseYaml(ctx.read(file));
  return typeof document?.name === 'string' ? document.name : path.basename(file);
}

export function scheduledWorkflows(files) {
  return files
    .map(({ file, source }) => {
      const document = parseYaml(source);
      const on = document?.on ?? document?.[true];
      const schedule = on && typeof on === 'object' && !Array.isArray(on) ? on.schedule : undefined;
      if (!Array.isArray(schedule)) return null;
      return {
        file,
        name: typeof document.name === 'string' ? document.name : path.basename(file),
        crons: schedule.map((entry) => entry?.cron).filter(Boolean),
      };
    })
    .filter(Boolean);
}

function workflowSources(ctx) {
  const dir = path.join(ctx.root, WORKFLOW_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => ({
      file: `${WORKFLOW_DIR}/${name}`,
      source: ctx.read(`${WORKFLOW_DIR}/${name}`),
    }));
}

function vercelLink(ctx) {
  if (ctx.options.vercelProject)
    return { projectName: ctx.options.vercelProject, orgId: ctx.env.VERCEL_ORG_ID ?? null };
  if (!ctx.exists(VERCEL_LINK)) {
    throw new Unavailable(
      `no linked Vercel project: ${VERCEL_LINK} is missing (vercel link) and --vercel-project was not passed`,
    );
  }
  const link = readJson(ctx, VERCEL_LINK);
  return { projectName: link.projectName, orgId: ctx.env.VERCEL_ORG_ID ?? link.orgId ?? null };
}

export function parseVercelList(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    const match =
      /^\s*(\S+)\s+(https:\/\/\S+)\s+(?:[^\w\s]\s*)?(\w+)\s+(\w+)\s+(\S+)\s+(\S+)\s*$/.exec(line);
    if (match) {
      rows.push({
        age: match[1],
        url: match[2],
        status: match[3],
        environment: match[4],
        duration: match[5],
        creator: match[6],
      });
    }
  }
  return { rows, next: /--next\s+(\d+)/.exec(String(text))?.[1] ?? null };
}

function lastLine(text) {
  return lastLines(text, 1)[0]?.trim() ?? '';
}

// The Vercel CLI treats any first argument it does not know as a path and
// deploys it, so a typo or a command a newer CLI added (`vercel api` is not one
// in 50.1.3) would ship the working tree. Only these read commands may run.
export const VERCEL_READ_COMMANDS = new Set(['list', 'inspect', 'whoami']);

export async function vercelRead(ctx, args) {
  if (!VERCEL_READ_COMMANDS.has(args[0])) {
    throw new Error(
      `refusing vercel ${args[0]}: only ${[...VERCEL_READ_COMMANDS].join(', ')} may run`,
    );
  }
  return ctx.exec('vercel', args);
}

/** `vercel inspect` exits 1 for a deployment in the ERROR state while still printing its JSON. */
export async function vercelInspect(ctx, url) {
  const inspected = await vercelRead(ctx, ['inspect', url, '--json']);
  try {
    return JSON.parse(inspected.stdout);
  } catch {
    throw new Error(
      `vercel inspect ${url} failed (exit ${inspected.code}): ${lastLine(inspected.stderr)}`,
    );
  }
}

function neon(ctx) {
  return ctx.once('neon', async () => {
    const projectId = ctx.options.neonProject ?? ctx.env.NEON_PROJECT_ID ?? null;
    if (!projectId)
      throw new Unavailable('NEON_PROJECT_ID is not set and --neon-project was not passed');
    const me = await ctx.exec('neonctl', ['me', '-o', 'json', '--no-analytics']);
    if (me.code !== 0)
      throw new Unavailable(`neonctl is not authenticated (neonctl auth): ${firstLine(me.stderr)}`);
    const project = await neonJson(ctx, ['projects', 'get', projectId]);
    return { projectId, project };
  });
}

async function neonJson(ctx, args) {
  const result = await ctx.exec('neonctl', [...args, '-o', 'json', '--no-analytics']);
  if (result.code !== 0)
    throw new Error(`neonctl ${args.slice(0, 2).join(' ')} failed: ${firstLine(result.stderr)}`);
  return JSON.parse(result.stdout);
}

async function neonApi(ctx, apiPath) {
  const result = await ctx.exec('neonctl', ['api', apiPath, '-o', 'json', '--no-analytics']);
  if (result.code !== 0) return { ok: false, message: firstLine(result.stderr || result.stdout) };
  return { ok: true, data: JSON.parse(result.stdout) };
}

async function runGuard(ctx, file) {
  if (!ctx.exists(file)) throw new Unavailable(`${file} is not in this checkout`);
  const result = await ctx.exec(process.execPath, [file]);
  return {
    guard: file,
    exitCode: result.code,
    passed: result.code === 0,
    output: lastLines(`${result.stdout}\n${result.stderr}`, GUARD_OUTPUT_LINES),
  };
}

async function gitLastCommit(ctx, file) {
  const result = await ctx.exec('git', ['log', '-1', '--format=%H %cI', '--', file]);
  const [sha, committedAt] = result.stdout.trim().split(' ');
  return sha ? { sha, committedAt } : null;
}

function fileDigest(ctx, relative) {
  const absolute = path.join(ctx.root, relative);
  if (!fs.existsSync(absolute)) return { file: relative, present: false };
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) return { file: relative, present: true, kind: 'directory' };
  return {
    file: relative,
    present: true,
    bytes: stat.size,
    sha256: sha256(fs.readFileSync(absolute)),
  };
}

export function parseKnownFlaws(markdown) {
  const rows = [];
  let section = null;
  let columns = null;
  for (const line of markdown.split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      columns = null;
      continue;
    }
    if (!line.trim().startsWith('|')) {
      columns = null;
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (columns === null) {
      columns = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    const severity = columns.indexOf('severity');
    const id = columns.indexOf('id');
    if (severity === -1 || id === -1) continue;
    rows.push({ section, id: cells[id].replace(/`/g, ''), severity: cells[severity] });
  }
  return {
    open: rows.length,
    bySeverity: countBy(rows, (row) => row.severity),
    bySection: countBy(rows, (row) => row.section),
    rows,
  };
}

function ageInDays(dateText, now) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? Math.floor((now.getTime() - date.getTime()) / DAY_MS)
    : null;
}

export const COLLECTORS = {
  'github.main-history': {
    area: 'change-management',
    describe:
      'Commits on the default branch in the period, their authors, and whether each arrived through an approved pull request.',
    async run(ctx) {
      const gh = await github(ctx);
      const [owner, name] = gh.repo.split('/');
      const pages = await ghJson(ctx, [
        'api',
        'graphql',
        '--paginate',
        '--slurp',
        '-f',
        `query=${HISTORY_QUERY}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
        '-f',
        `branch=refs/heads/${gh.defaultBranch}`,
        '-f',
        `since=${ctx.since.toISOString()}`,
        '-f',
        `until=${ctx.until.toISOString()}`,
      ]);
      const histories = (Array.isArray(pages) ? pages : [pages]).map(
        (page) => page?.data?.repository?.ref?.target?.history,
      );
      const nodes = histories.flatMap((history) => history?.nodes ?? []);
      const summary = summarizeHistory(nodes, gh.defaultBranch);
      return {
        headline: `${summary.total} commit(s) on ${gh.defaultBranch}, ${summary.viaPullRequest} through a pull request, ${summary.reviewedByAnother} approved by someone other than the author`,
        data: {
          repo: gh.repo,
          branch: gh.defaultBranch,
          reportedTotal: histories[0]?.totalCount ?? summary.total,
          ...summary,
        },
      };
    },
  },

  'github.branch-protection': {
    area: 'change-management',
    describe:
      'What GitHub enforces on the default branch, compared with the ruleset the repository declares.',
    async run(ctx) {
      const gh = await github(ctx);
      const branch = encodeURIComponent(gh.defaultBranch);
      const [classic, rulesets, effective] = await Promise.all([
        ghRequest(ctx, ['api', `repos/${gh.repo}/branches/${branch}/protection`]),
        ghRequest(ctx, ['api', `repos/${gh.repo}/rulesets?includes_parents=true`]),
        ghRequest(ctx, ['api', `repos/${gh.repo}/rules/branches/${branch}`]),
      ]);
      if (
        !classic.ok &&
        !rulesets.ok &&
        !effective.ok &&
        [classic, rulesets, effective].every((r) => r.status === 403)
      ) {
        throw new Unavailable(`GitHub refused every branch protection read: ${classic.message}`);
      }
      const effectiveRules = effective.ok
        ? (effective.data ?? []).map((rule) => ({
            type: rule.type,
            parameters: rule.parameters ?? null,
          }))
        : null;
      const declared = ctx.exists(DECLARED_RULESET) ? readJson(ctx, DECLARED_RULESET) : null;
      const declaredTypes = (declared?.rules ?? []).map((rule) => rule.type);
      const enforcedTypes = new Set((effectiveRules ?? []).map((rule) => rule.type));
      const classicProtected = classic.ok
        ? true
        : classic.status === 404 && /not protected/i.test(classic.message)
          ? false
          : null;
      const missing =
        effectiveRules === null ? null : declaredTypes.filter((type) => !enforcedTypes.has(type));
      return {
        headline:
          `classic protection ${classicProtected === null ? 'unavailable' : classicProtected ? 'on' : 'off'}, ${effectiveRules === null ? 'effective rules unavailable' : `${effectiveRules.length} effective rule(s)`}` +
          (missing === null
            ? ''
            : `, ${missing.length} of ${declaredTypes.length} declared rule type(s) not enforced`),
        data: {
          repo: gh.repo,
          branch: gh.defaultBranch,
          classicProtection: classic.ok
            ? { protected: true, settings: classic.data }
            : classicProtected === false
              ? { protected: false, httpStatus: classic.status, message: classic.message }
              : unseen(`HTTP ${classic.status}: ${classic.message}`),
          rulesets: rulesets.ok
            ? (rulesets.data ?? []).map((set) => ({
                id: set.id,
                name: set.name,
                target: set.target,
                enforcement: set.enforcement,
                source: set.source,
              }))
            : unseen(`HTTP ${rulesets.status}: ${rulesets.message}`),
          effectiveRules:
            effectiveRules ?? unseen(`HTTP ${effective.status}: ${effective.message}`),
          declared: { file: DECLARED_RULESET, ruleTypes: declaredTypes },
          declaredButNotEnforced: missing,
        },
      };
    },
  },

  'github.ci-runs': {
    area: 'change-management',
    describe:
      'Workflow runs triggered by pushes to the default branch in the period, grouped by pushed commit with the CI verdict.',
    async run(ctx) {
      const gh = await github(ctx);
      const runs = await ghJson(ctx, [
        'run',
        'list',
        '--branch',
        gh.defaultBranch,
        '--event',
        'push',
        '--created',
        createdRange(ctx),
        '--limit',
        String(RUN_LIST_LIMIT),
        '--json',
        'databaseId,headSha,workflowName,conclusion,status,createdAt,attempt',
      ]);
      const ciName = ctx.exists(CI_WORKFLOW) ? workflowName(ctx, CI_WORKFLOW) : null;
      const inWindow = (runs ?? []).filter((run) => inPeriod(ctx, run.createdAt));
      const grouped = groupRunsByCommit(inWindow, ciName);
      return {
        headline: `${grouped.commits.length} pushed commit(s); CI verdicts ${JSON.stringify(grouped.ciConclusions)}`,
        data: {
          repo: gh.repo,
          branch: gh.defaultBranch,
          ciWorkflow: ciName,
          runCount: inWindow.length,
          possiblyTruncated: (runs ?? []).length >= RUN_LIST_LIMIT,
          ...grouped,
        },
      };
    },
  },

  'github.scheduled-workflow-runs': {
    area: 'operations',
    describe:
      'Every workflow with a schedule trigger, whether GitHub has it enabled, and each run in the period.',
    async run(ctx) {
      const gh = await github(ctx);
      const scheduled = scheduledWorkflows(workflowSources(ctx));
      const states = await ghJson(ctx, [
        'workflow',
        'list',
        '--all',
        '--limit',
        '500',
        '--json',
        'name,path,state',
      ]);
      const stateByPath = new Map((states ?? []).map((entry) => [entry.path, entry.state]));
      const workflows = [];
      for (const workflow of scheduled) {
        const runs = await ghJson(ctx, [
          'run',
          'list',
          '--workflow',
          path.basename(workflow.file),
          '--created',
          createdRange(ctx),
          '--limit',
          '500',
          '--json',
          'databaseId,conclusion,status,event,createdAt,headSha',
        ]);
        const list = (runs ?? [])
          .filter((run) => inPeriod(ctx, run.createdAt))
          .map((run) => ({
            runId: run.databaseId,
            event: run.event,
            conclusion: run.conclusion || run.status,
            createdAt: run.createdAt,
            headSha: run.headSha,
          }));
        workflows.push({
          ...workflow,
          state: stateByPath.get(workflow.file) ?? 'unknown',
          runs: list,
          conclusions: countBy(list, (run) => run.conclusion),
        });
      }
      const disabled = workflows.filter((workflow) => workflow.state !== 'active').length;
      const withSuccess = workflows.filter(
        (workflow) => (workflow.conclusions.success ?? 0) > 0,
      ).length;
      return {
        headline: `${workflows.length} scheduled workflow(s), ${disabled} not active, ${withSuccess} with at least one success in the period`,
        data: { repo: gh.repo, workflows },
      };
    },
  },

  'github.collaborators': {
    area: 'access',
    describe:
      'Repository collaborators and pending invitations with their permission level, and two-factor status where the token can see it.',
    async run(ctx) {
      const gh = await github(ctx);
      const collaborators = paginated(
        await ghJson(ctx, [
          'api',
          '--paginate',
          '--slurp',
          `repos/${gh.repo}/collaborators?per_page=100`,
        ]),
      ).map((user) => ({
        login: user.login,
        type: user.type,
        role: user.role_name ?? null,
        permissions: user.permissions ?? null,
        siteAdmin: user.site_admin === true,
      }));
      const invitations = await ghRequest(ctx, [
        'api',
        '--paginate',
        '--slurp',
        `repos/${gh.repo}/invitations?per_page=100`,
      ]);
      const self = await ghRequest(ctx, ['api', 'user']);
      let organizationWithout2fa = null;
      if (gh.ownerType === 'Organization') {
        const response = await ghRequest(ctx, [
          'api',
          '--paginate',
          '--slurp',
          `orgs/${gh.owner}/members?filter=2fa_disabled&per_page=100`,
        ]);
        organizationWithout2fa = response.ok
          ? paginated(response.data).map((user) => user.login)
          : unseen(`HTTP ${response.status}: ${response.message}`);
      }
      const twoFactor = self.ok ? self.data?.two_factor_authentication : undefined;
      return {
        headline: `${collaborators.length} collaborator(s): ${collaborators.map((user) => `${user.login} (${user.role})`).join(', ')}`,
        data: {
          repo: gh.repo,
          ownerType: gh.ownerType,
          collaborators,
          pendingInvitations: invitations.ok
            ? paginated(invitations.data).map((invite) => ({
                invitee: invite.invitee?.login ?? null,
                permissions: invite.permissions,
                createdAt: invite.created_at,
              }))
            : unseen(`HTTP ${invitations.status}: ${invitations.message}`),
          authenticatedUser: self.ok ? self.data?.login : null,
          authenticatedUserTwoFactor:
            typeof twoFactor === 'boolean'
              ? twoFactor
              : unseen(
                  'GitHub returned no two_factor_authentication for this token; it is shown only to a classic token with user scope',
                ),
          organizationMembersWithout2fa: organizationWithout2fa,
        },
      };
    },
  },

  'github.security-alerts': {
    area: 'vulnerability-management',
    describe:
      'Repository security settings and open code scanning, Dependabot and secret scanning alerts, never the secret values.',
    async run(ctx) {
      const gh = await github(ctx);
      const read = (kind) =>
        ghRequest(ctx, [
          'api',
          '--paginate',
          '--slurp',
          `repos/${gh.repo}/${kind}/alerts?state=open&per_page=100`,
        ]);
      const [codeScanning, dependabot, secretScanning] = await Promise.all([
        read('code-scanning'),
        read('dependabot'),
        read('secret-scanning'),
      ]);
      const unreadable = (response) => unseen(`HTTP ${response.status}: ${response.message}`);
      const dependabotPulls = await ghRequest(ctx, [
        'pr',
        'list',
        '--repo',
        gh.repo,
        '--state',
        'all',
        '--author',
        'app/dependabot',
        '--search',
        `created:${createdRange(ctx)}`,
        '--limit',
        '500',
        '--json',
        'number,state,createdAt,mergedAt',
      ]);
      const code = codeScanning.ok ? paginated(codeScanning.data) : null;
      const deps = dependabot.ok ? paginated(dependabot.data) : null;
      const secrets = secretScanning.ok ? paginated(secretScanning.data) : null;
      const counts = [code, deps, secrets].map((list) =>
        list === null ? 'unavailable' : list.length,
      );
      return {
        headline:
          `${gh.visibility} repository; open alerts: code scanning ${counts[0]}, Dependabot ${counts[1]}, secret scanning ${counts[2]}; ` +
          `Dependabot pull requests opened in the period ${dependabotPulls.ok ? JSON.stringify(countBy(dependabotPulls.data ?? [], (pull) => pull.state)) : 'unavailable'}`,
        data: {
          repo: gh.repo,
          visibility: gh.visibility,
          securityAndAnalysis:
            gh.securityAndAnalysis ??
            unseen('the repository response carried no security_and_analysis block'),
          dependabotPullRequests: dependabotPulls.ok
            ? {
                opened: (dependabotPulls.data ?? []).length,
                byState: countBy(dependabotPulls.data ?? [], (pull) => pull.state),
                pulls: dependabotPulls.data ?? [],
              }
            : unreadable(dependabotPulls),
          codeScanning:
            code === null
              ? unreadable(codeScanning)
              : {
                  readable: true,
                  open: code.length,
                  bySeverity: countBy(
                    code,
                    (alert) => alert.rule?.security_severity_level ?? alert.rule?.severity,
                  ),
                  alerts: code.map((alert) => ({
                    number: alert.number,
                    rule: alert.rule?.id ?? null,
                    severity: alert.rule?.security_severity_level ?? alert.rule?.severity ?? null,
                    tool: alert.tool?.name ?? null,
                    createdAt: alert.created_at,
                  })),
                },
          dependabot:
            deps === null
              ? unreadable(dependabot)
              : {
                  readable: true,
                  open: deps.length,
                  bySeverity: countBy(deps, (alert) => alert.security_advisory?.severity),
                  alerts: deps.map((alert) => ({
                    number: alert.number,
                    package: alert.dependency?.package?.name ?? null,
                    ecosystem: alert.dependency?.package?.ecosystem ?? null,
                    severity: alert.security_advisory?.severity ?? null,
                    ghsa: alert.security_advisory?.ghsa_id ?? null,
                    createdAt: alert.created_at,
                  })),
                },
          secretScanning:
            secrets === null
              ? unreadable(secretScanning)
              : {
                  readable: true,
                  open: secrets.length,
                  alerts: secrets.map((alert) => ({
                    number: alert.number,
                    secretType: alert.secret_type_display_name ?? alert.secret_type ?? null,
                    createdAt: alert.created_at,
                    pushProtectionBypassed: alert.push_protection_bypassed ?? null,
                  })),
                },
        },
      };
    },
  },

  'vercel.production-deployments': {
    area: 'change-management',
    describe:
      'Production deployments of the linked Vercel project created in the period, with creator, state and exact creation time.',
    async run(ctx) {
      const link = vercelLink(ctx);
      const whoami = await vercelRead(ctx, ['whoami', '--no-color']);
      if (whoami.code !== 0)
        throw new Unavailable(`vercel is not logged in (vercel login): ${lastLine(whoami.stderr)}`);
      const deployments = [];
      let next = null;
      let reachedStart = false;
      for (let page = 0; page < VERCEL_PAGE_LIMIT && !reachedStart; page += 1) {
        const listed = await vercelRead(ctx, [
          'list',
          link.projectName,
          '--environment',
          'production',
          '--no-color',
          ...(next ? ['--next', next] : []),
        ]);
        if (listed.code !== 0) throw new Error(`vercel list failed: ${lastLine(listed.stderr)}`);
        const parsed = parseVercelList(`${listed.stderr}\n${listed.stdout}`);
        for (const row of parsed.rows) {
          const detail = await vercelInspect(ctx, row.url);
          const createdAt = new Date(detail.createdAt);
          if (createdAt < ctx.since) {
            reachedStart = true;
            break;
          }
          if (createdAt < ctx.until) {
            deployments.push({
              id: detail.id,
              url: detail.url ?? row.url,
              target: detail.target ?? row.environment,
              state: detail.readyState ?? row.status,
              createdAt: createdAt.toISOString(),
              creator: row.creator,
              aliases: Array.isArray(detail.aliases) ? detail.aliases : [],
            });
          }
        }
        next = parsed.next;
        if (next === null || parsed.rows.length === 0) break;
      }
      return {
        headline: `${deployments.length} production deployment(s) of ${link.projectName}; states ${JSON.stringify(countBy(deployments, (entry) => entry.state))}`,
        data: {
          project: link.projectName,
          reachedPeriodStart: reachedStart || next === null,
          commitLink:
            'A CLI deployment records no commit SHA, so each deployment is matched to its commit by hand.',
          deployments,
          byCreator: countBy(deployments, (entry) => entry.creator),
        },
      };
    },
  },

  'vercel.team-members': {
    area: 'access',
    describe:
      'Members of the Vercel team that owns the project, with role and join date; the Vercel API exposes no two-factor status.',
    async run(ctx) {
      const token = ctx.env.VERCEL_TOKEN;
      if (!token) {
        throw new Unavailable(
          'VERCEL_TOKEN is not set; the Vercel CLI has no command that lists team members, so this reads the REST API',
        );
      }
      const { orgId } = vercelLink(ctx);
      if (!orgId?.startsWith('team_'))
        throw new Unavailable(
          'the linked project belongs to a personal account, which has no team members',
        );
      const members = [];
      let until = null;
      for (;;) {
        const query = new URLSearchParams({
          limit: '100',
          ...(until ? { until: String(until) } : {}),
        });
        const response = await ctx.fetchImpl(
          `${VERCEL_API_ORIGIN}/v3/teams/${encodeURIComponent(orgId)}/members?${query}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (response.status === 401 || response.status === 403) {
          throw new Unavailable(
            `the Vercel API refused the team member list (HTTP ${response.status})`,
          );
        }
        if (!response.ok)
          throw new Error(
            `the Vercel API returned HTTP ${response.status} for the team member list`,
          );
        const body = await response.json();
        members.push(...(body.members ?? []));
        if (!body.pagination?.hasNext || body.pagination.next === null) break;
        until = body.pagination.next;
      }
      const listed = members.map((member) => ({
        username: member.username,
        name: member.name ?? null,
        email: member.email ?? null,
        role: member.role,
        confirmed: member.confirmed,
        joinedAt: iso(member.createdAt),
        githubLogin: member.github?.login ?? null,
      }));
      return {
        headline: `${listed.length} team member(s); roles ${JSON.stringify(countBy(listed, (member) => member.role))}`,
        data: {
          teamId: orgId,
          members: listed,
          twoFactor: unseen('the Vercel REST API exposes no two-factor status for team members'),
        },
      };
    },
  },

  'neon.members': {
    area: 'access',
    describe: 'Neon organization and project members with role and two-factor status.',
    async run(ctx) {
      const { projectId, project } = await neon(ctx);
      const orgId = project.org_id ?? null;
      let organization = null;
      if (orgId) {
        const response = await neonApi(ctx, `/organizations/${orgId}/members`);
        organization = response.ok
          ? (response.data.members ?? []).map((entry) => ({
              memberId: entry.member?.id ?? null,
              role: entry.member?.role ?? null,
              joinedAt: entry.member?.joined_at ?? null,
              email: entry.user?.email ?? null,
              hasMfa:
                typeof entry.user?.has_mfa === 'boolean'
                  ? entry.user.has_mfa
                  : unseen('Neon returned no has_mfa for this member'),
            }))
          : unseen(response.message);
      }
      let organizationRequiresMfa = null;
      if (orgId) {
        const orgs = await ctx.exec('neonctl', ['orgs', 'list', '-o', 'json', '--no-analytics']);
        const listed = orgs.code === 0 ? JSON.parse(orgs.stdout) : null;
        const entry = Array.isArray(listed) ? listed.find((org) => org.id === orgId) : undefined;
        organizationRequiresMfa =
          typeof entry?.require_mfa === 'boolean'
            ? entry.require_mfa
            : unseen(
                orgs.code === 0
                  ? 'neonctl orgs list returned no require_mfa for this organization'
                  : lastLine(orgs.stderr),
              );
      }
      const projectMembers = await neonApi(
        ctx,
        orgId ? `/projects/${projectId}/members` : `/projects/${projectId}/permissions`,
      );
      const withoutMfa = Array.isArray(organization)
        ? organization.filter((member) => member.hasMfa === false).length
        : null;
      return {
        headline: Array.isArray(organization)
          ? `${organization.length} organization member(s), ${withoutMfa} without MFA`
          : 'organization members unavailable',
        data: {
          projectId,
          orgId,
          organizationMembers: organization,
          organizationRequiresMfa,
          projectMembers: projectMembers.ok
            ? (
                projectMembers.data.project_members ??
                projectMembers.data.project_permissions ??
                []
              ).map((entry) => ({
                name: entry.name ?? null,
                email: entry.email ?? entry.granted_to_email ?? null,
                orgRole: entry.org_role ?? null,
                projectRole: entry.project_role ?? null,
                effectivePermission: entry.effective_project_permission ?? null,
                grantSource: entry.grant_source ?? null,
              }))
            : unseen(projectMembers.message),
          membersWithoutMfa: withoutMfa,
        },
      };
    },
  },

  'neon.backup-configuration': {
    area: 'data-protection',
    describe:
      'Point-in-time history window, network settings, branches, snapshots and backup schedule of the production Neon project.',
    async run(ctx) {
      const { projectId, project } = await neon(ctx);
      const branches = await neonJson(ctx, ['branches', 'list', '--project-id', projectId]);
      const listed = (Array.isArray(branches) ? branches : (branches.branches ?? [])).map(
        (branch) => ({
          id: branch.id,
          name: branch.name,
          default: branch.default === true,
          protected:
            typeof branch.protected === 'boolean'
              ? branch.protected
              : unseen('Neon returned no protected flag for this branch'),
          parentId: branch.parent_id ?? null,
          state: branch.current_state ?? null,
          createdAt: branch.created_at,
        }),
      );
      const defaultBranch = listed.find((branch) => branch.default) ?? null;
      const snapshots = await neonApi(ctx, `/projects/${projectId}/snapshots`);
      const schedule = defaultBranch
        ? await neonApi(ctx, `/projects/${projectId}/branches/${defaultBranch.id}/backup_schedule`)
        : { ok: false, message: 'no default branch' };
      const settings = project.settings ?? {};
      const retention = project.history_retention_seconds ?? null;
      return {
        headline: `history retention ${retention === null ? 'unavailable' : `${retention / 3600} h`}, ${listed.length} branch(es), default branch ${defaultBranch === null || typeof defaultBranch.protected !== 'boolean' ? 'protection unavailable' : defaultBranch.protected ? 'protected' : 'not protected'}`,
        data: {
          projectId,
          name: project.name,
          region: project.region_id,
          postgresVersion: project.pg_version,
          historyRetentionSeconds:
            retention ?? unseen('Neon returned no history_retention_seconds'),
          network: {
            allowedIpCount:
              settings.allowed_ips?.ips?.length ?? unseen('not in the Neon project settings'),
            allowListProtectedBranchesOnly:
              settings.allowed_ips?.protected_branches_only ??
              unseen('not in the Neon project settings'),
            blockPublicConnections:
              settings.block_public_connections ?? unseen('not in the Neon project settings'),
            blockVpcConnections:
              settings.block_vpc_connections ?? unseen('not in the Neon project settings'),
          },
          maintenanceWindow: settings.maintenance_window ?? null,
          branches: listed,
          snapshots: snapshots.ok
            ? (snapshots.data.snapshots ?? []).map((snapshot) => ({
                id: snapshot.id,
                name: snapshot.name,
                sourceBranchId: snapshot.source_branch_id,
                createdAt: snapshot.created_at,
                manual: snapshot.manual,
              }))
            : unseen(snapshots.message),
          backupSchedule: schedule.ok
            ? (schedule.data.schedule ?? schedule.data)
            : unseen(schedule.message),
        },
      };
    },
  },

  'deps.pnpm-audit': {
    area: 'vulnerability-management',
    describe: 'pnpm advisory audit of the workspace lockfile at collection time.',
    async run(ctx) {
      const result = await ctx.exec('pnpm', ['audit', '--json']);
      let report;
      try {
        report = JSON.parse(result.stdout);
      } catch {
        throw new Error(
          `pnpm audit printed no JSON (exit ${result.code}): ${firstLine(result.stderr)}`,
        );
      }
      if (report.error)
        throw new Error(`pnpm audit failed: ${report.error.message ?? report.error.code}`);
      const advisories = Object.values(report.advisories ?? {}).map((advisory) => ({
        id: advisory.id,
        ghsa: advisory.github_advisory_id ?? null,
        module: advisory.module_name,
        severity: advisory.severity,
        title: advisory.title,
        vulnerableVersions: advisory.vulnerable_versions,
        patchedVersions: advisory.patched_versions,
        url: advisory.url,
        paths: (advisory.findings ?? []).reduce(
          (sum, finding) => sum + (finding.paths?.length ?? 0),
          0,
        ),
      }));
      const counts = report.metadata?.vulnerabilities ?? {};
      return {
        headline: `${advisories.length} advisory(ies) across ${report.metadata?.totalDependencies ?? '?'} dependencies; vulnerable paths by severity ${JSON.stringify(counts)}`,
        data: {
          exitCode: result.code,
          vulnerabilities: counts,
          dependencies: report.metadata?.totalDependencies ?? null,
          muted: report.muted ?? [],
          advisories,
        },
      };
    },
  },

  'deps.cargo-audit': {
    area: 'vulnerability-management',
    describe: 'cargo-audit of the Cargo workspace lockfile at collection time.',
    async run(ctx) {
      const result = await ctx.exec('cargo', ['audit', '--json']);
      if (/no such (?:command|subcommand)/i.test(result.stderr)) {
        throw new Unavailable('cargo-audit is not installed (cargo install cargo-audit)');
      }
      let report;
      try {
        report = JSON.parse(result.stdout);
      } catch {
        throw new Error(
          `cargo audit printed no JSON (exit ${result.code}): ${firstLine(result.stderr)}`,
        );
      }
      const vulnerabilities = (report.vulnerabilities?.list ?? []).map((entry) => ({
        id: entry.advisory?.id,
        package: entry.package?.name,
        version: entry.package?.version,
        title: entry.advisory?.title,
        severity: entry.advisory?.cvss ?? null,
      }));
      const warnings = Object.fromEntries(
        Object.entries(report.warnings ?? {}).map(([kind, list]) => [
          kind,
          (list ?? []).map((entry) => ({
            id: entry.advisory?.id ?? null,
            package: entry.package?.name ?? null,
          })),
        ]),
      );
      return {
        headline: `${vulnerabilities.length} vulnerability(ies); warnings ${JSON.stringify(Object.fromEntries(Object.entries(warnings).map(([kind, list]) => [kind, list.length])))}`,
        data: {
          exitCode: result.code,
          database: {
            advisoryCount: report.database?.['advisory-count'] ?? null,
            lastCommit: report.database?.['last-commit'] ?? null,
            lastUpdated: report.database?.['last-updated'] ?? null,
          },
          lockfileDependencies: report.lockfile?.['dependency-count'] ?? null,
          vulnerabilities,
          warnings,
        },
      };
    },
  },

  'repo.guard-inventory': {
    area: 'guards-and-tests',
    describe:
      'The guard chain the pre-push hook runs, every guard and whether anything executes it, and the latest local guard log when one is supplied.',
    async run(ctx) {
      const scripts = readJson(ctx, 'package.json').scripts ?? {};
      const chain = String(scripts[ROOT_CHAIN] ?? '')
        .split('&&')
        .map((step) => step.trim())
        .filter(Boolean);
      const guards = guardInventory(ctx.root).map(
        ({ file, inChain, inWorkflow, selfTest, selfTestRun }) => ({
          file,
          inChain,
          inWorkflow,
          selfTest,
          selfTestRun,
        }),
      );
      let latestLocalRun = null;
      if (ctx.options.guardLog) {
        const absolute = path.resolve(ctx.options.guardLog);
        if (!fs.existsSync(absolute))
          throw new Error(`--guard-log ${ctx.options.guardLog} does not exist`);
        const buffer = fs.readFileSync(absolute);
        latestLocalRun = {
          file: path.basename(absolute),
          bytes: buffer.length,
          sha256: sha256(buffer),
          modifiedAt: fs.statSync(absolute).mtime.toISOString(),
          tail: lastLines(buffer.toString('utf8'), GUARD_LOG_LINES),
        };
      }
      const unwired = guards.filter((guard) => !guard.inChain && !guard.inWorkflow).length;
      return {
        headline: `${chain.length} step(s) in ${ROOT_CHAIN}; ${guards.length} guard(s), ${unwired} run by nothing; local guard log ${latestLocalRun ? 'attached' : 'not supplied'}`,
        data: {
          rootChain: ROOT_CHAIN,
          chain,
          hooks: PRE_PUSH_FILES.map((file) => fileDigest(ctx, file)),
          guards,
          latestLocalRun,
        },
      };
    },
  },

  'repo.control-configuration': {
    area: 'change-management',
    describe:
      'Digest and last commit of every file a catalog control names, the deploy and cron settings in vercel.json, and the workflow triggers.',
    async run(ctx) {
      const catalog = readJson(ctx, CATALOG_PATH);
      const files = [
        ...new Set((catalog.controls ?? []).flatMap((control) => control.implementation ?? [])),
      ].sort();
      const digests = [];
      for (const file of files) {
        digests.push({ ...fileDigest(ctx, file), lastCommit: await gitLastCommit(ctx, file) });
      }
      const vercel = ctx.exists('vercel.json') ? readJson(ctx, 'vercel.json') : null;
      const workflows = workflowSources(ctx).map(({ file, source }) => {
        const document = parseYaml(source);
        const on = document?.on ?? document?.[true];
        const triggers =
          typeof on === 'string'
            ? [on]
            : Array.isArray(on)
              ? on.map(String)
              : Object.keys(on ?? {});
        return { file, name: document?.name ?? null, triggers };
      });
      return {
        headline: `${digests.length} control file(s) fingerprinted; git deployments ${vercel?.git?.deploymentEnabled === false ? 'off' : 'on or unset'}; ${(vercel?.crons ?? []).length} cron(s); ${workflows.length} workflow(s)`,
        data: {
          files: digests,
          vercel:
            vercel === null
              ? null
              : {
                  gitDeploymentEnabled: vercel.git?.deploymentEnabled ?? null,
                  crons: vercel.crons ?? [],
                },
          workflows,
        },
      };
    },
  },

  'repo.migration-ledger': {
    area: 'data-protection',
    describe: 'The production migration ledger against the numbered migrations in the tree.',
    async run(ctx) {
      const ledger = readJson(ctx, APPLIED_STATE_PATH);
      const directory = path.join(ctx.root, path.relative(REPO_ROOT, DEFAULT_MIGRATIONS_DIR));
      const migrations = loadMigrationInventory(directory);
      const highest = migrations.reduce((max, migration) => Math.max(max, migration.sequence), 0);
      const pending = migrations
        .filter((migration) => migration.sequence > ledger.appliedThrough)
        .map((migration) => migration.filename);
      return {
        headline: `production applied through ${ledger.appliedThrough} (recorded ${ledger.recordedAt}); tree holds ${migrations.length} migration(s) up to ${highest}, ${pending.length} not yet applied`,
        data: {
          ledgerFile: APPLIED_STATE_PATH,
          ledger,
          migrationsInTree: migrations.length,
          highestInTree: highest,
          notYetApplied: pending,
        },
      };
    },
  },

  'repo.data-protection-guards': {
    area: 'data-protection',
    describe: 'Reruns the row-level access, tenant isolation, erasure graph and legal hold guards.',
    async run(ctx) {
      const results = [];
      for (const guard of DATA_PROTECTION_GUARDS) results.push(await runGuard(ctx, guard));
      return {
        headline: results
          .map(
            (result) =>
              `${path.basename(result.guard, '.mjs')} ${result.passed ? 'passed' : 'FAILED'}`,
          )
          .join(', '),
        data: { results },
      };
    },
  },

  'repo.secret-scan': {
    area: 'vulnerability-management',
    describe: 'Reruns the working-tree secret scan guard.',
    async run(ctx) {
      const result = await runGuard(ctx, SECRET_SCAN_GUARD);
      return { headline: `secret scan ${result.passed ? 'passed' : 'FAILED'}`, data: result };
    },
  },

  'repo.policy-dates': {
    area: 'policy-and-legal',
    describe:
      'Last-updated date of every published policy and the review date and age of every public trust claim.',
    async run(ctx) {
      const dates = readConstantObject(ctx.read(LEGAL_CONSTANTS), 'POLICY_LAST_UPDATED');
      if (dates === null)
        throw new Error(`POLICY_LAST_UPDATED was not found in ${LEGAL_CONSTANTS}`);
      const registry = readJson(ctx, POLICY_REGISTRY);
      const documents = Object.entries(registry.documents ?? {}).map(([key, document]) => {
        const versions = document.versions ?? [];
        return {
          key,
          page: document.page,
          published: dates[key] ?? null,
          latestRecorded: versions.at(-1)?.date ?? null,
          versions: versions.length,
        };
      });
      const trust = readJson(ctx, TRUST_CLAIMS);
      const cadence = trust.reviewCadenceDays;
      const claims = (trust.claims ?? []).map((claim) => {
        const age = ageInDays(claim.reviewedOn, ctx.until);
        return {
          label: claim.label,
          ledger: claim.ledger,
          owner: claim.owner,
          reviewedOn: claim.reviewedOn,
          ageDays: age,
          overdue: age !== null && age > cadence,
        };
      });
      const overdue = claims.filter((claim) => claim.overdue).length;
      const mismatched = documents.filter(
        (document) => document.published !== document.latestRecorded,
      ).length;
      return {
        headline: `${documents.length} policy page(s), ${mismatched} whose page date differs from the latest recorded version; ${claims.length} trust claim(s), ${overdue} older than ${cadence} days`,
        data: {
          policyDates: dates,
          documents,
          trustClaims: { reviewCadenceDays: cadence, claims, overdue },
        },
      };
    },
  },

  'repo.subprocessors': {
    area: 'vendor-inventory',
    describe:
      'The subprocessor list the product publishes at /subprocessors, read from its page source.',
    async run(ctx) {
      const source = ctx.read(SUBPROCESSOR_PAGE);
      const names = recipientNames(source);
      const { declared } = declaredProviderIds(source);
      const dates = readConstantObject(ctx.read(LEGAL_CONSTANTS), 'POLICY_LAST_UPDATED') ?? {};
      return {
        headline: `${names.length} published subprocessor(s), page dated ${dates.subprocessors ?? 'unknown'}`,
        data: {
          page: SUBPROCESSOR_PAGE,
          lastUpdated: dates.subprocessors ?? null,
          subprocessors: names,
          modelProviderIds: [...declared].sort(),
        },
      };
    },
  },

  'repo.known-flaws': {
    area: 'operations',
    describe: 'Open rows of the known flaws register by severity and surface.',
    async run(ctx) {
      const register = parseKnownFlaws(ctx.read(KNOWN_FLAWS));
      return {
        headline: `${register.open} open defect(s): ${JSON.stringify(register.bySeverity)}`,
        data: {
          register: KNOWN_FLAWS,
          lastCommit: await gitLastCommit(ctx, KNOWN_FLAWS),
          ...register,
        },
      };
    },
  },
};

export async function runCollectors(collectors, ctx, { onResult = () => {} } = {}) {
  const results = [];
  for (const [key, collector] of Object.entries(collectors)) {
    const started = Date.now();
    let result;
    try {
      const { headline, data } = await collector.run(ctx);
      result = { collector: key, area: collector.area, status: 'available', headline, data };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result =
        error instanceof Unavailable
          ? { collector: key, area: collector.area, status: 'unavailable', reason }
          : { collector: key, area: collector.area, status: 'error', reason };
    }
    result = redact(
      { ...result, describe: collector.describe, durationMs: Date.now() - started },
      ctx.secrets,
    );
    results.push(result);
    onResult(result);
  }
  return results;
}

function cell(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

export function renderSummary({ catalog, results, meta }) {
  const byKey = new Map(results.map((result) => [result.collector, result]));
  const counts = controlCounts(catalog);
  const coverage = criteriaCoverage(catalog);
  const lines = [
    `# SOC 2 evidence pack, ${day(new Date(meta.since))} to ${day(new Date(meta.until))}`,
    '',
    `Generated ${meta.generatedAt} from commit ${meta.gitHead}${meta.uncommittedFiles > 0 ? ` with ${meta.uncommittedFiles} uncommitted file(s)` : ''}.`,
    `Catalog ${CATALOG_PATH} (sha256 ${meta.catalogSha256.slice(0, 16)}), reviewed ${catalog.lastReviewed}.`,
    '',
    'This pack is evidence for an auditor to test, not an opinion. It claims no certification.',
    '',
    '## Collectors',
    '',
    '| collector | area | status | result |',
    '| --- | --- | --- | --- |',
    ...results.map(
      (result) =>
        `| \`${result.collector}\` | ${result.area} | ${result.status} | ${cell(result.status === 'available' ? result.headline : result.reason)} |`,
    ),
    '',
    '## Controls',
    '',
    `${counts.total} controls: ${counts.operatedAutomated} operated and automated, ${counts.operatedManual} operated and manual, ${counts.notYetOperated} not yet operated; ${counts.outOfScopeCycle1} out of scope for cycle 1 (${(catalog.scope?.cycle1 ?? []).join(' + ')}).`,
    '',
    '| control | criteria | status | cycle 1 | automation | evidence in this pack |',
    '| --- | --- | --- | --- | --- | --- |',
    ...catalog.controls.map((control) => {
      const evidence = control.collectors.map(
        (key) => `${key}: ${byKey.get(key)?.status ?? 'not run'}`,
      );
      if (control.manualEvidence) evidence.push('manual item below');
      return `| ${control.id} ${cell(control.title)} | ${control.criteria.join(', ')} | ${control.status} | ${control.cycle1} | ${control.automation} | ${cell(evidence.join('; ') || 'none')} |`;
    }),
    '',
    '## Criteria',
    '',
    `Cycle 1: ${coverage.cycle1.covered.length} of ${coverage.cycle1.total} in-scope criteria have an operated control; without one: ${coverage.cycle1.uncovered.join(', ') || 'none'}.`,
    '',
    `All categories: ${coverage.covered.length} of ${coverage.total} criteria have an operated control. Named only by a not-yet-operated entry: ${coverage.gapOnly.join(', ') || 'none'}. Named by nothing: ${coverage.unnamed.join(', ') || 'none'}.`,
    '',
    '## Collected by hand for this period',
    '',
    ...catalog.controls
      .filter((control) => control.manualEvidence)
      .map((control) => `- [ ] ${control.id}: ${control.manualEvidence}`),
    '',
    '## Not yet operated',
    '',
    ...catalog.controls
      .filter((control) => control.status === 'not-yet-operated')
      .map((control) => `- ${control.id} ${control.title}: ${control.gap}`),
    '',
    '## Review',
    '',
    'Exceptions found in this pack, and what was done about each:',
    '',
    '- ',
    '',
    'Reviewed by: ______________________  Date: ______________',
    '',
  ];
  return lines.join('\n');
}

export function parseArgs(argv, now = new Date()) {
  const options = { only: null, list: false };
  const value = (index, flag) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case '--since':
      case '--until':
      case '--out':
      case '--repo':
      case '--neon-project':
      case '--vercel-project':
      case '--guard-log':
      case '--only': {
        const raw = value(index, flag);
        index += 1;
        const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        options[key] =
          key === 'only'
            ? raw
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : raw;
        break;
      }
      case '--list':
        options.list = true;
        break;
      default:
        throw new Error(`unknown argument ${flag}`);
    }
  }
  const parseDay = (text, flag) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${flag} must be YYYY-MM-DD`);
    const date = new Date(`${text}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || day(date) !== text)
      throw new Error(`${flag} ${text} is not a calendar date`);
    return date;
  };
  options.until = options.until ? parseDay(options.until, '--until') : now;
  options.since = options.since
    ? parseDay(options.since, '--since')
    : new Date(options.until.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
  if (options.since >= options.until) throw new Error('--since must be before --until');
  return options;
}

export function isInsideTrackedTree(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', path.join(relative, 'manifest.json')], {
      cwd: root,
      stdio: 'ignore',
    });
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = REPO_ROOT;
  const catalogSource = fs.readFileSync(path.join(root, CATALOG_PATH), 'utf8');
  const catalog = JSON.parse(catalogSource);

  if (options.list) {
    for (const [key, collector] of Object.entries(COLLECTORS))
      console.log(`${key}\t${collector.area}\t${collector.describe}`);
    return;
  }

  const errors = validateCatalog(catalog, Object.keys(COLLECTORS), (file) =>
    fs.existsSync(path.join(root, file)),
  );
  if (errors.length > 0) {
    console.error(`${CATALOG_PATH} is not valid, so no pack was collected:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const unknown = (options.only ?? []).filter((key) => !(key in COLLECTORS));
  if (unknown.length > 0)
    throw new Error(`--only names unknown collector(s): ${unknown.join(', ')}`);
  const selected = options.only
    ? Object.fromEntries(Object.entries(COLLECTORS).filter(([key]) => options.only.includes(key)))
    : COLLECTORS;

  const generatedAt = new Date();
  const stamp = generatedAt
    .toISOString()
    .replace(/[:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const outDir = path.resolve(options.out ?? path.join(root, DEFAULT_OUT_ROOT, stamp));
  if (isInsideTrackedTree(root, outDir)) {
    throw new Error(
      `${path.relative(root, outDir)} is not gitignored; an evidence pack must stay out of the repository`,
    );
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0)
    throw new Error(`${outDir} already holds files`);

  const ctx = createContext({ root, since: options.since, until: options.until, options });
  console.error(
    `Collecting SOC 2 evidence for ${day(options.since)} to ${day(options.until)} into ${outDir}`,
  );
  const results = await runCollectors(selected, ctx, {
    onResult: (result) =>
      console.error(
        `  ${result.status.padEnd(11)} ${result.collector}${result.reason ? `: ${result.reason}` : ''}`,
      ),
  });

  const head = await ctx.exec('git', ['rev-parse', 'HEAD']);
  const status = await ctx.exec('git', ['status', '--porcelain']);
  const meta = {
    generatedAt: generatedAt.toISOString(),
    since: options.since.toISOString(),
    until: options.until.toISOString(),
    gitHead: head.stdout.trim(),
    uncommittedFiles: status.stdout.split('\n').filter((line) => line.trim()).length,
    catalogSha256: sha256(catalogSource),
  };

  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const result of results) {
    const file = `${result.collector}.json`;
    const body = `${JSON.stringify({ ...result, period: { since: meta.since, until: meta.until }, collectedAt: meta.generatedAt }, null, 2)}\n`;
    fs.writeFileSync(path.join(outDir, file), body);
    files.push({ file, status: result.status, sha256: sha256(body) });
  }
  const summary = renderSummary({ catalog, results, meta });
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), summary);
  files.push({ file: 'SUMMARY.md', status: 'summary', sha256: sha256(summary) });
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify({ ...meta, catalog: CATALOG_PATH, files }, null, 2)}\n`,
  );

  const tally = countBy(results, (result) => result.status);
  console.error(`Wrote ${files.length + 1} file(s) to ${outDir}: ${JSON.stringify(tally)}`);
  if ((tally.error ?? 0) > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
