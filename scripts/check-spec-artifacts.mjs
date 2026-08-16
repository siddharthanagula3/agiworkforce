#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(__dirname, '..', 'docs', 'spec', 'artifacts');

const COMMON_KEYS = ['schema_version', 'generated_at'];
const SPEC = {
  'engineering_rules.json': ['invariants', 'rules'],
  'feature_matrix.json': ['surfaces', 'features'],
  'competitor_matrix.json': ['capabilities'],
  'implementation_map.json': ['domains'],
  'dependency_graph.json': ['nodes', 'edges', 'verification_rules'],
  'release_checklist.json': ['surfaces'],
  'roadmap.json': ['now', 'next', 'later'],
  'architecture_report.json': ['modes', 'invariants', 'code_reality', 'risk_register'],
};

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, diff: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') args.dir = resolveDir(argv[++i]);
    else if (a === '--diff') args.diff = resolveDir(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function resolveDir(p) {
  if (!p) throw new Error('Expected a directory path after the flag');
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

function readArtifact(dir, file) {
  const path = join(dir, file);
  if (!existsSync(path)) return { path, missing: true };
  const raw = readFileSync(path, 'utf8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { path, parseError: err.message };
  }
  return { path, json };
}

function validate(dir) {
  const errors = [];
  const loaded = {};
  for (const [file, requiredKeys] of Object.entries(SPEC)) {
    const res = readArtifact(dir, file);
    if (res.missing) {
      errors.push(`${file}: missing (expected at ${res.path})`);
      continue;
    }
    if (res.parseError) {
      errors.push(`${file}: invalid JSON — ${res.parseError}`);
      continue;
    }
    loaded[file] = res.json;
    const json = res.json;
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      errors.push(`${file}: top-level value must be a JSON object`);
      continue;
    }
    for (const key of [...COMMON_KEYS, ...requiredKeys]) {
      if (!(key in json)) errors.push(`${file}: missing required top-level key "${key}"`);
    }
    if (json.schema_version !== undefined && typeof json.schema_version !== 'string') {
      errors.push(`${file}: schema_version must be a string`);
    }
    if (
      json.generated_at !== undefined &&
      !(typeof json.generated_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.generated_at))
    ) {
      errors.push(`${file}: generated_at must be a YYYY-MM-DD string`);
    }
  }
  return { errors, loaded };
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function diffArtifacts(oldDir, newDir) {
  const lines = [];
  for (const file of Object.keys(SPEC)) {
    const oldRes = readArtifact(oldDir, file);
    const newRes = readArtifact(newDir, file);
    const oldJson = oldRes.json;
    const newJson = newRes.json;
    if (oldRes.missing && newRes.missing) continue;
    if (oldRes.missing) {
      lines.push(`+ ${file} (new file)`);
      continue;
    }
    if (newRes.missing) {
      lines.push(`- ${file} (removed file)`);
      continue;
    }
    if (oldRes.parseError || newRes.parseError) {
      lines.push(`? ${file} (unparseable on one side; skipped)`);
      continue;
    }
    const oldKeys = new Set(Object.keys(oldJson));
    const newKeys = new Set(Object.keys(newJson));
    const fileLines = [];
    for (const k of newKeys) if (!oldKeys.has(k)) fileLines.push(`    + ${k}`);
    for (const k of oldKeys) if (!newKeys.has(k)) fileLines.push(`    - ${k}`);
    for (const k of newKeys) {
      if (oldKeys.has(k) && stableStringify(oldJson[k]) !== stableStringify(newJson[k])) {
        fileLines.push(`    ~ ${k} (changed)`);
      }
    }
    if (fileLines.length) {
      lines.push(`~ ${file}`);
      lines.push(...fileLines);
    }
  }
  return lines;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(
      [
        'check-spec-artifacts.mjs — validate AGI spec artifacts',
        '',
        '  --dir <dir>    artifacts directory (default: docs/spec/artifacts)',
        '  --diff <old>   print added/removed/changed top-level entries vs <old>',
        '  --help         show this help',
      ].join('\n'),
    );
    process.exit(0);
  }

  const { errors } = validate(args.dir);

  if (args.diff) {
    const drift = diffArtifacts(args.diff, args.dir);
    console.log(`Drift: ${args.diff} -> ${args.dir}`);
    if (drift.length === 0) console.log('  (no top-level changes)');
    else for (const line of drift) console.log('  ' + line);
  }

  if (errors.length) {
    console.error(`\nFAIL: ${errors.length} artifact validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`OK: ${Object.keys(SPEC).length} spec artifacts valid (${args.dir})`);
  process.exit(0);
}

main();
