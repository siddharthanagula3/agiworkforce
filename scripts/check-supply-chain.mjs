#!/usr/bin/env node
/**
 * The parts of the supply chain that are decidable from the tree: what a
 * container is built from, what an install is allowed to resolve and run, and
 * what a workflow step pipes into a shell. The scanners themselves are
 * enumerated by check-security-gates against .github/security-gate-policy.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = 'scripts/config/supply-chain.json';
const WORKFLOW_DIR = '.github/workflows';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', 'coverage']);
const MIN_REASON = 60;

const WORKSPACE_INSTALL = /(?:^|[\s&|;(])(?:pnpm|npm|yarn)\s+(?:install|ci|i)(?=\s|$)/gm;
const FROZEN = /--frozen-lockfile|--offline|\bnpm\s+ci\b|--immutable/;
const PIPE_TO_SHELL = /\b(?:curl|wget)\b[^\n|]*\|[^\n]*\b(?:ba|z|d)?sh\b/;
const DIGEST = /@sha256:[0-9a-f]{64}/;

function walk(root, relative, out) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return out;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort()) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(root, next, out);
    else out.push(next);
  }
  return out;
}

export function containerFiles(root) {
  return walk(root, '.', []).filter(
    (relative) =>
      /(^|\/)Dockerfile[^/]*$/.test(relative) ||
      /(^|\/)(docker-)?compose[^/]*\.ya?ml$/.test(relative),
  );
}

/**
 * A tag is a moving target; `latest` and an absent tag are the same thing. Both
 * are reported separately from a tag that is merely not a digest.
 */
export function imageReferences(source, relative) {
  const found = [];
  const push = (line, reference) => {
    if (reference.includes('${') || reference.startsWith('$')) return;
    found.push({ file: relative, line, reference });
  };
  source.split('\n').forEach((text, index) => {
    const line = index + 1;
    const from = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/.exec(text);
    if (from !== null) push(line, from[1]);
    const image = /^\s*image:\s*["']?([^"'\s#]+)/.exec(text);
    if (image !== null) push(line, image[1]);
  });
  return found;
}

export function tagOf(reference) {
  const withoutDigest = reference.split('@')[0];
  const lastSegment = withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1);
  const colon = lastSegment.indexOf(':');
  return colon === -1 ? null : lastSegment.slice(colon + 1);
}

export function workflowSteps(root) {
  const dir = path.join(root, WORKFLOW_DIR);
  if (!fs.existsSync(dir)) return [];
  const steps = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue;
    const relative = path.join(WORKFLOW_DIR, name);
    const lines = fs.readFileSync(path.join(root, relative), 'utf8').split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^(\s*)-?\s*run:\s*(.*)$/.exec(lines[index]);
      if (match === null) continue;
      const indent = match[1].length;
      const body = [match[2]];
      let cursor = index + 1;
      for (; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim().length === 0) continue;
        if (lines[cursor].search(/\S/) <= indent) break;
        body.push(lines[cursor]);
      }
      steps.push({ file: relative, line: index + 1, body: body.join('\n') });
      index = cursor - 1;
    }
  }
  return steps;
}

/**
 * `pnpm install` resolves the workspace; `npm install --global vercel@58.4.0`
 * and `pnpm exec playwright install` do not, and a lockfile has nothing to say
 * about either.
 */
export function workspaceInstalls(step) {
  const found = [];
  WORKSPACE_INSTALL.lastIndex = 0;
  let match;
  while ((match = WORKSPACE_INSTALL.exec(step.body)) !== null) {
    const start = match.index + match[0].length - match[0].trimStart().length;
    const end = step.body.slice(start).search(/[\n;]|&&|\|\|/);
    const command = (end === -1 ? step.body.slice(start) : step.body.slice(start, start + end))
      .trim()
      .replace(/\s+/g, ' ');
    const argument = command.split(/\s+/).slice(2);
    if (argument.some((token) => !token.startsWith('-'))) continue;
    if (/\bexec\s+\S+\s*$/.test(step.body.slice(0, match.index + match[0].length))) continue;
    found.push({ file: step.file, line: step.line, command });
  }
  return found;
}

function loadBaseline(root) {
  const absolute = path.join(root, BASELINE_PATH);
  if (!fs.existsSync(absolute)) return {};
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function declaredFor(baseline, key) {
  return new Map((baseline[key] ?? []).map((entry) => [entry.id, entry]));
}

function applyBaseline({ declared, found, failures, key }) {
  const seen = new Set();
  const remaining = [];
  for (const finding of found) {
    const entry = declared.get(finding.id);
    if (entry === undefined) {
      remaining.push(finding);
      continue;
    }
    seen.add(finding.id);
    if ((entry.reason ?? '').trim().length < MIN_REASON) {
      failures.push(`${BASELINE_PATH}: ${key} entry '${finding.id}' needs a reason, not a label`);
    }
  }
  for (const id of declared.keys()) {
    if (!seen.has(id)) {
      failures.push(
        `${BASELINE_PATH}: ${key} entry '${id}' no longer matches anything; delete it so the next one is visible`,
      );
    }
  }
  return remaining;
}

export function checkSupplyChain(root = REPO_ROOT) {
  const failures = [];
  const baseline = loadBaseline(root);
  let images = 0;

  const floating = [];
  const untagged = [];
  for (const relative of containerFiles(root)) {
    for (const reference of imageReferences(
      fs.readFileSync(path.join(root, relative), 'utf8'),
      relative,
    )) {
      images += 1;
      if (DIGEST.test(reference.reference)) continue;
      const tag = tagOf(reference.reference);
      const id = `${reference.file}:${reference.reference}`;
      if (tag === null || tag === 'latest') {
        untagged.push({ ...reference, id });
        continue;
      }
      floating.push({ ...reference, id });
    }
  }

  for (const finding of applyBaseline({
    declared: declaredFor(baseline, 'moving-tags'),
    found: untagged,
    failures,
    key: 'moving-tags',
  })) {
    failures.push(
      `${finding.file}:${finding.line} runs '${finding.reference}', which is whatever was pushed last; name a version`,
    );
  }

  for (const finding of applyBaseline({
    declared: declaredFor(baseline, 'unpinned-tags'),
    found: floating,
    failures,
    key: 'unpinned-tags',
  })) {
    failures.push(
      `${finding.file}:${finding.line} pins '${finding.reference}' by tag, not by digest, so the bytes can change under the same name`,
    );
  }

  const steps = workflowSteps(root);
  const installs = steps.flatMap((step) => workspaceInstalls(step));
  if (installs.length === 0) {
    failures.push(`no ${WORKFLOW_DIR} step installs; the walk would be empty`);
  }
  for (const install of installs) {
    if (FROZEN.test(install.command)) continue;
    failures.push(
      `${install.file}:${install.line} runs '${install.command}' without a frozen lockfile, so CI can resolve a version the lockfile never saw`,
    );
  }

  for (const step of steps) {
    if (!PIPE_TO_SHELL.test(step.body)) continue;
    failures.push(
      `${step.file}:${step.line} pipes a download straight into a shell, so whatever that host serves runs with the job's secrets`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!Array.isArray(manifest.pnpm?.onlyBuiltDependencies)) {
    failures.push(
      'package.json does not declare pnpm.onlyBuiltDependencies, so every transitive package may run an install script',
    );
  }
  if (!fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    failures.push('pnpm-lock.yaml is missing, so nothing records which versions a build resolved');
  }

  return { failures, images, installs: installs.length, steps: steps.length };
}

function main() {
  const { failures, images, installs, steps } = checkSupplyChain(process.cwd());
  if (failures.length > 0) {
    console.error('Supply chain:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} finding(s).`);
    process.exit(1);
  }
  console.log(
    `check-supply-chain: ${images} image reference(s), ${installs} frozen install(s) over ${steps} workflow step(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
