#!/usr/bin/env node
// check-model-catalog-integrity.mjs
//
// E7 / P1-CATALOG class-guard: the single source of truth for model IDs is
// packages/types/src/models.json. This guard fails if NON-TEST TypeScript
// shipping code OR hand-maintained doc files (.md/.mdx) reference a model ID
// that is NOT in the canonical catalog (i.e. a removed/ghost/drifted ID). It
// is the durable backstop that stops the recurring catalog-drift class (see
// reports/audit/RECONCILED.md).
//
// Scope:
//   - .ts/.tsx under apps/ packages/ services/ (excluding tests, specs,
//     __tests__, dist, node_modules, .next, _archive). Comment lines (JSDoc///)
//     are skipped — doc examples are hygiene, not live behavior.
//   - .md/.mdx under apps/ packages/ services/ (same exclusions). HTML comment
//     lines (<!-- ... -->) are skipped for markdown files.
//
// The Rust catalog reads models.json via include_str!, so Rust drift is covered
// by `cargo test` + the Rust ghost-model tests; this guard targets the
// hand-maintained TS and doc sites.
//
// Extend DISALLOWED when curating models.json (remove an ID -> add it here).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const CATALOG = path.join(root, 'packages/types/src/models.json');

// Confirmed-removed SELECTABLE model IDs that must not appear in live TS code as
// catalog entries, defaults, or selectable-model references.
// Source: model curation (opus-4.6/4.7 -> opus-4.8; gpt-5.4 family -> gpt-5.5 + gpt-5.4-mini).
//
// SCOPE NOTE: this guard deliberately does NOT police `o3`, `dall-e-3`, `gpt-image-1.x`,
// or `sora-2`. Those still appear in LEGITIMATE provider-API/reasoning-detection/media code
// (e.g. `m.startsWith('o3')` o-series routing, direct DALL-E API calls) even though they are
// not user-selectable catalog entries. Reconciling that media/reasoning drift to the catalog
// is a separate post-launch task (tracked in reports/audit/STATE.md), not a removed-ID gate.
//
// SUBSTRING list: ids that are NEVER a substring of a VALID catalog id -> plain match.
const DISALLOWED_SUBSTRING = [
  'claude-opus-4.6',
  'claude-opus-4-6',
  'claude-opus-4.7',
  'claude-opus-4-7',
  'claude-opus-4-6-mini',
  'gpt-5.4-codex',
  'gpt-5.4-nano',
  'gpt-5.4-pro',
];
// TOKEN list: removed ids that ARE a prefix of a VALID id (bare `gpt-5.4` vs the valid
// `gpt-5.4-mini`) -> match ONLY as a whole token (bounded by non-id chars).
const DISALLOWED_TOKEN = ['gpt-5.4'];

const ID_CHAR = /[A-Za-z0-9._/-]/;
// True if `id` appears in `line` as a whole token (not part of a longer model id like
// gpt-5.4-mini). Bounds: the chars immediately before/after must NOT be id-chars.
function containsToken(line, id) {
  let from = 0;
  for (;;) {
    const idx = line.indexOf(id, from);
    if (idx === -1) return false;
    const before = idx > 0 ? line[idx - 1] : '';
    const after = idx + id.length < line.length ? line[idx + id.length] : '';
    if ((before === '' || !ID_CHAR.test(before)) && (after === '' || !ID_CHAR.test(after))) {
      return true;
    }
    from = idx + 1;
  }
}

const SCAN_ROOTS = ['apps', 'packages', 'services'];
const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'dist-web',
  '.next',
  'build',
  'target',
  'coverage',
  '__tests__',
  '__mocks__',
  'tests',
  'test',
  'e2e',
  '_archive',
  '.turbo',
  '.cache',
]);
const isTestFile = (f) => /\.(test|spec)\.[cm]?tsx?$/.test(f) || /\.stories\./.test(f);
const isTs = (f) => /\.[cm]?tsx?$/.test(f);
const isMd = (f) => /\.mdx?$/.test(f);

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile() && isTs(e.name) && !isTestFile(e.name)) {
      yield { file: full, kind: 'ts' };
    } else if (e.isFile() && isMd(e.name)) {
      yield { file: full, kind: 'md' };
    }
  }
}

// Skip comment lines in TypeScript/TSX (JSDoc examples are not live behavior).
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/');
}

// Skip HTML comment lines in Markdown (<!-- ... -->).
function isMdCommentLine(line) {
  const t = line.trim();
  return t.startsWith('<!--');
}

if (!fs.existsSync(CATALOG)) {
  console.error(`Model-catalog integrity check: missing canonical catalog at ${CATALOG}`);
  process.exit(1);
}

const violations = [];
for (const scanRoot of SCAN_ROOTS) {
  for (const { file, kind } of walk(path.join(root, scanRoot))) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const cheapHit =
      DISALLOWED_SUBSTRING.some((id) => text.includes(id)) ||
      DISALLOWED_TOKEN.some((id) => text.includes(id));
    if (!cheapHit) continue;
    const skipComment = kind === 'md' ? isMdCommentLine : isCommentLine;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (skipComment(lines[i])) continue;
      for (const id of DISALLOWED_SUBSTRING) {
        if (lines[i].includes(id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
      for (const id of DISALLOWED_TOKEN) {
        if (containsToken(lines[i], id)) {
          violations.push({
            file: path.relative(root, file),
            line: i + 1,
            id,
            text: lines[i].trim().slice(0, 120),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Model-catalog integrity check FAILED — removed/ghost model IDs in live TS or doc files:',
  );
  console.error(
    '(IDs must come from packages/types/src/models.json — fix the site or update DISALLOWED if the ID was re-added.)\n',
  );
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line}  [${v.id}]  ${v.text}`);
  }
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}

console.log(
  'Model-catalog integrity check passed (no removed/ghost model IDs in live TS or doc files).',
);
