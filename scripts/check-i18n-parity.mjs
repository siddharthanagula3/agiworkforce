#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

if (failures > 0) {
  console.error(`\ni18n parity check FAILED: ${failures} finding(s).`);
  process.exit(1);
}
console.log('i18n parity check passed.');
