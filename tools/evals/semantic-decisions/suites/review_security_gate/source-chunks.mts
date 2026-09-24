import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chunkDiff, parseUnifiedDiff } from '@/lib/code-review/diff';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(suiteDir, '../../../../..');

/** The production chunker's own limits, from apps/web/lib/code-review/pipeline.ts:27. */
const CHUNK_MAX_BYTES = 40 * 1024;
const MAX_CHUNKS = 8;

/** A chunk smaller than this is a one-line edit with nothing to judge. */
const MIN_CHUNK_CHARS = 200;
/** Keep the corpus readable; the production cap is 40 KB and nothing here needs it. */
const TRIM_CHARS = 6_000;

/**
 * Anything key-shaped is replaced before the chunk is written, whether or not
 * the history entry was a real secret. A fixture that looks like a credential
 * is rejected by push protection and is not worth arguing about.
 */
const REDACTIONS: [RegExp, string][] = [
  [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{6,}/g, 'REDACTED_KEY'],
  [/\bghp_[A-Za-z0-9]{10,}/g, 'REDACTED_KEY'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 'REDACTED_KEY'],
  [/\bey[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'REDACTED_TOKEN'],
  [/\bAKIA[0-9A-Z]{12,}/g, 'REDACTED_KEY'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'REDACTED_PRIVATE_KEY_HEADER'],
  // The bare prefix too, even when the rest of the literal is interpolated.
  // A fixture that merely looks like a credential is rejected by push
  // protection, and the cost of being wrong is the whole push.
  [/\b(sk|pk|rk)_(live|test)_/g, 'REDACTED_KEY_PREFIX_'],
];

/**
 * Em and en dashes are folded to a hyphen. The repository removed them from its
 * own copy and comments in an earlier sweep, and a fixture is not the place to
 * reintroduce them. The fold is declared here and in the suite README rather
 * than applied quietly, because the chunks are otherwise verbatim history.
 */
const DASH_FOLD: [RegExp, string][] = [
  [new RegExp(String.fromCodePoint(0x2014), 'gu'), '-'],
  [/\u2013/gu, '-'],
];

function redact(text: string): string {
  return [...REDACTIONS, ...DASH_FOLD].reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

export interface Source {
  id: string;
  sha: string;
  path: string;
  /** Free text, used only for the digest and the README; never a label. */
  bucket: string;
}

export function chunkFor(source: Source): { text: string; bytes: number } | null {
  let diff: string;
  try {
    diff = git(['show', '--format=', '--no-color', source.sha, '--', source.path]);
  } catch {
    return null;
  }
  const chunks = chunkDiff(parseUnifiedDiff(diff), {
    maxBytes: CHUNK_MAX_BYTES,
    maxChunks: MAX_CHUNKS,
  });
  const first = chunks[0];
  if (!first) return null;
  const text = redact(first.text).slice(0, TRIM_CHARS);
  if (text.length < MIN_CHUNK_CHARS) return null;
  return { text, bytes: Buffer.byteLength(text, 'utf8') };
}

if (process.argv[1]?.endsWith('source-chunks.mts')) {
  const sources = JSON.parse(readFileSync(resolve(suiteDir, 'sources.json'), 'utf8')) as {
    sources: Source[];
  };
  const digest = process.argv.includes('--digest');
  const cases: unknown[] = [];
  const skipped: string[] = [];
  for (const source of sources.sources) {
    const chunk = chunkFor(source);
    if (!chunk) {
      skipped.push(`${source.id} ${source.sha.slice(0, 9)} ${source.path}`);
      continue;
    }
    if (digest) {
      console.log(
        `===== ${source.id} [${source.bucket}] ${source.path} @ ${source.sha.slice(0, 9)} (${chunk.bytes}B)`,
      );
      console.log(chunk.text.split('\n').slice(0, 14).join('\n'));
      continue;
    }
    cases.push({
      id: source.id,
      input: { chunk: chunk.text, paths: [source.path] },
      meta: {
        tags: [],
        provenance: { sha: source.sha, path: source.path },
        chunkBytes: chunk.bytes,
      },
    });
  }
  if (digest) {
    console.log(`\nskipped (${skipped.length}):\n${skipped.join('\n')}`);
  } else {
    writeFileSync(
      resolve(suiteDir, 'cases.generated.json'),
      `${JSON.stringify({ cases }, null, 2)}\n`,
    );
    console.log(`${cases.length} chunks written, ${skipped.length} skipped`);
  }
}
