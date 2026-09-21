import fs from 'node:fs';
import path from 'node:path';

export const ADMIN_ROOT = 'apps/web/app/api/admin';
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Everything under /api/admin is either a platform operator surface or one of
// the workspace consoles that happens to live here. Both decide server side.
export const OPERATOR_GUARD = 'requirePlatformAdmin';
export const ORG_SCOPED_GUARDS = ['requireDirectorySyncAdmin', 'requireOrgRole'];

export function adminRoutes(scanRoot) {
  const root = path.join(scanRoot, ADMIN_ROOT);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const step = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue;
        step(full);
      } else if (entry.name === 'route.ts') {
        out.push(path.relative(scanRoot, full));
      }
    }
  };
  step(root);
  return out;
}

// The opening brace of a body, not the one inside `Promise<{ ... }>`: the
// parameter list is closed by paren depth and the return type by angle depth.
function bodyStart(source, index) {
  let parens = 0;
  let angles = 0;
  let seenParams = false;
  for (let i = index; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') {
      parens++;
      seenParams = true;
    } else if (ch === ')') parens--;
    else if (parens === 0 && seenParams) {
      if (ch === '<') angles++;
      else if (ch === '>') angles = Math.max(0, angles - 1);
      else if (ch === '{' && angles === 0) return i;
      else if (ch === ';' && angles === 0) return -1;
    }
  }
  return -1;
}

function bodyFrom(source, index) {
  const open = bodyStart(source, index);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

export function functionBody(source, name) {
  const declared = source.search(
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*[(<]`),
  );
  if (declared >= 0) return bodyFrom(source, declared);
  const assigned = source.search(new RegExp(`const\\s+${name}\\s*[=:]`));
  return assigned >= 0 ? bodyFrom(source, assigned) : '';
}

/**
 * The body a request actually runs for one method, with the bodies of the local
 * helpers it calls folded in, so a guard behind one indirection still counts.
 */
export function handlerBody(source, method) {
  const direct = new RegExp(`export\\s+async\\s+function\\s+${method}\\s*[(<]`);
  const wrapped = new RegExp(
    `export\\s+const\\s+${method}\\s*=\\s*[^;]*?\\b([a-zA-Z_$][\\w$]*)\\s*\\)`,
  );

  let body = '';
  const directIndex = source.search(direct);
  if (directIndex >= 0) {
    body = bodyFrom(source, directIndex);
  } else {
    const match = wrapped.exec(source);
    if (!match) return null;
    body = functionBody(source, match[1]);
  }
  if (!body) return null;

  const seen = new Set();
  for (const call of body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const name = call[1];
    if (seen.has(name) || HTTP_METHODS.includes(name)) continue;
    seen.add(name);
    const helper = functionBody(source, name);
    if (helper && helper !== body) body += helper;
  }
  return body;
}

export function exportedMethods(source) {
  return HTTP_METHODS.filter((method) =>
    new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source),
  );
}

const AUDIT_CALL = /recordAuditEvent\s*\(|logSecurityEvent\s*\(|logAdminDataAccess\s*\(/;

function importedModules(source, routeRel, scanRoot) {
  const modules = new Map();
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)) {
    const specifier = match[2];
    let rel = null;
    if (specifier.startsWith('@/')) rel = path.join('apps/web', specifier.slice(2));
    else if (specifier.startsWith('.')) {
      rel = path.join(path.dirname(routeRel), specifier);
    }
    if (!rel) continue;
    const file = ['.ts', '.tsx', '/index.ts']
      .map((ext) => `${rel}${ext}`)
      .find((candidate) => fs.existsSync(path.join(scanRoot, candidate)));
    if (!file) continue;
    for (const name of match[1].split(',')) {
      const symbol = name.replace(/\s+as\s+.*/, '').trim();
      if (symbol && !symbol.startsWith('type ')) modules.set(symbol, file);
    }
  }
  return modules;
}

// A write is audited at the edge or by the service that performs it, so the
// audit rule follows one import; authorization and rate limiting may not move.
function auditedSomewhere(body, source, routeRel, scanRoot) {
  if (AUDIT_CALL.test(body)) return true;
  const modules = importedModules(source, routeRel, scanRoot);
  for (const call of body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const file = modules.get(call[1]);
    if (!file) continue;
    if (AUDIT_CALL.test(fs.readFileSync(path.join(scanRoot, file), 'utf8'))) return true;
  }
  return false;
}

export function auditRouteGuards(scanRoot, routes) {
  const findings = [];
  for (const rel of routes) {
    const source = fs.readFileSync(path.join(scanRoot, rel), 'utf8');
    const methods = exportedMethods(source);
    if (methods.length === 0) {
      findings.push({ route: rel, method: '-', rule: 'no-handler' });
      continue;
    }
    for (const method of methods) {
      const body = handlerBody(source, method);
      if (body === null) {
        findings.push({ route: rel, method, rule: 'unreadable-handler' });
        continue;
      }
      const guarded =
        body.includes(OPERATOR_GUARD) || ORG_SCOPED_GUARDS.some((guard) => body.includes(guard));
      if (!guarded) findings.push({ route: rel, method, rule: 'no-authorization' });
      if (!/withRateLimit\s*\(|checkRateLimit\s*\(/.test(body)) {
        findings.push({ route: rel, method, rule: 'no-rate-limit' });
      }
      if (!MUTATING_METHODS.has(method)) continue;
      if (!body.includes('requireCsrfToken')) {
        findings.push({ route: rel, method, rule: 'no-csrf' });
      }
      if (!auditedSomewhere(body, source, rel, scanRoot)) {
        findings.push({ route: rel, method, rule: 'no-audit' });
      }
    }
  }
  return findings;
}

export function compareFindings(findings, baseline) {
  const known = new Set(Object.keys(baseline.accepted ?? {}));
  const missingReason = Object.entries(baseline.accepted ?? {})
    .filter(([, reason]) => typeof reason !== 'string' || reason.trim().length === 0)
    .map(([key]) => key);
  const keyed = findings.map((finding) => `${finding.route}::${finding.method}::${finding.rule}`);
  return {
    missingReason,
    unexpected: keyed.filter((key) => !known.has(key)),
    stale: [...known].filter((key) => !keyed.includes(key)),
  };
}
