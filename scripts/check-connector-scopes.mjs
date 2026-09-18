#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const MANIFEST_PATH = path.join(repoRoot, 'apps/web/lib/connectors/oauth-scope-allowlist.ts');
const DESCRIPTIONS_PATH = path.join(repoRoot, 'apps/web/lib/connectors/scope-descriptions.ts');
const SCAN_ROOTS = [
  'apps/web/lib/connectors',
  'apps/web/app/api/connectors',
  'apps/web/lib/user-connector-tools.ts',
];
const EXCLUDED_FILES = new Set([MANIFEST_PATH, DESCRIPTIONS_PATH]);
const DISTINCTIVE_SCOPE = /^(?:https?:\/\/|[\w-]+[.:/][\w./-]+$)/;

function extractConstExpr(source, name) {
  const declaration = new RegExp(`\\bconst\\s+${name}\\b[^=]*=\\s*`).exec(source);
  if (!declaration) return null;
  let i = declaration.index + declaration[0].length;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if ('[({'.includes(ch)) {
      depth += 1;
      continue;
    }
    if (')]}'.includes(ch)) {
      depth -= 1;
      continue;
    }
    if (depth === 0 && ch === ';') break;
  }
  return source.slice(start, i).trim();
}

function stringLiterals(expr) {
  const out = [];
  for (const m of expr.matchAll(/'((?:[^'\\]|\\.)*)'/g)) out.push(m[1]);
  return out;
}

function splitTopLevelEntries(objectExpr) {
  const body = objectExpr.trim().replace(/^\{/, '').replace(/\}$/, '');
  const entries = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  let colonAt = -1;
  const pushEntry = (end) => {
    if (colonAt === -1) return;
    const key = body.slice(start, colonAt).trim().replace(/^['"]/, '').replace(/['"]$/, '');
    const value = body.slice(colonAt + 1, end).trim();
    if (key) entries.push({ key, value });
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if ('[({'.includes(ch)) {
      depth += 1;
      continue;
    }
    if (')]}'.includes(ch)) {
      depth -= 1;
      continue;
    }
    if (depth === 0 && ch === ':' && colonAt === -1) {
      colonAt = i;
      continue;
    }
    if (depth === 0 && ch === ',') {
      pushEntry(i);
      start = i + 1;
      colonAt = -1;
    }
  }
  if (body.slice(start).trim()) pushEntry(body.length);
  return entries;
}

function resolveScopeExpr(expr, stringConsts, identifierConsts, listConsts) {
  const scopes = new Set();
  for (const m of expr.matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const list = listConsts.get(m[1]);
    if (list) for (const scope of list) scopes.add(scope);
  }
  for (const [name, value] of identifierConsts) {
    const re = new RegExp(`(?<![\\w'"$.])${name}(?!\\w)`);
    if (re.test(expr)) scopes.add(value);
  }
  for (const literal of stringLiterals(expr)) scopes.add(literal);
  for (const m of expr.matchAll(/`([^`]*)`/g)) {
    let resolved = m[1];
    for (const [name, value] of stringConsts) resolved = resolved.replaceAll(`\${${name}}`, value);
    scopes.add(resolved);
  }
  return [...scopes];
}

function loadManifest() {
  const source = fs.readFileSync(MANIFEST_PATH, 'utf8');

  const stringConsts = new Map();
  for (const name of [
    'GOOGLE_SCOPE_PREFIX',
    'MS_GRAPH_SCOPE_PREFIX',
    'PAYPAL_SCOPE_PREFIX',
    'AZURE_ARM_SCOPE_PREFIX',
  ]) {
    const expr = extractConstExpr(source, name);
    if (expr) stringConsts.set(name, expr.replace(/^'/, '').replace(/'$/, ''));
  }

  const identifierConsts = new Map();
  const offlineAccessExpr = extractConstExpr(source, 'OFFLINE_ACCESS_SCOPE');
  if (offlineAccessExpr) {
    identifierConsts.set(
      'OFFLINE_ACCESS_SCOPE',
      offlineAccessExpr.replace(/^'/, '').replace(/'$/, ''),
    );
  }

  const listConsts = new Map();
  const oidcExpr = extractConstExpr(source, 'OIDC_SCOPES');
  if (oidcExpr) listConsts.set('OIDC_SCOPES', stringLiterals(oidcExpr));
  const googleIdentityExpr = extractConstExpr(source, 'GOOGLE_IDENTITY_SCOPES');
  if (googleIdentityExpr) {
    listConsts.set(
      'GOOGLE_IDENTITY_SCOPES',
      resolveScopeExpr(googleIdentityExpr, stringConsts, identifierConsts, listConsts),
    );
  }
  const smartOnFhirExpr = extractConstExpr(source, 'SMART_ON_FHIR_PATIENT_SCOPES');
  if (smartOnFhirExpr)
    listConsts.set('SMART_ON_FHIR_PATIENT_SCOPES', stringLiterals(smartOnFhirExpr));

  const forbiddenExpr = extractConstExpr(source, 'FORBIDDEN_CONNECTOR_OAUTH_SCOPES');
  if (!forbiddenExpr) {
    throw new Error(`${MANIFEST_PATH}: could not find FORBIDDEN_CONNECTOR_OAUTH_SCOPES`);
  }
  const forbidden = new Set(stringLiterals(forbiddenExpr));

  const ceilingsExpr = extractConstExpr(source, 'CONNECTOR_OAUTH_SCOPE_CEILINGS');
  if (!ceilingsExpr) {
    throw new Error(`${MANIFEST_PATH}: could not find CONNECTOR_OAUTH_SCOPE_CEILINGS`);
  }

  const connectors = new Map();
  for (const { key, value } of splitTopLevelEntries(ceilingsExpr)) {
    if (value === 'SCOPE_REVIEW_PENDING') {
      connectors.set(key, { pending: true, scopes: [] });
      continue;
    }
    if (value === 'NO_SCOPE_PARAMETER') {
      connectors.set(key, { pending: false, scopes: [] });
      continue;
    }
    connectors.set(key, {
      pending: false,
      scopes: resolveScopeExpr(value, stringConsts, identifierConsts, listConsts),
    });
  }

  if (connectors.size === 0) throw new Error(`${MANIFEST_PATH}: parsed zero connectors`);
  return { connectors, forbidden };
}

function loadDescriptions() {
  const source = fs.readFileSync(DESCRIPTIONS_PATH, 'utf8');
  const expr = extractConstExpr(source, 'SCOPE_DESCRIPTIONS');
  if (!expr) throw new Error(`${DESCRIPTIONS_PATH}: could not find SCOPE_DESCRIPTIONS`);
  const described = new Map();
  for (const { key, value } of splitTopLevelEntries(expr)) {
    const match =
      /sentence:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,\s*access:\s*(READ|WRITE)/.exec(
        value,
      );
    if (match) described.set(key, { sentence: match[1] ?? match[2], access: match[3] });
  }
  if (described.size === 0) throw new Error(`${DESCRIPTIONS_PATH}: parsed zero descriptions`);
  return described;
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function scanFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const full = path.join(repoRoot, root);
    const stat = fs.statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return [...new Set(files)].filter((file) => !EXCLUDED_FILES.has(file));
}

const REDIRECT_URI_OWNERS = new Set([
  'apps/web/lib/connectors/oauth-registry.ts',
  'apps/web/lib/connectors/oauth-client.ts',
]);
const CATALOG_PATH = 'apps/web/lib/connectors/catalog.ts';
const TOOL_LOADER_PATH = 'apps/web/lib/user-connector-tools.ts';
const SERVER_ONLY_MODULES = [
  '@/lib/custom-connector-crypto',
  '@/lib/connectors/oauth-store',
  '@/lib/connectors/oauth-access',
];
const TENANT_KEY_PARAMS = ['userId', 'organizationId'];

function readIfPresent(relative) {
  const full = path.join(repoRoot, relative);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function checkRedirectUriAllowlist(files, findings) {
  const registry = readIfPresent('apps/web/lib/connectors/oauth-registry.ts');
  if (registry === null) {
    findings.push({ rule: 'redirect-uri', detail: 'oauth-registry.ts is missing' });
  } else if (!/isAllowedConnectorOAuthRedirectUri\(/.test(registry)) {
    findings.push({
      rule: 'redirect-uri',
      detail: 'oauth-registry.ts no longer checks the redirect URI against the allowlist',
    });
  }

  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    if (REDIRECT_URI_OWNERS.has(relative)) continue;
    const source = fs.readFileSync(file, 'utf8');
    // A row shape or a column name is not a provider request. Only an outbound
    // parameter reaches the provider, so only that is the boundary.
    const match = /searchParams\.set\(\s*'redirect_uri'|redirect_uri\s*:\s*[^;\n]*redirectUri/.exec(
      source,
    );
    if (!match) continue;
    findings.push({
      rule: 'redirect-uri',
      detail: `${relative}:${lineOf(source, match.index)} sends redirect_uri to a provider outside the allowlisted builder`,
    });
  }
}

function checkRiskClassDeclared(findings) {
  const source = readIfPresent(CATALOG_PATH);
  if (source === null) {
    findings.push({ rule: 'risk-class', detail: `${CATALOG_PATH} is missing` });
    return;
  }
  for (const match of source.matchAll(/implementation:\s*'[^']+'/g)) {
    const body = source.slice(match.index, source.indexOf('};', match.index) + 2);
    if (/\briskClass\b/.test(body)) continue;
    findings.push({
      rule: 'risk-class',
      detail: `${CATALOG_PATH}:${lineOf(source, match.index)} declares a connector with no riskClass`,
    });
  }
}

function checkServerOnlyTokenModules(files, findings) {
  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    const imported = SERVER_ONLY_MODULES.find((module) => source.includes(`'${module}'`));
    if (!imported) continue;
    if (/^\s*'use client'/m.test(source)) {
      findings.push({
        rule: 'token-boundary',
        detail: `${relative} is a client module and imports ${imported}`,
      });
      continue;
    }
    // A route handler under app/api only ever runs on the server, so the
    // marker adds nothing there; every other module must declare it.
    const isRouteHandler = /^apps\/web\/app\/api\/.*\/route\.ts$/.test(relative);
    if (!isRouteHandler && !/import\s+'server-only'/.test(source)) {
      findings.push({
        rule: 'token-boundary',
        detail: `${relative} imports ${imported} without "import 'server-only'"`,
      });
    }
  }
}

function checkCacheKeysAreTenantScoped(findings) {
  const source = readIfPresent(TOOL_LOADER_PATH);
  if (source === null) {
    findings.push({ rule: 'cache-key', detail: `${TOOL_LOADER_PATH} is missing` });
    return;
  }
  const builders = [
    ...source.matchAll(/function\s+(\w*CacheKey)\s*\(([^)]*)\)[^{]*\{([\s\S]*?)\n\}/g),
  ];
  if (builders.length === 0) {
    findings.push({
      rule: 'cache-key',
      detail: `${TOOL_LOADER_PATH} declares no cache-key builder`,
    });
    return;
  }
  for (const builder of builders) {
    const [, name, params, body] = builder;
    const tenant = TENANT_KEY_PARAMS.find((param) => new RegExp(`\\b${param}\\b`).test(params));
    if (!tenant) {
      findings.push({
        rule: 'cache-key',
        detail: `${TOOL_LOADER_PATH}:${lineOf(source, builder.index)} ${name} takes no userId or organizationId`,
      });
      continue;
    }
    if (!body.includes(`\${encodeURIComponent(${tenant})}`)) {
      findings.push({
        rule: 'cache-key',
        detail: `${TOOL_LOADER_PATH}:${lineOf(source, builder.index)} ${name} does not put ${tenant} in the key`,
      });
    }
  }
}

function checkRevokedGrantsExcluded(files, findings) {
  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /`([^`]*\bfrom\s+public\.connector_oauth_grants\b[^`]*)`/g,
    )) {
      const statement = match[1];
      if (!/^\s*select/i.test(statement.trim())) continue;
      if (/revoked_at\s+is\s+null/i.test(statement)) continue;
      findings.push({
        rule: 'revoked-grant',
        detail: `${relative}:${lineOf(source, match.index)} reads connector_oauth_grants without excluding revoked rows`,
      });
    }
  }
}

function main() {
  const { connectors, forbidden } = loadManifest();
  const described = loadDescriptions();

  const violations = [];
  const missingPurpose = [];
  const forbiddenInCeiling = [];
  let scopeCount = 0;

  const watchedScopes = new Set();
  for (const [connectorId, { pending, scopes }] of connectors) {
    if (pending) continue;
    scopeCount += scopes.length;
    for (const scope of scopes) {
      if (forbidden.has(scope)) forbiddenInCeiling.push({ connectorId, scope });
      if (!described.has(scope)) missingPurpose.push({ connectorId, scope });
      if (DISTINCTIVE_SCOPE.test(scope)) watchedScopes.add(scope);
    }
  }
  for (const scope of forbidden) {
    if (DISTINCTIVE_SCOPE.test(scope)) watchedScopes.add(scope);
  }

  const scanned = scanFiles();
  const boundaryFindings = [];
  checkRedirectUriAllowlist(scanned, boundaryFindings);
  checkRiskClassDeclared(boundaryFindings);
  checkServerOnlyTokenModules(scanned, boundaryFindings);
  checkCacheKeysAreTenantScoped(boundaryFindings);
  checkRevokedGrantsExcluded(scanned, boundaryFindings);

  for (const file of scanned) {
    const source = fs.readFileSync(file, 'utf8');
    for (const scope of watchedScopes) {
      const needle = `'${scope}'`;
      let from = 0;
      for (;;) {
        const idx = source.indexOf(needle, from);
        if (idx === -1) break;
        from = idx + needle.length;
        const line = source.slice(0, idx).split('\n').length;
        violations.push({ file: path.relative(repoRoot, file), line, scope });
      }
    }
  }

  const failures =
    violations.length > 0 ||
    missingPurpose.length > 0 ||
    forbiddenInCeiling.length > 0 ||
    boundaryFindings.length > 0;

  if (forbiddenInCeiling.length > 0) {
    console.error('\nFORBIDDEN SCOPE IN CEILING');
    for (const { connectorId, scope } of forbiddenInCeiling) {
      console.error(`  ${connectorId}: "${scope}" is on FORBIDDEN_CONNECTOR_OAUTH_SCOPES`);
    }
  }
  if (missingPurpose.length > 0) {
    console.error('\nMISSING PURPOSE');
    for (const { connectorId, scope } of missingPurpose) {
      console.error(
        `  ${connectorId}: "${scope}" has no entry in scope-descriptions.ts SCOPE_DESCRIPTIONS`,
      );
    }
  }
  if (violations.length > 0) {
    console.error('\nSCOPE DECLARED OUTSIDE THE MANIFEST');
    for (const { file, line, scope } of violations) {
      console.error(`  ${file}:${line}  "${scope}"`);
    }
  }

  if (boundaryFindings.length > 0) {
    console.error('\nCONNECTOR BOUNDARY');
    for (const { rule, detail } of boundaryFindings) {
      console.error(`  [${rule}] ${detail}`);
    }
  }

  if (failures) {
    console.error(
      '\ncheck:connector-scopes FAILED. Every requested OAuth scope must be added to' +
        ' CONNECTOR_OAUTH_SCOPE_CEILINGS in apps/web/lib/connectors/oauth-scope-allowlist.ts' +
        ' with a description in apps/web/lib/connectors/scope-descriptions.ts, and nothing' +
        ' outside those two files may declare a scope literal directly. A CONNECTOR BOUNDARY' +
        ' finding means the redirect-URI allowlist, a connector risk class, the server-only' +
        ' token boundary, a tenant-scoped cache key or the revoked-grant exclusion was broken.',
    );
    process.exit(1);
  }

  const enforced = [...connectors.values()].filter((entry) => !entry.pending).length;
  console.log(
    `check:connector-scopes passed: ${connectors.size} connectors, ${enforced} with an` +
      ` enforced ceiling, ${scopeCount} ceiling scopes, all described and none duplicated` +
      ' outside the manifest; redirect URIs allowlisted, risk classes declared, token modules' +
      ' server-only, cache keys tenant-scoped and revoked grants excluded.',
  );
  process.exit(0);
}

main();
