import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(import.meta.dirname, '../..');
const SETTINGS_ROOT = path.join(APP_ROOT, 'app/api/settings');
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
const AUDIT_CALL = /\b(?:recordAuditEvent|logSecurityEvent|logAdminDataAccess)\s*\(/;

/**
 * Settings writes that leave no audit record, and why none is owed. Everything
 * else under /api/settings changes what a workspace or an account can do, so
 * each such handler has to write the trail itself or through the service it calls.
 */
const NOT_AUDITED: Record<string, string> = {
  '2fa/setup/route.ts::POST':
    'Starts enrolment and returns a secret to confirm; nothing is enforced until 2fa/verify succeeds, which records two_factor_enabled.',
  'organization/active/route.ts::PUT':
    'Chooses which of the caller’s own workspaces the next request acts in; it grants and removes nothing.',
  'workspaces/route.ts::PUT':
    'Chooses which of the caller’s own workspaces the next request acts in; it grants and removes nothing.',
  'preferences/route.ts::PUT':
    'The caller’s own display and composer preferences, which govern nobody else and carry no access.',
  'sync/route.ts::POST':
    'Mirrors the caller’s own client settings namespaces; namespaces that carry policy are refused by the route.',
};

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, acc);
    else if (entry.name === 'route.ts') acc.push(full);
  }
  return acc;
}

function bodyFrom(source: string, start: number): string {
  let parens = 0;
  let angles = 0;
  let seenParams = false;
  let open = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') {
      parens++;
      seenParams = true;
    } else if (ch === ')') parens--;
    else if (parens === 0 && seenParams) {
      if (ch === '<') angles++;
      else if (ch === '>') angles = Math.max(0, angles - 1);
      else if (ch === '{' && angles === 0) {
        open = i;
        break;
      } else if (ch === ';' && angles === 0) return '';
    }
  }
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

function localFunction(source: string, name: string): string {
  const declared = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*[(<]`));
  return declared >= 0 ? bodyFrom(source, declared) : '';
}

function handlerBody(source: string, method: string): string | null {
  const direct = source.search(new RegExp(`export\\s+async\\s+function\\s+${method}\\s*[(<]`));
  let body = '';
  if (direct >= 0) {
    body = bodyFrom(source, direct);
  } else {
    const wrapped = new RegExp(`export\\s+const\\s+${method}\\s*=\\s*([^;]+);`).exec(source);
    if (!wrapped) return null;
    const handler = [...wrapped[1]!.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
      .map((match) => match[1]!)
      .find((name) => localFunction(source, name));
    if (!handler) return null;
    body = localFunction(source, handler);
  }
  const seen = new Set<string>();
  for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = call[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const helper = localFunction(source, name);
    if (helper && helper !== body) body += helper;
  }
  return body;
}

function importedModules(source: string, routeFile: string): Map<string, string> {
  const modules = new Map<string, string>();
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)) {
    const specifier = match[2]!;
    const base = specifier.startsWith('@/')
      ? path.join(APP_ROOT, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(routeFile), specifier)
        : null;
    if (!base) continue;
    const file = ['.ts', '.tsx', '/index.ts']
      .map((ext) => `${base}${ext}`)
      .find((candidate) => fs.existsSync(candidate));
    if (!file) continue;
    for (const name of match[1]!.split(',')) {
      const symbol = name
        .replace(/^\s*type\s+/, '')
        .replace(/\s+as\s+.*/, '')
        .trim();
      if (symbol) modules.set(symbol, file);
    }
  }
  return modules;
}

function moduleText(file: string): string {
  const source = fs.readFileSync(file, 'utf8');
  const reexported = [...source.matchAll(/export\s+[^;]*?\s+from\s+'(\.[^']+)'/g)]
    .map((match) => path.resolve(path.dirname(file), match[1]!))
    .map((base) => ['.ts', '.tsx', '/index.ts'].map((ext) => `${base}${ext}`).find(fs.existsSync))
    .filter((candidate): candidate is string => Boolean(candidate));
  return [source, ...reexported.map((candidate) => fs.readFileSync(candidate, 'utf8'))].join('\n');
}

function audited(body: string, source: string, routeFile: string): boolean {
  if (AUDIT_CALL.test(body)) return true;
  const modules = importedModules(source, routeFile);
  for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const file = modules.get(call[1]!);
    if (file && AUDIT_CALL.test(moduleText(file))) return true;
  }
  return false;
}

interface HandlerAudit {
  key: string;
  readable: boolean;
  audited: boolean;
}

function settingsWriteHandlers(): HandlerAudit[] {
  const handlers: HandlerAudit[] = [];
  for (const file of routeFiles(SETTINGS_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    const route = path.relative(SETTINGS_ROOT, file).split(path.sep).join('/');
    for (const method of MUTATING) {
      if (!new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source)) {
        continue;
      }
      const body = handlerBody(source, method);
      handlers.push({
        key: `${route}::${method}`,
        readable: body !== null && body.length > 0,
        audited: body !== null && audited(body, source, file),
      });
    }
  }
  return handlers;
}

describe('every settings write leaves an audit record', () => {
  const handlers = settingsWriteHandlers();

  it('reads every write handler under /api/settings', () => {
    expect(handlers.length).toBeGreaterThan(60);
    expect(handlers.filter((handler) => !handler.readable).map((handler) => handler.key)).toEqual(
      [],
    );
  });

  it('records the write, or says here why the write governs nothing', () => {
    const silent = handlers
      .filter((handler) => !handler.audited && !(handler.key in NOT_AUDITED))
      .map((handler) => handler.key);
    expect(silent, 'audit these writes, or record why they govern nothing').toEqual([]);
  });

  it('keeps no exemption for a handler that is gone or now audits', () => {
    const live = new Map(handlers.map((handler) => [handler.key, handler]));
    for (const [key, reason] of Object.entries(NOT_AUDITED)) {
      expect(live.has(key), `${key} no longer exists`).toBe(true);
      expect(live.get(key)?.audited, `${key} now audits; drop its exemption`).toBe(false);
      expect(reason.length, key).toBeGreaterThan(60);
    }
  });
});
