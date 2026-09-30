#!/usr/bin/env node
/**
 * The parts of the supply chain that are decidable from the tree: what a
 * container is built from, what an install is allowed to resolve and run, and
 * what a workflow step pipes into a shell. The scanners themselves are
 * enumerated by check-security-gates against .github/security-gate-policy.json.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { parse as parseToml } from 'smol-toml';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = 'scripts/config/supply-chain.json';
const WORKFLOW_DIR = '.github/workflows';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'target', 'coverage']);
const MIN_REASON = 60;

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
  const files = fs.existsSync(path.join(root, '.git'))
    ? execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean)
    : walk(root, '.', []);
  return files.filter(
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
  for (const command of shellCommands(step.body)) {
    const tokens = shellWords(command);
    const shell = tokens.findIndex((token) => /^(?:.*\/)?(?:sh|bash|dash|zsh)$/.test(token));
    if (
      shell >= 0 &&
      tokens[shell + 1] === '-c' &&
      tokens
        .slice(0, shell)
        .every((token) => token === 'env' || /^[A-Za-z_][A-Za-z_0-9]*=/.test(token))
    ) {
      found.push(...workspaceInstalls({ ...step, body: tokens[shell + 2] ?? '' }));
      continue;
    }
    const manager = tokens.findIndex((token) => /^(pnpm|npm|yarn)$/.test(token));
    if (manager < 0) continue;
    const unsupportedPrefix = tokens
      .slice(0, manager)
      .some(
        (token) =>
          !/^[A-Za-z_][A-Za-z_0-9]*=/.test(token) &&
          !/^(env|sudo|exec|command|then|do|else|if|!|time)$/.test(token),
      );
    if (unsupportedPrefix && /^(echo|printf)$/.test(tokens[0] ?? '')) continue;
    const args = tokens.slice(manager + 1);
    const valueOptions = new Set([
      '--filter',
      '-F',
      '--dir',
      '-C',
      '--prefix',
      '--store-dir',
      '--registry',
      '--cache',
      '--cache-dir',
      '--lockfile-dir',
    ]);
    let operation = 0;
    while (args[operation]?.startsWith('-')) {
      operation += valueOptions.has(args[operation]) ? 2 : 1;
    }
    if (args.includes('--global') || args.includes('-g')) continue;
    if (!/^(install|ci|i)$/.test(args[operation] ?? '')) {
      if (args[0]?.startsWith('-') && args.some((token) => /^(install|ci|i)$/.test(token))) {
        found.push({
          file: step.file,
          line: step.line,
          command: command.trim(),
          manager: tokens[manager],
          operation: 'install',
          flags: [],
          verifiedSyntax: false,
        });
      }
      continue;
    }
    const positional = [];
    const flags = [];
    const booleanOptions = new Set([
      '--frozen-lockfile',
      '--no-frozen-lockfile',
      '--immutable',
      '--offline',
      '--prefer-offline',
      '--prefer-frozen-lockfile',
      '--ignore-scripts',
      '--prod',
      '--production',
      '-P',
      '--dev',
      '-D',
      '--no-optional',
      '--silent',
      '--recursive',
      '-r',
      '--workspace-root',
      '-w',
      '--ignore-pnpmfile',
      '--lockfile-only',
      '--no-save',
      '--ignore-workspace',
      '--shamefully-hoist',
    ]);
    let verifiedSyntax = !unsupportedPrefix;
    for (let index = operation + 1; index < args.length; index++) {
      const token = args[index];
      if (valueOptions.has(token)) {
        index++;
        continue;
      }
      if (/^[0-9]*(?:>|>>|<)$/.test(token)) {
        index++;
        continue;
      }
      if (token.startsWith('-')) {
        flags.push(token);
        if (!booleanOptions.has(token) && !token.includes('=')) verifiedSyntax = false;
      }
      if (!token.startsWith('-') && !/^[0-9]*>/.test(token)) positional.push(token);
    }
    if (
      positional.length > 0 &&
      positional.every((token) => /^(?:@[^/]+\/)?[^@/]+@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(token))
    )
      continue;
    found.push({
      file: step.file,
      line: step.line,
      command: command.trim(),
      manager: tokens[manager],
      operation: args[operation],
      flags,
      verifiedSyntax,
    });
  }
  return found;
}

function shellCommands(source) {
  const commands = [];
  let command = '';
  let quote = null;
  let comment = false;
  const text = source.replace(/\\\r?\n/g, ' ');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (comment && char !== '\n') continue;
    if (char === '\n') comment = false;
    if (char === '\\' && quote !== "'") {
      command += char + (text[++index] ?? '');
      continue;
    }
    if (char === quote) quote = null;
    else if ((char === '"' || char === "'") && quote === null) quote = char;
    else if (char === '#' && quote === null && (command === '' || /\s$/.test(command))) {
      comment = true;
      continue;
    }
    if (quote === null && /[\n;&|()]/.test(char)) {
      if (command.trim()) commands.push(command);
      command = '';
    } else command += char;
  }
  if (command.trim()) commands.push(command);
  return commands;
}

function shellWords(command) {
  const words = [];
  let word = '';
  let quote = null;
  let started = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === '\\' && quote !== "'") {
      word += command[++index] ?? '';
      started = true;
    } else if (char === quote) quote = null;
    else if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      started = true;
    } else if (/\s/.test(char) && quote === null) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (started) words.push(word);
  return words;
}

export function installSteps(root) {
  const steps = [...workflowSteps(root)];
  for (const relative of containerFiles(root).filter((file) =>
    /(^|\/)Dockerfile[^/.]*$/.test(file),
  )) {
    const lines = fs.readFileSync(path.join(root, relative), 'utf8').split('\n');
    for (let index = 0; index < lines.length; index++) {
      const match = /^\s*RUN\s+(.*)$/i.exec(lines[index]);
      if (!match) continue;
      const line = index + 1;
      let body = match[1];
      while (/\\\s*$/.test(body) && index + 1 < lines.length) body += '\n' + lines[++index];
      body = body.replace(/^(?:--[\w-]+=\S+\s+)+/, '');
      if (body.trimStart().startsWith('[')) {
        const command = JSON.parse(body);
        if (!Array.isArray(command) || command.some((word) => typeof word !== 'string'))
          throw new Error(`${relative}:${line} has an invalid JSON RUN instruction`);
        body = command.map((word) => JSON.stringify(word)).join(' ');
      }
      steps.push({ file: relative, line, body });
    }
  }
  const files = fs.existsSync(path.join(root, '.git'))
    ? execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean)
    : walk(root, '.', []);
  for (const relative of files.filter((file) => path.basename(file) === 'vercel.json')) {
    const config = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    if (typeof config.installCommand === 'string')
      steps.push({ file: relative, line: 1, body: config.installCommand });
  }
  return steps;
}

function frozenInstall(install) {
  const flags = install.flags;
  if (!install.verifiedSyntax) return false;
  if (install.manager === 'npm') return install.operation === 'ci';
  if (
    flags.includes('--no-frozen-lockfile') ||
    flags.includes('--frozen-lockfile=false') ||
    flags.includes('--immutable=false')
  )
    return false;
  return (
    flags.includes('--frozen-lockfile') ||
    flags.includes('--frozen-lockfile=true') ||
    (install.manager === 'yarn' && flags.includes('--immutable'))
  );
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

function parseYaml(source) {
  const document = parseDocument(source);
  if (document.errors.length > 0) throw new Error('invalid YAML');
  return document.toJS();
}

function workspaceMembers(root, patterns, exclusions, manifestName) {
  if (
    !Array.isArray(patterns) ||
    !Array.isArray(exclusions) ||
    [...patterns, ...exclusions].some(
      (value) =>
        typeof value !== 'string' ||
        value.trim() === '' ||
        path.posix.isAbsolute(value) ||
        path.win32.isAbsolute(value) ||
        value.split('/').includes('..'),
    )
  ) {
    throw new Error('invalid workspace members');
  }
  return new Set(
    fs
      .globSync(patterns, { cwd: root })
      .map((member) => member.split(path.sep).join('/'))
      .filter(
        (member) =>
          !exclusions.some((pattern) => path.matchesGlob(member, pattern)) &&
          fs.existsSync(path.join(root, member, manifestName)),
      ),
  );
}

function updaterWorkspaceFailures(root) {
  const relative = '.github/dependabot.yml';
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute))
    return [`${relative} is missing; dependency updates are not configured`];
  let configuration;
  try {
    configuration = parseYaml(fs.readFileSync(absolute, 'utf8'));
  } catch {
    return [`${relative} must contain valid YAML`];
  }
  if (
    !configuration ||
    configuration.version !== 2 ||
    !Array.isArray(configuration.updates) ||
    configuration.updates.length === 0
  ) {
    return [`${relative} must define version 2 and a nonempty updates array`];
  }

  const workspaces = new Map();
  try {
    const pnpmWorkspace = path.join(root, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWorkspace)) {
      const definition = parseYaml(fs.readFileSync(pnpmWorkspace, 'utf8'));
      if (!Array.isArray(definition?.packages)) throw new Error('invalid pnpm workspace');
      const exclusions = definition.packages
        .filter((pattern) => typeof pattern === 'string' && pattern.startsWith('!'))
        .map((pattern) => pattern.slice(1));
      const patterns = definition.packages.filter(
        (pattern) => typeof pattern !== 'string' || !pattern.startsWith('!'),
      );
      workspaces.set('npm', {
        name: 'pnpm workspace',
        members: workspaceMembers(root, patterns, exclusions, 'package.json'),
      });
    }
    const cargoManifest = path.join(root, 'Cargo.toml');
    if (fs.existsSync(cargoManifest)) {
      const definition = parseToml(fs.readFileSync(cargoManifest, 'utf8'));
      if (definition.workspace !== undefined) {
        if (
          !definition.workspace ||
          typeof definition.workspace !== 'object' ||
          Array.isArray(definition.workspace)
        ) {
          throw new Error('invalid Cargo workspace');
        }
        workspaces.set('cargo', {
          name: 'Cargo workspace',
          members: workspaceMembers(
            root,
            definition.workspace.members ?? [],
            definition.workspace.exclude ?? [],
            'Cargo.toml',
          ),
        });
      }
    }
  } catch {
    return [`${relative} cannot validate workspace ownership from the current manifests`];
  }
  const roots = new Set();
  const failures = [];
  configuration.updates.forEach((update, index) => {
    const label = `${relative} updates[${index}]`;
    if (
      !update ||
      Array.isArray(update) ||
      typeof update['package-ecosystem'] !== 'string' ||
      update['package-ecosystem'].trim() === ''
    ) {
      failures.push(`${label} must define a package ecosystem`);
      return;
    }
    if ((update.directory !== undefined) === (update.directories !== undefined)) {
      failures.push(`${label} must define exactly one of directory or directories`);
      return;
    }
    const directories = update.directory !== undefined ? [update.directory] : update.directories;
    if (
      !Array.isArray(directories) ||
      directories.length === 0 ||
      directories.some(
        (directory) =>
          typeof directory !== 'string' ||
          !directory.startsWith('/') ||
          directory.includes('\\') ||
          path.posix.normalize(directory) !== directory,
      )
    ) {
      failures.push(`${label} must define nonempty repository-relative directory values`);
      return;
    }
    const workspace = workspaces.get(update['package-ecosystem']);
    if (workspace === undefined) return;
    if (
      directories.some((directory) => {
        const target = directory.slice(1).replace(/\/$/, '');
        return (
          target !== '' &&
          [...workspace.members].some(
            (member) =>
              member === target ||
              member.startsWith(`${target}/`) ||
              path.matchesGlob(member, target),
          )
        );
      })
    ) {
      failures.push(
        `${label} updates a ${workspace.name} member without its shared root; use only /`,
      );
      return;
    }
    if (directories.includes('/')) roots.add(update['package-ecosystem']);
  });
  for (const [ecosystem, workspace] of workspaces) {
    if (!roots.has(ecosystem))
      failures.push(`${relative} must configure the ${workspace.name} root updater`);
  }
  return failures;
}

export function checkSupplyChain(root = REPO_ROOT) {
  const failures = updaterWorkspaceFailures(root);
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
  const installs = installSteps(root).flatMap((step) => workspaceInstalls(step));
  if (steps.flatMap((step) => workspaceInstalls(step)).length === 0) {
    failures.push(`no ${WORKFLOW_DIR} step installs; the walk would be empty`);
  }
  for (const install of installs) {
    if (frozenInstall(install)) continue;
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
