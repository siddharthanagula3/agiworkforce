#!/usr/bin/env node
// A runbook is read under pressure, so everything in it that names something in
// this repository has to still be here: every command an operator is told to
// run, every file path it points at, and every setting it names.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RUNBOOK_DIR = 'docs/runbooks';
export const WORKFLOW_DIR = '.github/workflows';

export const REQUIRED_HEADERS = ['Status:', 'Owner:', 'Last updated:'];

// Where a setting named in a runbook has to be readable from. A name nothing in
// these trees mentions is a setting that has been renamed or removed.
export const SETTING_ROOTS = ['apps', 'packages', 'crates', 'scripts', 'infrastructure', '.github'];

// Runners whose first non-flag argument is a path in this repository.
const PATH_RUNNERS = new Set(['node', 'tsx', 'bash', 'sh']);

// pnpm subcommands that run no package script. `pnpm run <name>` is the only way
// to run a script that shares one of these names.
const PNPM_BUILT_INS = new Set([
  'add',
  'audit',
  'bin',
  'cache',
  'config',
  'create',
  'dedupe',
  'deploy',
  'dlx',
  'env',
  'fetch',
  'i',
  'import',
  'init',
  'install',
  'licenses',
  'link',
  'list',
  'ln',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'root',
  'setup',
  'store',
  'unlink',
  'up',
  'update',
  'upgrade',
  'why',
]);

const SETTING_SHAPE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

// A backticked token that names something on disk rather than a word in prose.
const PATH_SHAPE =
  /^(?:apps|packages|crates|scripts|docs|infrastructure|tools|examples|patches|\.github|\.claude)\/[\w./*[\]@-]+$/;

function listRunbooks(root) {
  const dir = path.join(root, RUNBOOK_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({
      file: `${RUNBOOK_DIR}/${name}`,
      source: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

/** Fenced command lines and the backticked tokens of the prose around them. */
export function readRunbookReferences(source) {
  const commands = [];
  const tokens = new Set();
  let inFence = false;
  let continued = '';

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      inFence = !inFence;
      continued = '';
      continue;
    }
    if (inFence) {
      if (!line || line.startsWith('#')) continue;
      const joined = continued ? `${continued} ${line.replace(/\\$/, '').trim()}` : line;
      if (line.endsWith('\\')) {
        continued = joined.replace(/\\$/, '').trim();
        continue;
      }
      continued = '';
      commands.push(joined);
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) tokens.add(match[1].trim());
  }
  return { commands, tokens: [...tokens] };
}

/** What a command line tells an operator to run, or null when it runs nothing here. */
export function resolveCommandTarget(command) {
  const words = command.split(/\s+/).filter(Boolean);
  const [runner, ...rest] = words;
  if (!runner) return null;

  if (PATH_RUNNERS.has(runner)) {
    const target = rest.find((word) => !word.startsWith('-'));
    if (!target || !target.includes('/') || target.includes('<')) return null;
    return { kind: 'file', value: target };
  }

  if (runner === 'gh' && rest[0] === 'workflow' && rest[1] === 'run') {
    const target = rest.slice(2).find((word) => !word.startsWith('-'));
    return target ? { kind: 'workflow', value: target } : null;
  }

  if (runner === 'pnpm' || runner === 'npm' || runner === 'yarn') {
    const words = [...rest];
    let filter = null;
    let explicitRun = false;
    while (words.length > 0) {
      const word = words[0];
      if (word === '--filter' || word === '-F') {
        words.shift();
        filter = words.shift() ?? null;
        continue;
      }
      if (word === 'run' || word === 'exec' || word.startsWith('-')) {
        if (word === 'exec') return null;
        if (word === 'run') explicitRun = true;
        words.shift();
        continue;
      }
      break;
    }
    const script = words[0];
    if (!script || script.includes('<')) return null;
    if (runner === 'pnpm' && !explicitRun && PNPM_BUILT_INS.has(script)) return null;
    return { kind: 'script', value: script, filter };
  }

  return null;
}

function readManifest(root, relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function workspacePatterns(root) {
  const file = path.join(root, 'pnpm-workspace.yaml');
  if (!fs.existsSync(file)) return [];
  const patterns = [];
  let inPackages = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (/^\S/.test(line)) inPackages = /^packages:\s*$/.test(line);
    else if (inPackages) {
      const entry = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*(?:#.*)?$/.exec(line);
      if (entry) patterns.push(entry[1]);
    }
  }
  return patterns;
}

function expandWorkspacePattern(root, pattern) {
  let directories = [''];
  for (const segment of pattern.split('/')) {
    const next = [];
    for (const directory of directories) {
      if (segment !== '*') {
        next.push(path.posix.join(directory, segment));
        continue;
      }
      const absolute = path.join(root, directory);
      if (!fs.existsSync(absolute)) continue;
      for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          next.push(path.posix.join(directory, entry.name));
        }
      }
    }
    directories = next;
  }
  return directories;
}

/** The package a `--filter` names, found by manifest name rather than by directory. */
function packageScripts(root, filter) {
  const rootManifest = readManifest(root, 'package.json');
  if (!filter) {
    return rootManifest ? { relative: 'package.json', scripts: rootManifest.scripts ?? {} } : null;
  }
  if (rootManifest?.name === filter) {
    return { relative: 'package.json', scripts: rootManifest.scripts ?? {} };
  }
  for (const pattern of workspacePatterns(root)) {
    for (const directory of expandWorkspacePattern(root, pattern)) {
      const relative = path.posix.join(directory, 'package.json');
      const manifest = readManifest(root, relative);
      if (manifest?.name === filter) return { relative, scripts: manifest.scripts ?? {} };
    }
  }
  return null;
}

function existsOnDisk(root, relative) {
  const target = path.join(root, relative.replace(/\/$/, ''));
  if (fs.existsSync(target)) return true;
  if (!relative.includes('*')) return false;
  const parent = path.join(root, path.dirname(relative));
  return fs.existsSync(parent);
}

function settingFiles(root) {
  if (fs.existsSync(path.join(root, '.git'))) {
    const output = execFileSync(
      'git',
      ['ls-files', '-c', '-o', '--exclude-standard', '-z', '--', ...SETTING_ROOTS],
      { cwd: root, encoding: 'utf8' },
    );
    return output
      .split('\0')
      .filter(Boolean)
      .map((relative) => path.join(root, relative));
  }

  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  for (const directory of SETTING_ROOTS) visit(path.join(root, directory));
  return files;
}

/** Settings each root mentions, read once rather than per name. */
function mentionedSettings(root, names) {
  if (names.length === 0) return new Set();
  let files;
  try {
    files = settingFiles(root);
  } catch {
    return null;
  }
  const found = new Set();
  const pattern = new RegExp(`\\b(?:${names.join('|')})\\b`, 'g');
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    if (source.includes('\0')) continue;
    for (const match of source.matchAll(pattern)) found.add(match[0]);
    if (found.size === names.length) break;
  }
  return found;
}

export function runRunbookCommandsCheck(root) {
  const failures = [];
  const runbooks = listRunbooks(root);
  if (runbooks.length === 0) return [`${RUNBOOK_DIR} holds no runbooks`];

  const settingNames = new Set();

  for (const runbook of runbooks) {
    for (const header of REQUIRED_HEADERS) {
      if (!runbook.source.includes(`\n${header}`)) {
        failures.push(`${runbook.file}: no "${header}" header`);
      }
    }

    const { commands, tokens } = readRunbookReferences(runbook.source);

    for (const command of commands) {
      const target = resolveCommandTarget(command);
      if (!target) continue;
      if (target.kind === 'file') {
        if (!existsOnDisk(root, target.value)) {
          failures.push(
            `${runbook.file}: tells an operator to run "${command}" but ${target.value} does not exist`,
          );
        }
        continue;
      }
      if (target.kind === 'workflow') {
        const named = target.value.endsWith('.yml') || target.value.endsWith('.yaml');
        if (named && !existsOnDisk(root, `${WORKFLOW_DIR}/${target.value}`)) {
          failures.push(
            `${runbook.file}: names workflow "${target.value}", which ${WORKFLOW_DIR} does not hold`,
          );
        }
        continue;
      }
      const resolved = packageScripts(root, target.filter);
      if (!resolved) {
        failures.push(
          `${runbook.file}: "${command}" names package "${target.filter}", which has no manifest`,
        );
        continue;
      }
      if (!(target.value in resolved.scripts)) {
        failures.push(
          `${runbook.file}: "${command}" names script "${target.value}", which ${resolved.relative} does not define`,
        );
      }
    }

    for (const token of tokens) {
      if (SETTING_SHAPE.test(token)) {
        settingNames.add(token);
        continue;
      }
      const cleaned = token.replace(/:\d+(?:-\d+)?$/, '');
      if (!PATH_SHAPE.test(cleaned)) continue;
      if (!existsOnDisk(root, cleaned)) {
        failures.push(`${runbook.file}: points at ${cleaned}, which does not exist`);
      }
    }
  }

  const names = [...settingNames].sort();
  const mentioned = mentionedSettings(root, names);
  if (mentioned === null) {
    failures.push('the settings named in the runbooks could not be searched for');
  } else {
    for (const name of names) {
      if (!mentioned.has(name)) {
        failures.push(
          `${RUNBOOK_DIR}: the runbooks name setting ${name}, which nothing under ${SETTING_ROOTS.join(', ')} reads`,
        );
      }
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runRunbookCommandsCheck(root);
  if (failures.length > 0) {
    console.error('Runbooks point at things that are not there:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log('check-runbook-commands: every command, path and setting a runbook names exists.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
