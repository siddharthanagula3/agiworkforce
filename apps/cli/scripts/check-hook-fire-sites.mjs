#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const HOOKS_RS = path.join(ROOT, 'apps/cli/src/features/hooks/hooks.rs');
const CLI_SRC = path.join(ROOT, 'apps/cli/src');

function parseHookEventVariants(hooksSrc) {
  const source = fs.readFileSync(hooksSrc, 'utf8');

  const enumStart = source.indexOf('pub enum HookEvent {');
  if (enumStart === -1) {
    throw new Error(`Could not find 'pub enum HookEvent {' in ${hooksSrc}`);
  }

  let depth = 0;
  let inEnum = false;
  let enumBody = '';

  for (let i = enumStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      inEnum = true;
    } else if (ch === '}') {
      depth--;
      if (inEnum && depth === 0) {
        enumBody = source.slice(enumStart, i + 1);
        break;
      }
    }
  }

  if (!enumBody) {
    throw new Error(`Could not extract HookEvent enum body from ${hooksSrc}`);
  }

  const variants = [];
  for (const line of enumBody.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('///') || trimmed.startsWith('#[') || trimmed.startsWith('pub enum')) {
      continue;
    }
    const m = trimmed.match(/^([A-Z][A-Za-z0-9]*),?$/);
    if (m) {
      variants.push(m[1]);
    }
  }

  return variants;
}

function collectRsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      results.push(full);
    }
  }
  return results;
}

function countFireSites(variants, rsFiles) {
  const defFile = path.resolve(HOOKS_RS);

  const counts = {};
  const sites = {};
  for (const v of variants) {
    counts[v] = 0;
    sites[v] = [];
  }

  const altPattern = variants.map((v) => v).join('|');
  const re = new RegExp(`HookEvent::(${altPattern})\\b`, 'g');

  for (const file of rsFiles) {
    if (path.resolve(file) === defFile) continue;

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('#[')) continue;

      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const variant = m[1];
        counts[variant]++;
        const rel = path.relative(ROOT, file);
        sites[variant].push(`${rel}:${lineIdx + 1}`);
      }
    }
  }

  return { counts, sites };
}

function main() {
  if (!fs.existsSync(HOOKS_RS)) {
    console.error(`ERROR: hooks.rs not found at expected path:\n  ${HOOKS_RS}`);
    process.exit(1);
  }

  let variants;
  try {
    variants = parseHookEventVariants(HOOKS_RS);
  } catch (err) {
    console.error(`ERROR parsing hooks.rs: ${err.message}`);
    process.exit(1);
  }

  if (variants.length === 0) {
    console.error('ERROR: No HookEvent variants found, parser may be broken.');
    process.exit(1);
  }

  const rsFiles = collectRsFiles(CLI_SRC);
  const { counts, sites } = countFireSites(variants, rsFiles);

  const missing = variants.filter((v) => counts[v] === 0);

  const colWidth = Math.max(...variants.map((v) => v.length));
  console.log(
    `\nHookEvent fire-site coverage (${variants.length} variants, ${rsFiles.length} .rs files scanned):\n`,
  );
  for (const v of variants) {
    const n = counts[v];
    const status = n === 0 ? 'MISSING' : `${n} site${n === 1 ? '' : 's'}`;
    const flag = n === 0 ? ' <-- NO FIRE SITE' : '';
    console.log(`  ${v.padEnd(colWidth)}  ${status}${flag}`);
    if (n > 0 && n <= 5) {
      for (const loc of sites[v]) {
        console.log(`      ${loc}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error(`\nFAIL: ${missing.length} HookEvent variant(s) have no fire site:`);
    for (const v of missing) {
      console.error(`  - HookEvent::${v}`);
    }
    console.error('\nEvery enum variant must be passed to run_hooks() at least once.');
    console.error('Add a call site or the variant is dead code that should be removed.');
    process.exit(1);
  }

  console.log(`\nPASS: all ${variants.length} HookEvent variants have ≥1 fire site.`);
}

main();
