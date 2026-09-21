#!/usr/bin/env node

// A change to a routed provider adapter or to Auto routing must start the suite that
// would catch its regression: adapters come from the compiled registry, triggers from CI.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const REGISTRY_PATH = 'packages/ai/model-registry/generated/registry.json';
export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const EVALS_WORKFLOW = '.github/workflows/evals.yml';
export const WORKSPACE_PACKAGE_ROOTS = Object.freeze(['packages/ai/providers']);

/** Adapters the registry names by runtime rather than by module, and the suite that covers each. */
export const RUNTIME_ADAPTER_SUITES = Object.freeze({
  'managed-media': 'apps/web/app/api/media',
});

/** Files whose edit changes what Auto resolves: the resolver and the policy it compiles from. */
export const ROUTING_SOURCES = Object.freeze([
  'packages/ai/routing/src/auto.ts',
  'packages/ai/model-registry/catalog/routing-policies.json',
  'packages/ai/model-registry/generated/registry.json',
]);

/** The routing simulation: both resolvers replay the shared fixture of pinned decisions. */
export const ROUTING_REPLAYS = Object.freeze([
  {
    label: 'the TypeScript Auto resolver replay',
    command: /@agiworkforce\/routing\b.*\bvitest run auto-route-conformance\b/,
  },
  {
    label: 'the Rust Auto resolver replay',
    command: /cargo test -p agiworkforce-model-registry --test auto_route_conformance\b/,
  },
]);

export const AFFECTED_TESTS_COMMAND = /\bpnpm test:affected\b/;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', '.next']);

function readJson(repoRoot, relative) {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
}

function readWorkflow(repoRoot, relative) {
  return parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
}

export function globToRegExp(glob) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*';
      index += 1;
      if (glob[index + 1] === '/') index += 1;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** Whether a push or pull request touching `file` starts the workflow under `trigger`. */
export function triggerRuns(trigger, file) {
  if (trigger === undefined) return false;
  if (trigger === null) return true;
  const include = trigger.paths;
  const ignore = trigger['paths-ignore'];
  if (Array.isArray(include) && !include.some((glob) => globToRegExp(glob).test(file))) {
    return false;
  }
  if (Array.isArray(ignore) && ignore.some((glob) => globToRegExp(glob).test(file))) {
    return false;
  }
  return true;
}

function triggerFindings(workflowPath, workflow, file, reason) {
  const on = workflow?.on ?? {};
  const findings = [];
  for (const event of ['pull_request', 'push']) {
    if (!triggerRuns(on[event], file)) {
      findings.push(
        `${workflowPath}: a ${event} that changes ${file} does not start it (${reason})`,
      );
    }
  }
  return findings;
}

/** Commands that run on every start of the workflow: no job or step condition, no soft failure. */
export function unconditionalCommands(workflow) {
  const commands = [];
  for (const job of Object.values(workflow?.jobs ?? {})) {
    if (!job || typeof job !== 'object') continue;
    if (job.if !== undefined || job['continue-on-error'] === true) continue;
    for (const step of Array.isArray(job.steps) ? job.steps : []) {
      if (!step || typeof step.run !== 'string') continue;
      if (step.if !== undefined || step['continue-on-error'] === true) continue;
      commands.push(step.run);
    }
  }
  return commands;
}

function workspacePackages(repoRoot) {
  const packages = new Map();
  for (const root of WORKSPACE_PACKAGE_ROOTS) {
    const absolute = path.join(repoRoot, root);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(absolute, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      packages.set(pkg.name, { dir: `${root}/${entry.name}`, scripts: pkg.scripts ?? {} });
    }
  }
  return packages;
}

export function countTestFiles(repoRoot, relativeDir) {
  const absolute = path.join(repoRoot, relativeDir);
  if (!existsSync(absolute)) return 0;
  let count = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (TEST_FILE.test(entry.name)) {
        count += 1;
      }
    }
  };
  walk(absolute);
  return count;
}

/** Every adapter that serves at least one route, with the harnesses that name it. */
export function routedAdapters(registry) {
  const routed = new Set(Object.values(registry.routes ?? {}).map((route) => route.harnessId));
  const adapters = new Map();
  for (const [harnessId, harness] of Object.entries(registry.harnesses ?? {})) {
    if (!routed.has(harnessId)) continue;
    const list = adapters.get(harness.adapter) ?? [];
    list.push(harnessId);
    adapters.set(harness.adapter, list);
  }
  return adapters;
}

function adapterSuiteDir(adapter, packages) {
  if (adapter.startsWith('@')) {
    const pkg = packages.get(adapter);
    return pkg ? { dir: pkg.dir, pkg } : null;
  }
  if (adapter.includes('/')) return { dir: adapter, pkg: null };
  const declared = RUNTIME_ADAPTER_SUITES[adapter];
  return declared ? { dir: declared, pkg: null } : null;
}

export function checkModelChangeSuites(repoRoot = REPO_ROOT) {
  const errors = [];
  const registry = readJson(repoRoot, REGISTRY_PATH);
  const ci = readWorkflow(repoRoot, CI_WORKFLOW);
  const evals = readWorkflow(repoRoot, EVALS_WORKFLOW);
  const rootManifest = readJson(repoRoot, 'package.json');
  const ciCommands = unconditionalCommands(ci);

  const adapters = routedAdapters(registry);
  if (adapters.size === 0) {
    errors.push(`${REGISTRY_PATH}: no harness serves a route, so this check would pass vacuously`);
  }

  const affected = rootManifest.scripts?.['test:affected'] ?? '';
  if (!/\bturbo run test\b/.test(affected) || !/--affected\b/.test(affected)) {
    errors.push(
      `package.json: test:affected is "${affected}", which no longer runs each changed package's own test suite`,
    );
  }
  if (!ciCommands.some((command) => AFFECTED_TESTS_COMMAND.test(command))) {
    errors.push(
      `${CI_WORKFLOW}: no unconditional step runs \`pnpm test:affected\`, so an adapter change runs no adapter suite`,
    );
  }

  const packages = workspacePackages(repoRoot);
  let adaptersChecked = 0;
  for (const [adapter, harnessIds] of [...adapters.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const owners = harnessIds.join(', ');
    const suite = adapterSuiteDir(adapter, packages);
    if (suite === null) {
      errors.push(
        `${adapter} (serving ${owners}) resolves to no workspace package and no declared runtime suite`,
      );
      continue;
    }
    adaptersChecked += 1;
    if (suite.pkg && typeof suite.pkg.scripts.test !== 'string') {
      errors.push(`${suite.dir}: ${adapter} has no test script, so a change to it runs nothing`);
    }
    if (countTestFiles(repoRoot, suite.dir) === 0) {
      errors.push(
        `${suite.dir}: ${adapter} (serving ${owners}) has no test file, so its suite passes without testing anything`,
      );
    }
    const representative = `${suite.dir}/src/index.ts`;
    errors.push(...triggerFindings(CI_WORKFLOW, ci, representative, `${adapter} serves ${owners}`));
    if (suite.pkg) {
      errors.push(
        ...triggerFindings(EVALS_WORKFLOW, evals, representative, `${adapter} serves ${owners}`),
      );
    }
  }

  for (const source of ROUTING_SOURCES) {
    if (!existsSync(path.join(repoRoot, source))) {
      errors.push(`${source}: routing source is gone; update ROUTING_SOURCES`);
      continue;
    }
    errors.push(...triggerFindings(CI_WORKFLOW, ci, source, 'it changes what Auto resolves'));
  }
  for (const replay of ROUTING_REPLAYS) {
    if (!ciCommands.some((command) => replay.command.test(command))) {
      errors.push(
        `${CI_WORKFLOW}: no unconditional step runs ${replay.label}, so a routing change can merge unsimulated`,
      );
    }
  }

  return { errors, adaptersChecked, routingSources: ROUTING_SOURCES.length };
}

function main() {
  const { errors, adaptersChecked, routingSources } = checkModelChangeSuites(REPO_ROOT);
  if (errors.length > 0) {
    console.error('model-change suites check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `model-change suites: ${adaptersChecked} routed adapter(s) each run a non-empty suite on change, ` +
      `and ${routingSources} routing source(s) each start both resolver replays.`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
