
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSupportCorpus } from '../corpus';
import { STATIC_FAQS } from '@/lib/support/static-data';

const AGENT_DIR = join(__dirname, '..');

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'openai/anthropic key', pattern: /sk-[A-Za-z0-9_-]{32,}/ },
  { name: 'stripe live key', pattern: /sk_live_[A-Za-z0-9]{24,}/ },
  { name: 'stripe test key', pattern: /sk_test_[A-Za-z0-9]{24,}/ },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: 'connection string', pattern: /postgres(ql)?:\/\/[^\s]+/ },
  { name: 'bearer token', pattern: /Bearer\s+[A-Za-z0-9_-]{20,}/ },
];

const FORBIDDEN_IMPORTS = [
  '@/lib/server/neon-db',
  '@/lib/server/user-scoped-db',
  '@agiworkforce/data-layer',
  '@clerk/nextjs',
  '@clerk/backend',
  '@/lib/api-auth',
  '@/lib/services/subscription-service',
  'lib/server/neon',
  'drizzle',
  'pg',
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const SOURCE_FILES = walk(AGENT_DIR).filter((file) => !file.includes('__tests__'));

describe('support agent subtree', () => {
  it('has source files to scan (guards the scan itself)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(8);
  });

  it.each(SOURCE_FILES.map((file) => relative(AGENT_DIR, file)))(
    '%s imports no database or auth module',
    (relativePath) => {
      const source = readFileSync(join(AGENT_DIR, relativePath), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
      for (const specifier of imports) {
        for (const forbidden of FORBIDDEN_IMPORTS) {
          expect(
            specifier === forbidden || specifier.startsWith(`${forbidden}/`),
            `${relativePath} imports ${specifier}`,
          ).toBe(false);
        }
      }
    },
  );
});

describe('corpus content', () => {
  const corpus = getSupportCorpus();

  it('loads', () => {
    expect(corpus.available).toBe(true);
  });

  it('carries no secret-shaped string', () => {
    if (!corpus.available) throw new Error('corpus unavailable');
    for (const chunk of corpus.chunks) {
      const haystack = `${chunk.headingPath}\n${chunk.text}`;
      for (const { name, pattern } of SECRET_PATTERNS) {
        expect(pattern.test(haystack), `${chunk.id} matched ${name}`).toBe(false);
      }
    }
  });

  it('carries no email address, user id, or account-shaped identifier', () => {
    if (!corpus.available) throw new Error('corpus unavailable');
    for (const chunk of corpus.chunks) {
      const emails = (chunk.text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).map((email) =>
        email.replace(/\.$/, ''),
      );
      for (const email of emails) {
        expect(['contact@agiworkforce.com', 'support@agiworkforce.com']).toContain(email);
      }
      expect(chunk.text).not.toMatch(/\buser_[A-Za-z0-9]{10,}\b/);
      expect(chunk.text).not.toMatch(/\bcus_[A-Za-z0-9]{10,}\b/);
    }
  });

  it('has every path public', () => {
    if (!corpus.available) throw new Error('corpus unavailable');
    for (const chunk of corpus.chunks) {
      expect(chunk.path).not.toMatch(/^\/(settings|admin|api|dev|debug|user|auth)(\/|$)/);
    }
  });

  it('includes every published static FAQ and excludes unpublished ones', () => {
    if (!corpus.available) throw new Error('corpus unavailable');
    const ids = new Set(corpus.chunks.map((chunk) => chunk.id));
    for (const faq of STATIC_FAQS) {
      const expected = `static-faq:${faq.id}`;
      expect(ids.has(expected), `${faq.id} published=${faq.is_published}`).toBe(faq.is_published);
    }
  });

  it('has unique chunk ids', () => {
    if (!corpus.available) throw new Error('corpus unavailable');
    const ids = corpus.chunks.map((chunk) => chunk.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
