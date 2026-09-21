#!/usr/bin/env node
/**
 * One deployment answers many shipped builds. Two things make that true, and
 * neither is visible in a diff: every refusal of a caller for its build is
 * accounted for with the remedy it hands back, and no handler grows a private
 * version gate beside the evaluator that already owns version-dependent
 * behaviour as data.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

export const INVENTORY_PATH = 'scripts/config/client-upgrade-refusals.json';
const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', '__tests__', '__mocks__']);
const MIN_SENTENCE = 40;

/** Every way this server can tell a caller its build is too old to be served. */
const REFUSAL_TRIGGERS = [
  { id: 'createError.clientUpdateRequired', pattern: /createError\.clientUpdateRequired\s*\(/ },
  { id: 'ErrorCode.CLIENT_UPDATE_REQUIRED', pattern: /ErrorCode\.CLIENT_UPDATE_REQUIRED\b/ },
  { id: 'protocol upgrade code', pattern: /code:\s*'[A-Z_]*PROTOCOL[A-Z_]*UPGRADE_REQUIRED'/ },
  { id: 'HTTP 426', pattern: /status:\s*426\b/ },
];

/**
 * The version-dependent behaviour a caller can observe is evaluated from flag
 * data, so a broken build is closed by a rule that reaches it on its next
 * request. A handler that reads the version itself decides in code instead,
 * which ships on the next release and cannot be undone without one.
 */
const PRIVATE_GATE_PATTERN =
  /'x-agi-client-version'|"x-agi-client-version"|\bCLIENT_VERSION_HEADER\b|\bME_CLIENT_VERSION_PARAM\b/;

/** Named so a refusal that says only "update" instead of naming the version fails. */
const NAMES_A_VERSION = /MIN(?:IMUM)?_?[A-Z_]*VERSION\b|_PROTOCOL_VERSION\b/;

function sourceFiles(relativeRoot) {
  const abs = path.join(scanRoot, relativeRoot);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) step(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
    }
  };
  step(abs);
  return out.sort();
}

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}

export function scanFile(relativePath, source) {
  const code = stripComments(source);
  const findings = [];
  for (const trigger of REFUSAL_TRIGGERS) {
    if (trigger.pattern.test(code)) findings.push({ file: relativePath, trigger: trigger.id });
  }
  return {
    findings,
    privateGate: PRIVATE_GATE_PATTERN.test(code),
    namesVersion: NAMES_A_VERSION.test(code),
  };
}

const files = SCAN_ROOTS.flatMap(sourceFiles);
const errors = [];
const refusals = [];
const gates = [];
const namesVersionByFile = new Map();

for (const file of files) {
  const { findings, privateGate, namesVersion } = scanFile(
    file,
    fs.readFileSync(path.join(scanRoot, file), 'utf8'),
  );
  refusals.push(...findings);
  namesVersionByFile.set(file, namesVersion);
  if (privateGate && file.startsWith('apps/web/app/')) gates.push(file);
}

if (files.length < 200) {
  console.error(
    `check-client-version-compatibility: scanned only ${files.length} files; the scan roots are stale`,
  );
  process.exit(1);
}

const inventoryAbs = path.join(scanRoot, INVENTORY_PATH);
if (!fs.existsSync(inventoryAbs)) {
  console.error(`check-client-version-compatibility: missing ${INVENTORY_PATH}`);
  process.exit(1);
}
const inventory = JSON.parse(fs.readFileSync(inventoryAbs, 'utf8'));
const declared = Array.isArray(inventory.refusals) ? inventory.refusals : [];

if (refusals.length === 0) {
  console.error(
    'check-client-version-compatibility: found no refusal site at all; the trigger list no longer ' +
      'matches how this server refuses an old build',
  );
  process.exit(1);
}

const declaredKeys = new Set(declared.map((entry) => `${entry.file}::${entry.trigger}`));
for (const finding of refusals) {
  const key = `${finding.file}::${finding.trigger}`;
  if (declaredKeys.has(key)) continue;
  errors.push(
    `${finding.file} refuses a caller for its build (${finding.trigger}) and is not in ` +
      `${INVENTORY_PATH}. Every forced update is accounted for there with what it refuses and the ` +
      'remedy the caller is handed.',
  );
}

const foundKeys = new Set(refusals.map((finding) => `${finding.file}::${finding.trigger}`));
for (const entry of declared) {
  const key = `${entry.file}::${entry.trigger}`;
  if (!foundKeys.has(key)) {
    errors.push(`${INVENTORY_PATH} still lists ${key}, which no longer refuses anything.`);
    continue;
  }
  for (const field of ['refuses', 'remedy']) {
    if (typeof entry[field] !== 'string' || entry[field].trim().length < MIN_SENTENCE) {
      errors.push(`${INVENTORY_PATH} entry ${key} needs a ${field} sentence of real content.`);
    }
  }
  if (namesVersionByFile.get(entry.file) !== true) {
    errors.push(
      `${entry.file} refuses a build without naming the version this deployment needs, so the ` +
        'caller is told to update and not what to update to.',
    );
  }
}

for (const file of gates) {
  errors.push(
    `${file} reads the client version itself. Version-dependent behaviour belongs in the flag ` +
      'evaluator, where a rule reaches a shipped build on its next request instead of its next release.',
  );
}

if (errors.length > 0) {
  console.error('Client version compatibility:');
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

console.log(
  `check-client-version-compatibility: ${files.length} server files, ${refusals.length} accounted ` +
    'forced-update refusal(s), no private version gate in a handler',
);
