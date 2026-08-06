#!/usr/bin/env node
/**
 * Build the support agent's retrieval corpus.
 *
 * Reads `apps/web/content/support/*.md` and emits
 * `apps/web/lib/support/agent/corpus.generated.json` — a committed, plain-JSON
 * artifact so the ENTIRE indexed surface is reviewable in one diff.
 *
 * Deliberate properties:
 *
 * 1. NO USER CONTENT. The only inputs are markdown files checked into the repo.
 *    There is no database read, no crawl, and no runtime fetch anywhere in this
 *    script or in the runtime index that consumes it.
 *
 * 2. PUBLIC ROUTES ONLY. Every document declares a `path`, and the build FAILS
 *    if that path does not resolve to a real `apps/web/app/**\/page.tsx`, or if
 *    it sits under a private prefix (/settings, /admin, /api, /dev, /debug,
 *    /user, /auth). That single rule is what keeps internal engineering docs
 *    (`docs/**`, ADRs, agent-context) out of the corpus by construction: an
 *    internal doc has no public route, so it cannot be indexed and cannot
 *    become a citation.
 *
 * 3. NO TOKENIZATION HERE. Chunk text is emitted raw. Tokenization, document
 *    frequencies, and BM25 statistics are all computed at runtime by
 *    `lib/support/agent/retrieval/`, over the merged corpus (markdown +
 *    `lib/support/static-data.ts`). Keeping exactly one tokenizer
 *    implementation — in TypeScript, covered by tests — is worth more than the
 *    microseconds a precomputed index would save on ~50 chunks; two copies of a
 *    tokenizer is two copies that can drift.
 *
 * 4. DETERMINISTIC. Documents are sorted by id, chunks by ordinal, keys are
 *    written in a fixed order. `corpus-drift.test.ts` re-runs this script into a
 *    temp directory and asserts byte equality with the committed artifact, so
 *    the artifact cannot go stale silently.
 *
 * Dependency-free Node ESM on purpose: the repo has no `tsx`, `ts-node`,
 * `gray-matter`, `yaml`, or `glob`, and `.claude/settings.json` blocks lockfile
 * edits.
 *
 * Usage:
 *   node scripts/build-support-corpus.mjs [--out <path>] [--check] [--content <dir>]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, '..');
const CONTENT_DIR = join(WEB_ROOT, 'content', 'support');
const APP_DIR = join(WEB_ROOT, 'app');
const DEFAULT_OUT = join(WEB_ROOT, 'lib', 'support', 'agent', 'corpus.generated.json');

/** Artifact schema version. Bump when the emitted shape changes. */
const CORPUS_VERSION = 1;

/** Frontmatter keys. Every one is required; anything else fails the build. */
const REQUIRED_KEYS = ['id', 'title', 'path', 'category', 'tags', 'updated', 'scope'];

/**
 * Route prefixes a corpus document may never cite. These are authenticated,
 * operator, or machine surfaces: a support answer that cites them is either
 * leaking an internal surface or sending a signed-out visitor to a 404/redirect.
 */
const FORBIDDEN_PATH_PREFIXES = [
  '/settings',
  '/admin',
  '/api',
  '/dev',
  '/debug',
  '/user',
  '/auth',
  '/connect/',
  '/device-auth',
];

const MAX_CHUNK_CHARS = 2000;

class BuildError extends Error {}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Minimal, strict frontmatter reader. Not YAML — a fixed `key: value` block
 * between two `---` fences, one pair per line, no nesting, no anchors, no
 * multiline scalars. A real YAML parser would accept far more than this corpus
 * should ever contain.
 */
function parseFrontmatter(raw, file) {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new BuildError(`${file}: missing opening --- frontmatter fence`);
  }
  const end = normalized.indexOf('\n---\n', 3);
  if (end === -1) throw new BuildError(`${file}: missing closing --- frontmatter fence`);

  const block = normalized.slice(4, end + 1);
  const body = normalized.slice(end + 5);

  /** @type {Record<string, string>} */
  const data = {};
  for (const line of block.split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon === -1) throw new BuildError(`${file}: malformed frontmatter line: ${line}`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) throw new BuildError(`${file}: empty frontmatter key`);
    if (key in data) throw new BuildError(`${file}: duplicate frontmatter key: ${key}`);
    data[key] = value;
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in data) || data[key] === '') {
      throw new BuildError(`${file}: missing required frontmatter key: ${key}`);
    }
  }
  for (const key of Object.keys(data)) {
    if (!REQUIRED_KEYS.includes(key)) {
      throw new BuildError(`${file}: unknown frontmatter key: ${key}`);
    }
  }
  if (data['scope'] !== 'public') {
    throw new BuildError(`${file}: scope must be "public" (got "${data['scope']}")`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(data['id'])) {
    throw new BuildError(`${file}: id must be kebab-case (got "${data['id']}")`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data['updated'])) {
    throw new BuildError(`${file}: updated must be YYYY-MM-DD (got "${data['updated']}")`);
  }
  return { data, body };
}

// ---------------------------------------------------------------------------
// Path allowlist
// ---------------------------------------------------------------------------

function assertPublicAppRoute(path, file) {
  if (!path.startsWith('/'))
    throw new BuildError(`${file}: path must start with / (got "${path}")`);
  if (path !== '/' && path.endsWith('/')) {
    throw new BuildError(`${file}: path must not have a trailing slash (got "${path}")`);
  }
  if (path.includes('..')) throw new BuildError(`${file}: path must not contain ".."`);
  if (!/^\/[a-z0-9/-]*$/.test(path)) {
    throw new BuildError(`${file}: path has unexpected characters (got "${path}")`);
  }
  for (const prefix of FORBIDDEN_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) {
      throw new BuildError(`${file}: path "${path}" is under a non-public prefix "${prefix}"`);
    }
  }
  const segments = path === '/' ? [] : path.slice(1).split('/');
  const pageFile = join(APP_DIR, ...segments, 'page.tsx');
  if (!existsSync(pageFile)) {
    throw new BuildError(
      `${file}: path "${path}" does not resolve to a real page (expected ${pageFile}). ` +
        'Corpus documents may only cite routes that actually exist.',
    );
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split a document body on `##` / `###` headings. Each chunk keeps its heading
 * path (`Doc title › Section`) so the retrieval layer can boost heading terms
 * and so a citation snippet reads as a located quote rather than a fragment.
 */
function chunkBody(body, docTitle, file) {
  const lines = body.split('\n');
  /** @type {{ heading: string | null; lines: string[] }[]} */
  const sections = [{ heading: null, lines: [] }];
  for (const line of lines) {
    const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (match) {
      sections.push({ heading: match[2], lines: [] });
      continue;
    }
    if (/^#\s+/.test(line)) {
      throw new BuildError(
        `${file}: use frontmatter "title" instead of an H1 heading (found: ${line.trim()})`,
      );
    }
    sections[sections.length - 1].lines.push(line);
  }

  /** @type {{ heading: string | null; headingPath: string; text: string }[]} */
  const chunks = [];
  for (const section of sections) {
    const text = section.lines
      .join('\n')
      .trim()
      .replace(/\n{3,}/g, '\n\n');
    if (!text) continue;
    if (text.length > MAX_CHUNK_CHARS) {
      throw new BuildError(
        `${file}: section "${section.heading ?? '(intro)'}" is ${text.length} chars, ` +
          `over the ${MAX_CHUNK_CHARS} limit. Split it under another heading.`,
      );
    }
    chunks.push({
      heading: section.heading,
      headingPath: section.heading ? `${docTitle} › ${section.heading}` : docTitle,
      text,
    });
  }
  if (chunks.length === 0) throw new BuildError(`${file}: document has no body content`);
  return chunks;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * @param {string} [contentDir] Override the content directory. Exists so the
 *   guard tests can build a deliberately-invalid corpus in a temp directory
 *   without writing bad documents into the real tree.
 */
export function buildCorpus(contentDir = CONTENT_DIR) {
  if (!existsSync(contentDir)) {
    throw new BuildError(`content directory not found: ${contentDir}`);
  }
  const files = readdirSync(contentDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  if (files.length === 0) throw new BuildError(`no markdown documents in ${CONTENT_DIR}`);

  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {unknown[]} */
  const documents = [];

  for (const name of files) {
    const file = `content/support/${name}`;
    const raw = readFileSync(join(contentDir, name), 'utf8');
    const { data, body } = parseFrontmatter(raw, file);

    if (seenIds.has(data['id']))
      throw new BuildError(`${file}: duplicate document id "${data.id}"`);
    seenIds.add(data['id']);

    assertPublicAppRoute(data['path'], file);

    const tags = data['tags']
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) throw new BuildError(`${file}: tags must not be empty`);

    const chunks = chunkBody(body, data['title'], file).map((chunk, index) => ({
      id: `${data['id']}#${index}`,
      ordinal: index,
      heading: chunk.heading,
      headingPath: chunk.headingPath,
      text: chunk.text,
    }));

    documents.push({
      id: data['id'],
      title: data['title'],
      path: data['path'],
      category: data['category'],
      tags,
      updated: data['updated'],
      source: file,
      chunks,
    });
  }

  documents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    version: CORPUS_VERSION,
    generatedBy: 'scripts/build-support-corpus.mjs',
    documentCount: documents.length,
    chunkCount: documents.reduce((sum, doc) => sum + doc.chunks.length, 0),
    documents,
  };
}

function serialize(corpus) {
  return `${JSON.stringify(corpus, null, 2)}\n`;
}

function main(argv) {
  const outFlag = argv.indexOf('--out');
  const out = outFlag === -1 ? DEFAULT_OUT : resolve(argv[outFlag + 1] ?? DEFAULT_OUT);
  const check = argv.includes('--check');
  const contentFlag = argv.indexOf('--content');
  const contentDir =
    contentFlag === -1 ? CONTENT_DIR : resolve(argv[contentFlag + 1] ?? CONTENT_DIR);

  const corpus = buildCorpus(contentDir);
  const serialized = serialize(corpus);

  if (check) {
    const existing = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (existing !== serialized) {
      process.stderr.write(
        `support corpus is stale: ${out} does not match the content directory.\n` +
          'Run: pnpm --filter @agiworkforce/web build:support-corpus\n',
      );
      process.exit(1);
    }
    process.stdout.write(
      `support corpus up to date (${corpus.documentCount} docs, ${corpus.chunkCount} chunks)\n`,
    );
    return;
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serialized, 'utf8');
  process.stdout.write(
    `wrote ${out} (${corpus.documentCount} docs, ${corpus.chunkCount} chunks)\n`,
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
