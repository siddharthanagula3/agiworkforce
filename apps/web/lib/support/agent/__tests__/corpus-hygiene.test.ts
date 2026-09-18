import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSupportCorpus } from '../corpus';
import { corpusArtifactSchema, SUPPORT_PLATFORMS, SUPPORT_PLATFORM_LABELS } from '../corpus/schema';
import rawCorpus from '../corpus.generated.json';
import { STATIC_FAQS } from '@/lib/support/static-data';
import { ALL_DOC_PLATFORMS, docMetadataFor } from '@/lib/support/doc-metadata';

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

describe('glossary document', () => {
  const corpus = getSupportCorpus();

  function glossaryText(): string {
    if (!corpus.available) throw new Error('corpus unavailable');
    const chunks = corpus.chunks.filter((chunk) => chunk.docId === 'glossary');
    expect(chunks.length).toBeGreaterThan(3);
    return chunks.map((chunk) => `${chunk.headingPath}\n${chunk.text}`).join('\n');
  }

  it.each([
    'Trust mode',
    'BYOK',
    'Managed cloud',
    'Allowance',
    'Credits',
    'Artifact',
    'Connector',
    'MCP',
    'Tool approval',
    'Temporary chat',
    'Surface',
  ])('defines %s', (term) => {
    expect(glossaryText()).toContain(`**${term}**`);
  });

  it('names every platform label so a platform-only question retrieves it', () => {
    const text = glossaryText();
    for (const platform of SUPPORT_PLATFORMS) {
      expect(text, `glossary omits ${platform}`).toContain(SUPPORT_PLATFORM_LABELS[platform]);
    }
  });
});

describe('platform index', () => {
  const artifact = corpusArtifactSchema.parse(rawCorpus);

  it('gives every known platform slug a label', () => {
    for (const platform of SUPPORT_PLATFORMS) {
      expect(SUPPORT_PLATFORM_LABELS[platform]).toBeTruthy();
    }
  });

  it('declares platforms deduped and sorted, so the artifact is order-stable', () => {
    for (const document of artifact.documents) {
      if (!document.platforms) continue;
      expect(new Set(document.platforms).size, `${document.id} repeats a platform`).toBe(
        document.platforms.length,
      );
      expect(document.platforms, `${document.id} is unsorted`).toEqual(
        [...document.platforms].sort(),
      );
    }
  });

  it('indexes every platform on at least one document', () => {
    const declared = new Set(artifact.documents.flatMap((document) => document.platforms ?? []));
    for (const platform of SUPPORT_PLATFORMS) {
      expect(declared.has(platform), `no document declares ${platform}`).toBe(true);
    }
  });

  it('never claims a surface that doc metadata says the document does not cover', () => {
    for (const document of artifact.documents) {
      const applicable = docMetadataFor(document.id)?.applicability.platforms;
      if (!applicable) continue;
      for (const platform of document.platforms ?? []) {
        if (!(ALL_DOC_PLATFORMS as readonly string[]).includes(platform)) continue;
        expect(
          (applicable as readonly string[]).includes(platform),
          `${document.source} declares ${platform}, doc metadata does not`,
        ).toBe(true);
      }
    }
  });

  it('declares a platform on every surfaces-category document', () => {
    const surfaceDocs = artifact.documents.filter((document) => document.category === 'surfaces');
    expect(surfaceDocs.length).toBeGreaterThan(0);
    for (const document of surfaceDocs) {
      expect(
        document.platforms?.length ?? 0,
        `${document.source} has no platforms`,
      ).toBeGreaterThan(0);
    }
  });
});
