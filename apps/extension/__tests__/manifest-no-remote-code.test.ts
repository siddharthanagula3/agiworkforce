/**
 * The Chrome Web Store rejects an extension that can execute code it did not
 * ship, and so does this. The manifest is the only place that permission can be
 * granted, so the guard reads it rather than trusting a review.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const manifest = JSON.parse(readFileSync(resolve(here, '..', 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;

/** Every directive the CSP names, as `directive -> sources`. */
function directives(policy: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const clause of policy.split(';')) {
    const [name, ...sources] = clause.trim().split(/\s+/).filter(Boolean);
    if (name) parsed.set(name.toLowerCase(), sources);
  }
  return parsed;
}

const CODE_DIRECTIVES = [
  'script-src',
  'script-src-elem',
  'worker-src',
  'object-src',
  'default-src',
];
const REMOTE_SOURCE = /^(https?:|wss?:|\/\/|data:|blob:|filesystem:|\*$)/i;

describe('no remotely hosted executable JS', () => {
  const policies = (manifest.content_security_policy ?? {}) as Record<string, string>;

  it('declares a policy for every page the extension renders', () => {
    expect(typeof policies.extension_pages).toBe('string');
  });

  it.each(CODE_DIRECTIVES)('keeps %s to code this extension shipped', (directive) => {
    const sources = directives(policies.extension_pages ?? '').get(directive);
    if (!sources) return;

    for (const source of sources) {
      expect(source, `${directive} may not load code from ${source}`).not.toMatch(REMOTE_SOURCE);
    }
    expect(sources, `${directive} may not relax the JS parser`).not.toContain("'unsafe-eval'");
    expect(sources).not.toContain("'wasm-unsafe-eval'");
  });

  it('never allows inline script, which is how a page injects its own', () => {
    const scriptSrc = directives(policies.extension_pages ?? '').get('script-src') ?? [];
    expect(scriptSrc).toEqual(["'self'"]);
  });

  it('runs a service worker and content scripts from packaged files only', () => {
    const background = manifest.background as { service_worker?: string } | undefined;
    expect(background?.service_worker).toBeDefined();
    expect(background?.service_worker).not.toMatch(/^https?:/i);

    const contentScripts = (manifest.content_scripts ?? []) as Array<{ js?: string[] }>;
    for (const entry of contentScripts) {
      for (const file of entry.js ?? []) {
        expect(file).not.toMatch(/^(https?:|\/\/)/i);
      }
    }
  });

  it('has no sandboxed page, which would run under its own weaker policy', () => {
    expect(manifest.sandbox).toBeUndefined();
    expect(policies.sandbox).toBeUndefined();
  });
});
