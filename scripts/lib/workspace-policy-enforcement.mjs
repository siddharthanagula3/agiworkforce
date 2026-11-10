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

// A top-level argument of the call opening at `open`, by position, or null.
function callArgument(source, open, index) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        args.push(source.slice(start, i));
        break;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      args.push(source.slice(start, i));
      start = i + 1;
    }
  }
  return args[index] ?? null;
}

// The four shapes the server has for refusing on a workspace feature. A fifth
// mechanism reads as unenforced here until it is added, which is the safe way round.
export function featuresEnforcedIn(source) {
  const found = new Set();
  for (const match of source.matchAll(/evaluateManagedComputeAccess\(/g)) {
    const feature = callArgument(source, match.index + match[0].length - 1, 5);
    for (const literal of feature?.matchAll(/'([a-z_]+)'/g) ?? []) found.add(literal[1]);
  }
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

function exportedFunctionBodies(source) {
  const bodies = new Map();
  for (const match of source.matchAll(/export function (\w+)\s*\(/g)) {
    let parameters = 1;
    let cursor = match.index + match[0].length;
    while (cursor < source.length && parameters > 0) {
      if (source[cursor] === '(') parameters += 1;
      else if (source[cursor] === ')') parameters -= 1;
      cursor += 1;
    }
    const open = source.indexOf('{', cursor);
    if (open < 0) continue;
    const signatureTail = source.slice(cursor, open);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          bodies.set(match[1], { returns: signatureTail, body: source.slice(open, index + 1) });
          break;
        }
      }
    }
  }
  return bodies;
}

// A server decision that asks a yes-or-no predicate of the contract reads the
// controls that predicate reads, so the keys it names count as read by the
// decision. Only predicates count: a resolver that merges every control into
// a layer reads all of them and decides nothing.
export function contractPredicateReads(contractSource) {
  const bodies = exportedFunctionBodies(contractSource);
  const reads = new Map();
  const visit = (name, seen) => {
    if (seen.has(name)) return new Set();
    seen.add(name);
    const entry = bodies.get(name);
    if (!entry) return new Set();
    const found = identifiersIn(entry.body);
    for (const callee of [...found]) {
      if (bodies.has(callee)) for (const id of visit(callee, seen)) found.add(id);
    }
    return found;
  };
  for (const [name, entry] of bodies) {
    if (!/:\s*boolean\s*$/.test(entry.returns)) continue;
    reads.set(name, visit(name, new Set()));
  }
  return reads;
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
  const predicateReads = contractPredicateReads(fs.readFileSync(contractPath, 'utf8'));
  for (const root of SCAN_ROOTS) {
    for (const full of walk(scanRoot, root)) {
      if (!isEnforcementFile(full)) continue;
      const source = fs.readFileSync(path.join(scanRoot, full), 'utf8');
      for (const feature of featuresEnforcedIn(source)) enforcedFeatures.add(feature);
      for (const identifier of identifiersIn(source)) enforcedIdentifiers.add(identifier);
      for (const [predicate, reads] of predicateReads) {
        if (!new RegExp(`\\b${predicate}\\s*\\(`).test(source)) continue;
        for (const identifier of reads) enforcedIdentifiers.add(identifier);
      }
      for (const act of invokedCodeActs(source)) invokedActs.add(act);
    }
  }

  const enforced = ({ key, kind }) => {
    if (kind === 'feature') return enforcedFeatures.has(key);
    if (kind !== 'code') return enforcedIdentifiers.has(key);
    const acts = actsByControl.get(key);
    // A control the decision function maps to no act is not an act at all, such
    // as a retention window: it is enforced where a decision reads it by name.
    if (!acts || acts.size === 0) return enforcedIdentifiers.has(key);
    return [...acts].some((act) => invokedActs.has(act));
  };

  const unenforced = keys.filter((key) => !enforced(key)).map(({ key, kind }) => `${kind}:${key}`);

  return { keys, unenforced };
}

export const EFFECTIVE_ROUTE_FILE =
  'apps/web/app/api/settings/organization/policy/effective/route.ts';

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function topLevelEntries(block) {
  const entries = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < block.length; index += 1) {
    const char = block[index];
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      entries.push(block.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(block.slice(start));
  return entries.map((entry) => entry.trim()).filter(Boolean);
}

function hasTopLevelWidening(expression) {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(' || char === '{' || char === '[') depth += 1;
    else if (char === ')' || char === '}' || char === ']') depth -= 1;
    else if (depth === 0 && (char === '?' || (char === '|' && expression[index + 1] === '|'))) {
      return true;
    }
  }
  return false;
}

// The spread form serves the effective answer only when every key it overrides
// is the effective value of that same key joined with `&&`: a published answer
// may be narrower than the effective policy and never looser.
function servesEffectiveCodeNarrowedOnly(source) {
  const spread = /code:\s*\{\s*\.\.\.effective\.code\b\s*/.exec(source);
  if (!spread) return false;
  const afterSpread = source.slice(spread.index + spread[0].length);
  let depth = 1;
  let end = -1;
  for (let index = 0; index < afterSpread.length; index += 1) {
    const char = afterSpread[index];
    if (char === '{' || char === '(' || char === '[') depth += 1;
    else if (char === '}' || char === ')' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end < 0) return false;
  const overrides = topLevelEntries(afterSpread.slice(0, end).replace(/^\s*,/, ''));
  return overrides.every((entry) => {
    const parsed = /^(\w+)\s*:\s*([\s\S]+)$/.exec(entry);
    if (!parsed) return false;
    const [, key, value] = parsed;
    if (!new RegExp(`^effective\\.code\\.${key}\\s*&&`).test(value)) return false;
    return !hasTopLevelWidening(value);
  });
}

// A control with no server surface to refuse on is only honoured if the server
// tells the client about it, so the exemption is paid for by the published answer.
export function servedFamilies(effectiveRouteSource) {
  const source = stripComments(effectiveRouteSource);
  const families = new Set();
  if (/controls:\s*effective\.controls/.test(source)) {
    families.add('feature');
    families.add('control');
  }
  if (
    /code:\s*effective\.code\s*(?=[,}])/.test(source) ||
    servesEffectiveCodeNarrowedOnly(source)
  ) {
    families.add('code');
  }
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
