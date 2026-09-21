/**
 * The published-version lock is append-only. The manifest test pins the text to
 * the lock; this pins the lock to what was committed, so a rewrite that edits
 * both together stops being invisible.
 */

import { execFileSync } from 'node:child_process';

export const LOCK_FILE = 'apps/web/lib/prompts/published-prompt-versions.json';

export function committedLock(repoRoot, revision = 'HEAD', file = LOCK_FILE) {
  try {
    return execFileSync('git', ['show', `${revision}:${file}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

export function digestsOf(source) {
  const parsed = JSON.parse(source);
  const digests = parsed.digests;
  if (!digests || typeof digests !== 'object' || Object.keys(digests).length === 0) {
    throw new Error(
      'the published-version lock parsed to no digests; it moved or changed shape, and this check is measuring nothing',
    );
  }
  return digests;
}

export function auditAppendOnly(committed, current) {
  const problems = [];
  let added = 0;

  for (const [stamp, digest] of Object.entries(committed)) {
    if (!Object.hasOwn(current, stamp)) {
      problems.push(
        `${stamp} was published and has been dropped from the lock; a shipped version is what a stamped ledger row means`,
      );
      continue;
    }
    if (current[stamp] !== digest) {
      problems.push(
        `${stamp} was published as ${digest} and now reads ${current[stamp]}; publish a new version instead of rewriting one`,
      );
    }
  }
  for (const stamp of Object.keys(current)) {
    if (!Object.hasOwn(committed, stamp)) added += 1;
  }

  return {
    passed: problems.length === 0,
    problems,
    added,
    published: Object.keys(committed).length,
  };
}
