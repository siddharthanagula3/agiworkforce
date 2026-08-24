#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const LOCALE_ROOTS = ['packages/ui/i18n/locales'];
const REFERENCE_LOCALE = 'en';

function keyPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    paths.push(...keyPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return paths;
}

let failures = 0;
const report = (line) => {
  failures += 1;
  console.error(line);
};

for (const root of LOCALE_ROOTS) {
  if (!existsSync(root)) {
    report(`Locale root missing: ${root}`);
    continue;
  }
  const locales = readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory());
  if (!locales.includes(REFERENCE_LOCALE)) {
    report(`Reference locale '${REFERENCE_LOCALE}' missing under ${root}`);
    continue;
  }
  const referenceDir = join(root, REFERENCE_LOCALE);
  const referenceFiles = readdirSync(referenceDir).filter((f) => f.endsWith('.json'));

  for (const locale of locales) {
    if (locale === REFERENCE_LOCALE) continue;
    const localeDir = join(root, locale);
    for (const file of referenceFiles) {
      const referencePath = join(referenceDir, file);
      const localePath = join(localeDir, file);
      if (!existsSync(localePath)) {
        report(`[${locale}] missing bundle file: ${localePath} (reference: ${referencePath})`);
        continue;
      }
      let referenceJson;
      let localeJson;
      try {
        referenceJson = JSON.parse(readFileSync(referencePath, 'utf8'));
      } catch (error) {
        report(`[${REFERENCE_LOCALE}] unparseable bundle: ${referencePath} (${error.message})`);
        continue;
      }
      try {
        localeJson = JSON.parse(readFileSync(localePath, 'utf8'));
      } catch (error) {
        report(`[${locale}] unparseable bundle: ${localePath} (${error.message})`);
        continue;
      }
      const referenceKeys = new Set(keyPaths(referenceJson));
      const localeKeys = new Set(keyPaths(localeJson));
      for (const key of referenceKeys) {
        if (!localeKeys.has(key)) report(`[${locale}] ${file}: missing key '${key}'`);
      }
      for (const key of localeKeys) {
        if (!referenceKeys.has(key))
          report(`[${locale}] ${file}: orphan key '${key}' (absent from ${REFERENCE_LOCALE})`);
      }
    }
    const localeOnlyFiles = readdirSync(localeDir).filter(
      (f) => f.endsWith('.json') && !referenceFiles.includes(f),
    );
    for (const file of localeOnlyFiles) {
      report(
        `[${locale}] orphan bundle file with no ${REFERENCE_LOCALE} counterpart: ${join(localeDir, file)}`,
      );
    }
  }
}

/*
 * Untranslated-by-default ratchet.
 *
 * Parity above compares locales to EACH OTHER, so a key that exists in none of
 * them is perfectly consistent, which is how this list grew undetected. The
 * check passed green while the sidebar, composer and model picker were
 * English-only for a user who chose Japanese.
 *
 * This does not translate anything. It stops the number growing: a NEW `t()`
 * key with an inline default and no catalogue entry fails here. Lowering the
 * baseline is the work; raising it needs a deliberate edit.
 *
 * WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1 (sidebar + selector + composer,
 * 126 keys) landed across all 12 locales, dropping the baseline from 254 to
 * 104. Remaining surfaces (projects, stream, bubble, research, header, ...)
 * are still tracked in ExecutionPlan.md.
 */
const UNTRANSLATED_DEFAULT_BASELINE = 104;

function catalogueHas(catalogues, key) {
  const [namespace, rest] = key.includes(':') ? key.split(/:(.*)/s) : [null, key];
  const search = namespace ? [catalogues[namespace]].filter(Boolean) : Object.values(catalogues);
  return search.some((bundle) => {
    let node = bundle;
    for (const part of rest.split('.')) {
      if (node === null || typeof node !== 'object' || !(part in node)) return false;
      node = node[part];
    }
    return typeof node === 'string';
  });
}

function keysWithInlineDefaultAndNoEntry() {
  const referenceDir = join(LOCALE_ROOTS[0], REFERENCE_LOCALE);
  const catalogues = {};
  for (const file of readdirSync(referenceDir).filter((f) => f.endsWith('.json'))) {
    catalogues[file.slice(0, -5)] = JSON.parse(readFileSync(join(referenceDir, file), 'utf8'));
  }

  let sources = '';
  try {
    sources = execFileSync(
      'grep',
      ['-rh', '--include=*.ts', '--include=*.tsx', '-e', "t('", 'apps/web', 'packages/ui'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    return null;
  }

  const keys = new Set();
  for (const match of sources.matchAll(/\bt\(\s*'([a-zA-Z0-9_.:-]+)'\s*,/g)) {
    keys.add(match[1]);
  }
  return [...keys].filter((key) => !catalogueHas(catalogues, key)).sort();
}

const untranslated = keysWithInlineDefaultAndNoEntry();
if (untranslated === null) {
  console.warn('i18n: could not scan sources for inline defaults; ratchet skipped.');
} else if (untranslated.length > UNTRANSLATED_DEFAULT_BASELINE) {
  const overBy = untranslated.length - UNTRANSLATED_DEFAULT_BASELINE;
  report(
    `${untranslated.length} t() keys carry an inline English default with no catalogue entry ` +
      `(baseline ${UNTRANSLATED_DEFAULT_BASELINE}, ${overBy} new). ` +
      'A key with only an inline default renders English in every locale. ' +
      `Add it to ${REFERENCE_LOCALE}/*.json and translate it, or lower the baseline deliberately.`,
  );
} else if (untranslated.length < UNTRANSLATED_DEFAULT_BASELINE) {
  console.log(
    `i18n: ${UNTRANSLATED_DEFAULT_BASELINE - untranslated.length} fewer untranslated default(s) ` +
      `than the baseline — lower UNTRANSLATED_DEFAULT_BASELINE to ${untranslated.length}.`,
  );
}

if (failures > 0) {
  console.error(`\ni18n parity check FAILED: ${failures} finding(s).`);
  process.exit(1);
}
console.log('i18n parity check passed.');
