import fs from 'node:fs';
import path from 'node:path';

export const CONTRACT_FILE = 'packages/contracts/types/src/enterprise/workspace-controls.ts';
export const BASELINE_FILE = 'scripts/config/workspace-policy-enforcement-baseline.json';

const SCAN_ROOTS = ['apps/web/app/api', 'apps/web/lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', '__tests__', '__mocks__']);

// Declaring, validating, storing and rendering a control are not enforcing it.
const NOT_ENFORCEMENT = [
  'apps/web/app/api/settings/organization/policy/',
  'apps/web/lib/services/organization-policy-service.ts',
  'apps/web/lib/services/organization-policy-gate.ts',
  'apps/web/features/',
  'apps/web/shared/',
];

function listStringLiterals(source, constantName) {
  const start = source.indexOf(`export const ${constantName} = `);
  if (start < 0) return [];
  const end = source.indexOf('] as const', start);
  if (end < 0) return [];
  return [...source.slice(start, end).matchAll(/'([a-zA-Z_][a-zA-Z0-9_]*)'/g)].map((m) => m[1]);
}

function interfaceFields(source, interfaceName) {
  const start = source.indexOf(`export interface ${interfaceName} {`);
  if (start < 0) return [];
  const end = source.indexOf('\n}', start);
  if (end < 0) return [];
  return [...source.slice(start, end).matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)[?]?:/gm)].map(
    (m) => m[1],
  );
}

export function declaredPolicyKeys(contractSource) {
  const features = listStringLiterals(contractSource, 'WORKSPACE_FEATURES');
  const codeControls = listStringLiterals(contractSource, 'WORKSPACE_CODE_CONTROL_KEYS');
  const controls = interfaceFields(contractSource, 'WorkspaceControls').filter(
    (field) => field !== 'featureAccess',
  );
  return [
    ...features.map((key) => ({ key, kind: 'feature' })),
    ...controls.map((key) => ({ key, kind: 'control' })),
    ...codeControls.map((key) => ({ key, kind: 'code' })),
  ];
}

export function isEnforcementFile(relPath) {
  if (/\.(test|spec)\.tsx?$/.test(relPath)) return false;
  if (relPath === CONTRACT_FILE) return false;
  return !NOT_ENFORCEMENT.some((prefix) => relPath.startsWith(prefix));
}

// The three shapes the server has for refusing on a workspace feature. A fourth
// mechanism reads as unenforced here until it is added, which is the safe way round.
export function featuresEnforcedIn(source) {
  const found = new Set();
  for (const match of source.matchAll(
    /buildWorkspaceFeatureGateResponse\(\s*[^,]+,\s*[^,]+,\s*'([a-z_]+)'/g,
  )) {
    found.add(match[1]);
  }
  for (const match of source.matchAll(/features\.push\('([a-z_]+)'\)/g)) found.add(match[1]);
  for (const match of source.matchAll(/featureAccess(?:\.([a-zA-Z_]+)|\['([a-z_]+)'\])/g)) {
    found.add(match[1] ?? match[2]);
  }
  return found;
}

// A Code control is never compared by hand at a call site: the shared decision
// function maps an act to it, and a route invokes that act. Enforcement is that
// whole chain, so the guard walks it rather than looking for the key's name.
export function codeActsByControl(contractSource) {
  const start = contractSource.indexOf('export function evaluateWorkspaceCodeAct');
  if (start < 0) return new Map();
  const body = contractSource.slice(start);
  const byControl = new Map();
  const add = (control, act) => {
    const entry = byControl.get(control) ?? new Set();
    entry.add(act);
    byControl.set(control, entry);
  };

  const toggles = contractSource.indexOf('const CODE_ACT_TOGGLES');
  if (toggles >= 0) {
    const table = contractSource.slice(toggles, contractSource.indexOf('});', toggles));
    for (const row of table.matchAll(/([a-z_]+): '([a-zA-Z]+)',/g)) add(row[2], row[1]);
  }

  let act = null;
  for (const line of body.split('\n')) {
    const caseMatch = /case '([a-z_]+)':/.exec(line);
    if (caseMatch) act = caseMatch[1];
    if (!act) continue;
    for (const key of line.matchAll(/(?:codeControlOff\('|control: ')([a-zA-Z]+)'/g))
      add(key[1], act);
  }
  return byControl;
}

export function invokedCodeActs(source) {
  return new Set([...source.matchAll(/act: '([a-z_]+)'/g)].map((m) => m[1]));
}

export function identifiersIn(source) {
  return new Set([...source.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)].map((m) => m[1]));
}

export function walk(scanRoot, dir) {
  const abs = path.join(scanRoot, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        step(path.join(current, entry.name));
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      out.push(path.relative(scanRoot, path.join(current, entry.name)));
    }
  };
  step(abs);
  return out;
}

export function findUnenforcedKeys(scanRoot) {
  const contractPath = path.join(scanRoot, CONTRACT_FILE);
  if (!fs.existsSync(contractPath)) {
    return { error: `${CONTRACT_FILE} is missing, so no policy key can be enumerated.` };
  }
  const keys = declaredPolicyKeys(fs.readFileSync(contractPath, 'utf8'));
  if (keys.length === 0) {
    return { error: `${CONTRACT_FILE} declared no policy keys, which cannot be right.` };
  }

  const enforcedFeatures = new Set();
  const enforcedIdentifiers = new Set();
  const invokedActs = new Set();
  const actsByControl = codeActsByControl(fs.readFileSync(contractPath, 'utf8'));
  for (const root of SCAN_ROOTS) {
    for (const full of walk(scanRoot, root)) {
      if (!isEnforcementFile(full)) continue;
      const source = fs.readFileSync(path.join(scanRoot, full), 'utf8');
      for (const feature of featuresEnforcedIn(source)) enforcedFeatures.add(feature);
      for (const identifier of identifiersIn(source)) enforcedIdentifiers.add(identifier);
      for (const act of invokedCodeActs(source)) invokedActs.add(act);
    }
  }

  const enforced = ({ key, kind }) => {
    if (kind === 'feature') return enforcedFeatures.has(key);
    if (kind !== 'code') return enforcedIdentifiers.has(key);
    const acts = actsByControl.get(key);
    if (!acts || acts.size === 0) return false;
    return [...acts].some((act) => invokedActs.has(act));
  };

  const unenforced = keys.filter((key) => !enforced(key)).map(({ key, kind }) => `${kind}:${key}`);

  return { keys, unenforced };
}

export const EFFECTIVE_ROUTE_FILE =
  'apps/web/app/api/settings/organization/policy/effective/route.ts';

// A control with no server surface to refuse on is only honoured if the server
// tells the client about it, so the exemption is paid for by the published answer.
export function servedFamilies(effectiveRouteSource) {
  const families = new Set();
  if (/controls:\s*effective\.controls/.test(effectiveRouteSource)) {
    families.add('feature');
    families.add('control');
  }
  if (/code:\s*effective\.code/.test(effectiveRouteSource)) families.add('code');
  return families;
}

export function compareToBaseline(unenforced, baseline, served) {
  const open = new Map(Object.entries(baseline.unenforced ?? {}));
  const exempt = new Map(Object.entries(baseline.servedToClients ?? {}));

  const missingReason = [
    ...[...open.entries()]
      .filter(([, entry]) => !entry?.reason || !entry?.enforceIn)
      .map(([key]) => key),
    ...[...exempt.entries()]
      .filter(([, entry]) => !entry?.reason || !entry?.servedBy)
      .map(([key]) => key),
  ];

  const unserved = [...exempt.entries()]
    .filter(([key, entry]) => {
      if (entry?.servedBy !== EFFECTIVE_ROUTE_FILE) return true;
      return !served.has(key.split(':')[0]);
    })
    .map(([key]) => key);

  const grown = unenforced.filter((key) => !open.has(key) && !exempt.has(key));
  const fixed = [...open.keys()].filter((key) => !unenforced.includes(key));
  return { grown, fixed, missingReason, unserved };
}
