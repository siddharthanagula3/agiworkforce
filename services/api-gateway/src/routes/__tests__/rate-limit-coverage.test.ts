import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Prevention layer for `js/missing-rate-limiting`.
 *
 * Two gateway routers (cloudChat, usage) had no router-level limiter. Every
 * route in them happened to declare its own, so nothing was actually
 * unlimited — but the next route added to either file would have been, and
 * nothing in the build would have said so. The other nine routers already
 * mounted a floor; the omission was invisible because it is an ABSENCE, and
 * absences do not show up in review diffs.
 *
 * This asserts the floor exists rather than trusting that the next person
 * remembers. It reads source rather than mounting Express because the property
 * being checked is "the line is present", which is exactly what regressed.
 */
const ROUTES_DIR = path.resolve(import.meta.dirname, '..');

/**
 * Routers that legitimately have no authenticated router-level limiter.
 * Each entry needs a reason — an empty allowlist entry is how this check
 * quietly stops meaning anything.
 */
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
      // Accepts any router-level limiter mount, not just createRateLimiter:
      // auth.ts also builds one directly from express-rate-limit.
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
    // A stale exemption is worse than none: it reads as "considered and
    // allowed" when the file may no longer exist.
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(fs.existsSync(path.join(ROUTES_DIR, file)), `stale exemption: ${file}`).toBe(true);
      expect(reason.length, `exemption for ${file} needs a reason`).toBeGreaterThan(20);
    }
  });
});
