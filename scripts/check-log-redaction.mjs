#!/usr/bin/env node

/**
 * Two ways a structured log line goes wrong, measured against the same
 * vocabulary the runtime redactor uses rather than a second copy of it:
 * a field that carries a person, and a field the redactor throws away so the
 * line names nothing. The redactor is a net, not a decision: a call site that
 * relies on it is one deployment setting away from a leak.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { FIELDS_NEVER_LOGGED } from '../apps/web/lib/identity/log-hygiene.ts';
import {
  deniedValueSurvives,
  isDeniedFieldName,
  keySegments,
  neverLoggedSet,
} from '../apps/web/lib/observability/log-field-policy.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BASELINE_PATH = 'scripts/config/log-redaction.json';

export const SCANNED_ROOTS = Object.freeze(['apps/web/app/api', 'apps/web/lib']);

/** A log field named for one of these carries a person, whatever the net does. */
export const PERSONAL_SEGMENTS = Object.freeze([
  'address',
  'dob',
  'email',
  'iban',
  'phone',
  'postcode',
  'ssn',
  'zipcode',
]);

const EXCLUDED_DIRECTORY = /^(__tests__|__mocks__|__fixtures__|node_modules|dist|build|coverage)$/;

const LOG_CALL = /\b(?:logger|log|console)\s*\.\s*(?:trace|debug|info|warn|error|fatal|log)\s*\(/g;

/** What the redactor keeps: a presence flag, a count, a length or a size. */
const SURVIVING_EXPRESSION =
  /^(?:Boolean\(|Number\(|!|true$|false$|\d+$)|(?:\.length|\.size|Count|_count)\b|\?\.length/;

export function productFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return EXCLUDED_DIRECTORY.test(entry.name) ? [] : productFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.(test|spec|d)\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

/** Literals removed: a banned name inside the message is prose, not a value. */
export function codeOfCall(callText) {
  return callText
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '``')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

export function logCallSites(source) {
  const sites = [];
  LOG_CALL.lastIndex = 0;
  let match;
  while ((match = LOG_CALL.exec(source)) !== null) {
    let index = LOG_CALL.lastIndex;
    let depth = 1;
    while (index < source.length && depth > 0) {
      const character = source[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      index += 1;
    }
    sites.push({
      line: source.slice(0, match.index).split('\n').length,
      text: source.slice(match.index, index),
    });
    LOG_CALL.lastIndex = index;
  }
  return sites;
}

/** Each property of the object literals in the call, name and expression. */
export function loggedFields(callText) {
  const code = codeOfCall(callText);
  const fields = [];
  // A "${" opens an interpolation, not an object literal. The separator is a
  // lookahead so a comma can both close one property and open the next.
  const property = /(?<!\$)[{,]\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?=([,:}]))/g;
  let match;
  while ((match = property.exec(code)) !== null) {
    const [, name, separator] = match;
    if (separator !== ':') {
      fields.push({ name, expression: name });
      continue;
    }
    const rest = code.slice(property.lastIndex + 1);
    const end = rest.search(/[,}]/);
    fields.push({ name, expression: (end === -1 ? rest : rest.slice(0, end)).trim() });
  }
  return fields;
}

export function classifyField({ name, expression }, neverLogged) {
  const segments = keySegments(name);
  const final = segments[segments.length - 1];
  if (final !== undefined && PERSONAL_SEGMENTS.includes(final)) return 'personal-data';
  if (!isDeniedFieldName(name, neverLogged)) return null;
  // Probe with what the expression actually produces, so a count under a
  // credential-shaped name is measured as a count and not as a presence flag.
  const probe = /^(?:Boolean\(|!|true$|false$)/.test(expression) ? true : 1;
  if (deniedValueSurvives(name, probe) && SURVIVING_EXPRESSION.test(expression)) return null;
  return 'redacted-field';
}

export function loadBaseline(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8'));
}

export function scan(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const neverLogged = neverLoggedSet(FIELDS_NEVER_LOGGED);
  const findings = [];
  let files = 0;
  let sites = 0;

  for (const root of roots) {
    for (const file of productFiles(path.join(repoRoot, root))) {
      files += 1;
      const relative = path.relative(repoRoot, file);
      for (const site of logCallSites(readFileSync(file, 'utf8'))) {
        sites += 1;
        const seen = new Set();
        for (const field of loggedFields(site.text)) {
          const rule = classifyField(field, neverLogged);
          if (rule === null || seen.has(`${rule}:${field.name}`)) continue;
          seen.add(`${rule}:${field.name}`);
          findings.push({ file: relative, line: site.line, rule, field: field.name });
        }
      }
    }
  }
  return { findings, files, sites };
}

export function checkLogRedaction(repoRoot = REPO_ROOT, roots = SCANNED_ROOTS) {
  const errors = [];
  const baseline = loadBaseline(repoRoot);
  const { findings, files, sites } = scan(repoRoot, roots);

  if (files === 0) {
    return { errors: [`${roots.join(', ')}: no product file was read.`], report: { files, sites } };
  }

  const known = new Map();
  for (const entry of baseline.known ?? []) {
    known.set(`${entry.file}:${entry.field}`, entry);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.file} ${entry.field} carries no reason.`);
    }
    if (typeof entry.fix !== 'string' || entry.fix.trim().length === 0) {
      errors.push(`${BASELINE_PATH}: ${entry.file} ${entry.field} names no fix.`);
    }
  }

  const matched = new Set();
  for (const finding of findings) {
    const id = `${finding.file}:${finding.field}`;
    if (known.has(id)) {
      matched.add(id);
      continue;
    }
    errors.push(
      finding.rule === 'personal-data'
        ? `${finding.file}:${finding.line} logs "${finding.field}", which names a person. Log a ` +
            'pseudonym or an id the support path can resolve instead.'
        : `${finding.file}:${finding.line} logs "${finding.field}", which the redactor replaces ` +
            'with [redacted], so the line identifies nothing. Rename it to what it is, or log a ' +
            'count.',
    );
  }

  for (const id of known.keys()) {
    if (!matched.has(id)) {
      errors.push(`${BASELINE_PATH}: ${id} no longer occurs. Delete the entry.`);
    }
  }

  return { errors, report: { files, sites, findings: findings.length } };
}

function main() {
  const { errors, report } = checkLogRedaction();
  if (errors.length > 0) {
    console.error('Log redaction check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `check-log-redaction: OK (${report.sites} log call sites in ${report.files} files, ` +
      `${report.findings} recorded)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
