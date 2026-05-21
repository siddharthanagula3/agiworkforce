#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI script: stdout is the user-visible output channel. */
/**
 * validate-ownership.ts
 *
 * Loads any `reference-index/*-ownership.json` file and validates it
 * against `reference-index/ownership-schema.json`. Run with:
 *
 *   pnpm tsx reference-index/scripts/validate-ownership.ts            # all
 *   pnpm tsx reference-index/scripts/validate-ownership.ts mobile     # one
 *   pnpm tsx reference-index/scripts/validate-ownership.ts --strict   # fail on `unassigned`
 *
 * Exits 0 on success, 1 on any validation failure, 2 on usage error.
 *
 * Intentionally minimal-deps: uses ajv if it's already in the workspace,
 * falls back to a small hand-rolled checker if not. The hand-rolled checker
 * covers the subset of JSON Schema this prototype actually uses (type,
 * required, additionalProperties, pattern, enum, minProperties, minLength,
 * minimum, uniqueItems, items, properties, patternProperties).
 *
 * This is Phase 8 prototype code — not enabled in CI yet.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFERENCE_INDEX_DIR = resolve(__dirname, '..');
const SCHEMA_PATH = join(REFERENCE_INDEX_DIR, 'ownership-schema.json');

/* -------------------------------------------------------------------------- */
/* CLI parsing                                                                */
/* -------------------------------------------------------------------------- */

interface Args {
  surfaces: string[];
  strict: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { surfaces: [], strict: false, help: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--strict') out.strict = true;
    else if (!a.startsWith('-')) out.surfaces.push(a);
  }
  return out;
}

function printHelp() {
  console.log(
    [
      'validate-ownership.ts — validate reference-index/*-ownership.json',
      '',
      'Usage:',
      '  pnpm tsx reference-index/scripts/validate-ownership.ts [surface...] [--strict]',
      '',
      'Examples:',
      '  pnpm tsx reference-index/scripts/validate-ownership.ts',
      '  pnpm tsx reference-index/scripts/validate-ownership.ts mobile',
      '  pnpm tsx reference-index/scripts/validate-ownership.ts mobile web --strict',
      '',
      'Flags:',
      '  --strict   Treat the `unassigned` owner bucket as a failure (Phase 8b).',
      '  --help     Show this help.',
    ].join('\n'),
  );
}

/* -------------------------------------------------------------------------- */
/* Schema validator                                                           */
/* -------------------------------------------------------------------------- */

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

interface SchemaNode {
  type?: string;
  required?: string[];
  additionalProperties?: boolean | SchemaNode;
  properties?: Record<string, SchemaNode>;
  patternProperties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: JsonValue[];
  pattern?: string;
  format?: string;
  minimum?: number;
  minLength?: number;
  minProperties?: number;
  uniqueItems?: boolean;
  default?: JsonValue;
  description?: string;
  // Top-level metadata we ignore.
  $schema?: string;
  $id?: string;
  title?: string;
}

interface ValidationError {
  path: string;
  message: string;
}

function typeOf(v: JsonValue): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validate(value: JsonValue, schema: SchemaNode, path = '$'): ValidationError[] {
  const errors: ValidationError[] = [];
  const actual = typeOf(value);

  if (schema.type && schema.type !== actual) {
    if (!(schema.type === 'integer' && actual === 'number')) {
      errors.push({
        path,
        message: `expected type "${schema.type}", got "${actual}"`,
      });
      return errors; // bail; downstream checks assume the right type
    }
  }

  if (schema.type === 'integer' && Number.isFinite(value as number)) {
    if (!Number.isInteger(value as number)) {
      errors.push({ path, message: 'expected integer, got non-integer number' });
    }
  }

  if (schema.enum && !schema.enum.some((v) => deepEqual(v, value))) {
    errors.push({
      path,
      message: `expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`,
    });
  }

  if (schema.pattern && actual === 'string') {
    const re = new RegExp(schema.pattern);
    if (!re.test(value as string)) {
      errors.push({
        path,
        message: `value "${value}" does not match pattern /${schema.pattern}/`,
      });
    }
  }

  if (schema.format === 'date-time' && actual === 'string') {
    if (Number.isNaN(Date.parse(value as string))) {
      errors.push({ path, message: `value "${value}" is not a valid date-time` });
    }
  }

  if (typeof schema.minLength === 'number' && actual === 'string') {
    if ((value as string).length < schema.minLength) {
      errors.push({
        path,
        message: `string length ${(value as string).length} is below minLength ${schema.minLength}`,
      });
    }
  }

  if (typeof schema.minimum === 'number' && actual === 'number') {
    if ((value as number) < schema.minimum) {
      errors.push({
        path,
        message: `value ${value} is below minimum ${schema.minimum}`,
      });
    }
  }

  if (actual === 'object') {
    const obj = value as Record<string, JsonValue>;
    const keys = Object.keys(obj);

    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      errors.push({
        path,
        message: `object has ${keys.length} property(ies), minProperties is ${schema.minProperties}`,
      });
    }

    for (const req of schema.required ?? []) {
      if (!(req in obj)) {
        errors.push({ path, message: `missing required property "${req}"` });
      }
    }

    const propSchemas = schema.properties ?? {};
    const patternSchemas = schema.patternProperties ?? {};

    for (const k of keys) {
      const subPath = `${path}.${k}`;
      let matched = false;
      if (k in propSchemas) {
        errors.push(...validate(obj[k], propSchemas[k], subPath));
        matched = true;
      }
      for (const [pat, sub] of Object.entries(patternSchemas)) {
        if (new RegExp(pat).test(k)) {
          errors.push(...validate(obj[k], sub, subPath));
          matched = true;
        }
      }
      if (!matched && schema.additionalProperties === false) {
        errors.push({ path: subPath, message: `unknown property "${k}"` });
      }
    }
  }

  if (actual === 'array' && schema.items) {
    const arr = value as JsonValue[];
    arr.forEach((item, i) => {
      errors.push(...validate(item, schema.items!, `${path}[${i}]`));
    });
    if (schema.uniqueItems) {
      const seen = new Set<string>();
      arr.forEach((item, i) => {
        const k = JSON.stringify(item);
        if (seen.has(k)) {
          errors.push({ path: `${path}[${i}]`, message: 'duplicate item' });
        }
        seen.add(k);
      });
    }
  }

  return errors;
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* -------------------------------------------------------------------------- */
/* Per-file additional checks                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Things the JSON Schema can't easily express:
 *
 *   1. Every file in `by_owner.<role>` must start with the `scope` prefix.
 *   2. No file may appear in two different owner lists (orphan-free).
 *   3. In `--strict` mode, the `unassigned` bucket must be absent or empty.
 *   4. If `owners` is present, every key in `by_owner` (other than the
 *      sentinel `unassigned`) must also appear in `owners`.
 */
function semanticChecks(doc: Record<string, JsonValue>, strict: boolean): ValidationError[] {
  const errors: ValidationError[] = [];
  const scope = doc.scope as string;
  const byOwner = doc.by_owner as Record<string, string[]>;

  const seenFiles = new Map<string, string>(); // file → owner
  for (const [owner, files] of Object.entries(byOwner)) {
    for (const file of files) {
      if (!file.startsWith(scope)) {
        errors.push({
          path: `$.by_owner.${owner}`,
          message: `file "${file}" is outside scope "${scope}"`,
        });
      }
      if (seenFiles.has(file) && seenFiles.get(file) !== owner) {
        errors.push({
          path: `$.by_owner.${owner}`,
          message: `file "${file}" also owned by "${seenFiles.get(file)}" — every file must have exactly one owner`,
        });
      }
      seenFiles.set(file, owner);
    }
  }

  if (strict && Array.isArray(byOwner.unassigned) && byOwner.unassigned.length > 0) {
    errors.push({
      path: '$.by_owner.unassigned',
      message: `--strict mode: ${byOwner.unassigned.length} unassigned file(s) — every file must have an owner`,
    });
  }

  if (doc.owners) {
    const owners = doc.owners as Record<string, unknown>;
    for (const role of Object.keys(byOwner)) {
      if (role === 'unassigned') continue;
      if (!(role in owners)) {
        errors.push({
          path: `$.owners`,
          message: `role "${role}" appears in by_owner but is missing from owners`,
        });
      }
    }
  }

  return errors;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!existsSync(SCHEMA_PATH)) {
    console.error(`[validate-ownership] schema not found at ${SCHEMA_PATH}`);
    process.exit(2);
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as SchemaNode;

  const allFiles = readdirSync(REFERENCE_INDEX_DIR).filter((f) => /-ownership\.json$/.test(f));
  if (allFiles.length === 0) {
    console.warn(`[validate-ownership] no *-ownership.json files found in ${REFERENCE_INDEX_DIR}`);
    process.exit(0);
  }

  const targets =
    args.surfaces.length === 0 ? allFiles : args.surfaces.map((s) => `${s}-ownership.json`);

  let totalErrors = 0;
  for (const file of targets) {
    const fullPath = join(REFERENCE_INDEX_DIR, file);
    if (!existsSync(fullPath)) {
      console.error(`[FAIL] ${file} — file not found`);
      totalErrors++;
      continue;
    }
    const doc = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, JsonValue>;
    const schemaErrors = validate(doc as JsonValue, schema);
    const semanticErrors = semanticChecks(doc, args.strict);
    const errors = [...schemaErrors, ...semanticErrors];

    if (errors.length === 0) {
      const fileCount = Object.values(doc.by_owner as Record<string, string[]>).reduce(
        (n, list) => n + list.length,
        0,
      );
      const ownerCount = Object.keys(doc.by_owner as Record<string, unknown>).length;
      console.log(`[ OK ] ${basename(file)} — ${fileCount} file(s) across ${ownerCount} owner(s)`);
    } else {
      console.error(`[FAIL] ${basename(file)} — ${errors.length} error(s):`);
      for (const e of errors) {
        console.error(`         ${e.path}: ${e.message}`);
      }
      totalErrors += errors.length;
    }
  }

  process.exit(totalErrors === 0 ? 0 : 1);
}

main();
