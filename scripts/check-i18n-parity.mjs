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
 * The scan is namespace-aware: it resolves which catalogue file a key must
 * live in from the `useUiTranslation('<ns>')` / `useTranslation('<ns>')`
 * binding in scope at the call site (nearest preceding declaration of the
 * same local variable name in the same file), or from an explicit
 * `t('ns:key', ...)` form. A bare-key match against ANY catalogue file
 * (namespace-less) is what let `sidebar.noConversations` hide behind an
 * unrelated same-named key in `v3.json` while the component actually reads
 * the `chat` namespace, which lacks it. The scan reads whole file contents
 * (not a line-oriented grep), so a `t(` call whose key and default sit on
 * different source lines — invisible to a line-based scan — is still found.
 *
 * WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1 (sidebar + selector + composer,
 * 126 keys) landed across all 12 locales, dropping the baseline from 254 to
 * 104. Slice 2 fixed this scanner's namespace blindness and multi-line
 * blindness, which raised the honest count from 104 to 113 (the two known
 * blind-spot keys plus 7 more this scan finally saw), translated all 113
 * across all 12 locales, and dropped the baseline to 0. See
 * ExecutionPlan.md for the full history.
 */
const UNTRANSLATED_DEFAULT_BASELINE = 0;

const SCAN_ROOTS = ['apps/web', 'packages/ui'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.cache',
  '.next',
  'coverage',
  '.git',
]);

function collectSourceFiles(root, out = []) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, out);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      if (dot === -1 || !SCAN_EXTENSIONS.has(entry.name.slice(dot))) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function tBindingVarName(destructuredProps) {
  for (const rawProp of destructuredProps.split(',')) {
    const prop = rawProp.trim();
    if (!prop) continue;
    const match = /^t(?:\s*:\s*(\w+))?$/.exec(prop);
    if (match) return match[1] || 't';
  }
  return null;
}

const BINDING_RE =
  /const\s*\{([^}]*)\}\s*=\s*(?:useUiTranslation|useTranslation)\(\s*(?:'([\w.-]+)'|\[([^\]]*)\])/g;

function findTBindings(source) {
  const bindings = [];
  BINDING_RE.lastIndex = 0;
  let match;
  while ((match = BINDING_RE.exec(source))) {
    const [, propsText, singleNamespace, arrayText] = match;
    const varName = tBindingVarName(propsText);
    if (!varName) continue;
    const namespaces = singleNamespace
      ? [singleNamespace]
      : arrayText
        ? [...arrayText.matchAll(/'([\w.-]+)'/g)].map((m) => m[1])
        : [];
    if (namespaces.length === 0) continue;
    bindings.push({ offset: match.index, varName, namespaces });
  }
  return bindings;
}

function resolveNamespaces(bindings, varName, callOffset) {
  let best = null;
  for (const binding of bindings) {
    if (binding.varName !== varName) continue;
    if (binding.offset <= callOffset && (!best || binding.offset > best.offset)) best = binding;
  }
  return best ? best.namespaces : null;
}

function lineOf(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function findKeyUsages(file, source) {
  const bindings = findTBindings(source);
  const varNames = [...new Set(bindings.map((b) => b.varName))];
  if (varNames.length === 0) return [];
  const escaped = varNames
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const callRe = new RegExp(`\\b(${escaped.join('|')})\\(\\s*'([a-zA-Z0-9_.:-]+)'\\s*,`, 'g');
  const usages = [];
  let match;
  while ((match = callRe.exec(source))) {
    const [, varName, key] = match;
    const offset = match.index;
    let namespaces;
    let explicit = false;
    if (key.includes(':')) {
      namespaces = [key.split(/:(.*)/s)[0]];
      explicit = true;
    } else {
      namespaces = resolveNamespaces(bindings, varName, offset);
    }
    const bareKey = explicit ? key.split(/:(.*)/s)[1] : key;
    usages.push({ file, line: lineOf(source, offset), key: bareKey, namespaces });
  }
  return usages;
}

const PLURAL_SUFFIXES = ['', '_one', '_other', '_zero', '_two', '_few', '_many'];

function resolvesToString(bundle, key) {
  const parts = key.split('.');
  const leaf = parts.pop();
  let node = bundle;
  for (const part of parts) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false;
    node = node[part];
  }
  if (node === null || typeof node !== 'object') return false;
  return PLURAL_SUFFIXES.some((suffix) => typeof node[`${leaf}${suffix}`] === 'string');
}

function catalogueHas(catalogues, key, namespaces) {
  const search = namespaces
    ? namespaces.map((ns) => catalogues[ns]).filter(Boolean)
    : Object.values(catalogues);
  return search.some((bundle) => resolvesToString(bundle, key));
}

function keysWithInlineDefaultAndNoEntry() {
  const referenceDir = join(LOCALE_ROOTS[0], REFERENCE_LOCALE);
  const catalogues = {};
  for (const file of readdirSync(referenceDir).filter((f) => f.endsWith('.json'))) {
    catalogues[file.slice(0, -5)] = JSON.parse(readFileSync(join(referenceDir, file), 'utf8'));
  }

  const files = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root));
  const found = new Map();
  const unresolved = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('(')) continue;
    for (const usage of findKeyUsages(file, source)) {
      if (!usage.namespaces) unresolved.push(usage);
      if (catalogueHas(catalogues, usage.key, usage.namespaces)) continue;
      const nsLabel = usage.namespaces ? usage.namespaces.join('+') : 'ANY';
      const dedupeKey = `${nsLabel}:${usage.key}`;
      if (!found.has(dedupeKey)) {
        found.set(dedupeKey, { ...usage, nsLabel });
      }
    }
  }

  return {
    untranslated: [...found.values()].sort(
      (a, b) => a.nsLabel.localeCompare(b.nsLabel) || a.key.localeCompare(b.key),
    ),
    unresolved,
  };
}

const { untranslated, unresolved } = keysWithInlineDefaultAndNoEntry();

if (unresolved.length > 0) {
  const sample = unresolved.slice(0, 10).map((u) => `${u.file}:${u.line} ${u.key}`);
  console.warn(
    `i18n: ${unresolved.length} t() call(s) could not be tied to a useUiTranslation/useTranslation ` +
      `binding in scope; namespace search fell back to ALL catalogues for these:\n  ${sample.join('\n  ')}` +
      (unresolved.length > sample.length
        ? `\n  ...and ${unresolved.length - sample.length} more`
        : ''),
  );
}

if (process.env.I18N_DEBUG_DUMP) {
  for (const u of untranslated) console.log(`[${u.nsLabel}] ${u.key} (${u.file}:${u.line})`);
}
if (untranslated.length > UNTRANSLATED_DEFAULT_BASELINE) {
  const overBy = untranslated.length - UNTRANSLATED_DEFAULT_BASELINE;
  const sample = untranslated
    .slice(0, 25)
    .map((u) => `  [${u.nsLabel}] ${u.key} (${u.file}:${u.line})`)
    .join('\n');
  report(
    `${untranslated.length} t() keys carry an inline English default with no catalogue entry ` +
      `in their resolved namespace (baseline ${UNTRANSLATED_DEFAULT_BASELINE}, ${overBy} new). ` +
      'A key with only an inline default renders English in every locale. ' +
      `Add it to the matching ${REFERENCE_LOCALE}/*.json namespace file and translate it, ` +
      `or lower the baseline deliberately.\n${sample}` +
      (untranslated.length > 25 ? `\n  ...and ${untranslated.length - 25} more` : ''),
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
