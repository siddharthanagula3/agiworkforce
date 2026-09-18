import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type MutatingMethod = (typeof MUTATING_METHODS)[number];

const MUTATING_EXPORT = new RegExp(
  `export\\s+(?:async\\s+function|const)\\s+(${MUTATING_METHODS.join('|')})\\b`,
  'g',
);

const EMITS_AUDIT = /\brecordAuditEvent\s*\(/;
const EMITS_SECURITY = /\blogSecurityEvent\s*\(|\blogAuthorizationFailure\s*\(/;

export type AuditEmitterKind = 'audit_event' | 'security_event';

export interface RouteAuditCoverage {
  route: string;
  methods: MutatingMethod[];
  emits: AuditEmitterKind[];
  /** The module that actually calls the emitter, which is often not the route. */
  emitters: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (entry === 'route.ts') out.push(path);
  }
  return out;
}

function resolveAlias(appRoot: string, specifier: string): string | null {
  if (!specifier.startsWith('@/')) return null;
  const base = join(appRoot, specifier.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function emittersIn(text: string): AuditEmitterKind[] {
  const kinds: AuditEmitterKind[] = [];
  if (EMITS_AUDIT.test(text)) kinds.push('audit_event');
  if (EMITS_SECURITY.test(text)) kinds.push('security_event');
  return kinds;
}

/**
 * One hop of import resolution, because almost no route emits its own event:
 * the write and the audit record live together in the service, which is the
 * right place for them and invisible to a grep of the route file.
 */
export function classifyRoute(appRoot: string, absolute: string): RouteAuditCoverage {
  const text = readFileSync(absolute, 'utf8');
  const route = absolute.slice(join(appRoot, 'app/api').length + 1);
  const methods = [...text.matchAll(MUTATING_EXPORT)].map((match) => match[1] as MutatingMethod);

  const emits = new Set(emittersIn(text));
  const emitters = emits.size > 0 ? [route] : [];

  for (const match of text.matchAll(/from\s+'(@\/[^']+)'/g)) {
    const target = resolveAlias(appRoot, match[1] as string);
    if (!target) continue;
    const found = emittersIn(readFileSync(target, 'utf8'));
    if (found.length === 0) continue;
    for (const kind of found) emits.add(kind);
    emitters.push(target.slice(appRoot.length + 1));
  }

  return { route, methods: [...new Set(methods)], emits: [...emits], emitters };
}

export function sweepRouteAuditCoverage(appRoot: string): RouteAuditCoverage[] {
  return walk(join(appRoot, 'app/api'))
    .map((absolute) => classifyRoute(appRoot, absolute))
    .filter((coverage) => coverage.methods.length > 0)
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function isAudited(coverage: RouteAuditCoverage): boolean {
  return coverage.emits.length > 0;
}
