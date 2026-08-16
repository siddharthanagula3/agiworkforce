import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = path.resolve(import.meta.dirname, '..');

const EXEMPT: Record<string, string> = {};

function routerFiles(): string[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .filter((f) => {
      const src = fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');
      return src.includes('Router()');
    });
}

describe('gateway rate-limit coverage', () => {
  it('finds the routers, so a directory move cannot silently empty this check', () => {
    const files = routerFiles();
    expect(files.length).toBeGreaterThanOrEqual(10);
    expect(files).toContain('cloudChat.ts');
    expect(files).toContain('usage.ts');
  });

  it('every router mounts a rate-limit floor', () => {
    const offenders: string[] = [];
    for (const file of routerFiles()) {
      if (file in EXEMPT) continue;
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      if (!/router\.use\(\s*(createRateLimiter\(|\w*[rR]ateLimiter\b)/.test(src)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `these gateway routers have no router-level createRateLimiter, so a route added ` +
        `to them without its own limiter ships unlimited:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('keeps the exemption list honest', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(fs.existsSync(path.join(ROUTES_DIR, file)), `stale exemption: ${file}`).toBe(true);
      expect(reason.length, `exemption for ${file} needs a reason`).toBeGreaterThan(20);
    }
  });
});
