#!/usr/bin/env node
/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCALES_DIR = 'packages/ui/i18n/locales';
export const REFERENCE_LOCALE = 'en';

export function flattenKeys(value, prefix = '') {
  const keys = new Set();
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      for (const nested of flattenKeys(child, full)) keys.add(nested);
    } else {
      keys.add(full);
    }
  }
  return keys;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function compareLocales(localesDir) {
  const reference = path.join(localesDir, REFERENCE_LOCALE);
  const namespaces = fs
    .readdirSync(reference)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const referenceKeys = new Map(
    namespaces.map((ns) => [ns, flattenKeys(readJson(path.join(reference, ns)))]),
  );
  const locales = fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== REFERENCE_LOCALE)
    .map((entry) => entry.name)
    .sort();
  const findings = [];
  for (const locale of locales) {
    for (const ns of namespaces) {
      const file = path.join(localesDir, locale, ns);
      if (!fs.existsSync(file)) {
        findings.push(`${locale}/${ns}: namespace missing`);
        continue;
      }
      let keys;
      try {
        keys = flattenKeys(readJson(file));
      } catch (error) {
        findings.push(`${locale}/${ns}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const expected = referenceKeys.get(ns);
      const missing = [...expected].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !expected.has(key));
      if (missing.length > 0) findings.push(`${locale}/${ns}: missing ${missing.join(', ')}`);
      if (extra.length > 0) findings.push(`${locale}/${ns}: extra ${extra.join(', ')}`);
    }
  }
  const keyCount = [...referenceKeys.values()].reduce((sum, set) => sum + set.size, 0);
  return { locales, namespaces, keyCount, findings };
}

function main() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const result = compareLocales(path.join(repoRoot, LOCALES_DIR));
  if (result.findings.length > 0) {
    console.error('i18n parity check failed:');
    for (const finding of result.findings) console.error(`  ${finding}`);
    process.exit(1);
  }
  console.log(
    `i18n parity check passed (${result.locales.length} locale(s), ${result.namespaces.length} namespace(s), ${result.keyCount} key(s) each).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
