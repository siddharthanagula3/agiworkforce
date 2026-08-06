/**
 * Skill integrity hashing — `agiskill-sha256-v1`.
 *
 * A skill that can change between two `skill` tool calls with no observable
 * difference is a supply-chain hole: the model reads instructions the host
 * never approved. Every loaded skill therefore carries a hash of exactly what
 * was read, and packaged skills also carry a hash of every file shipped
 * alongside `SKILL.md` (scripts, references, assets), because those files are
 * what the instructions tell the agent to execute.
 *
 * The algorithm is duplicated in `apps/cli/src/skills.rs` and
 * `scripts/verify-skills-lock.mjs`. All three are pinned to the same
 * known-answer vector (`__tests__/integrity.test.ts`,
 * `skills.rs::test_tree_hash_known_answer_vector`,
 * `verify-skills-lock.mjs --self-test`), so a divergence fails a test rather
 * than silently producing two "integrity" values that disagree.
 *
 * ## `agiskill-sha256-v1`
 *
 * **Content hash** (every skill): `sha256:<hex>` over the raw bytes of the
 * skill markdown file as read from disk. Not the decoded string — a BOM or a
 * lone surrogate must change the hash.
 *
 * **Tree hash** (directory-layout skills only): `sha256-tree-v1:<hex>` over
 * the whole package directory.
 *
 *   1. Walk the package directory recursively. A member is a regular file.
 *   2. Skip any entry whose basename starts with `.` at any depth, and skip
 *      symbolic links entirely (never followed, never hashed) so a link can
 *      neither smuggle content in nor escape the package.
 *   3. Relative paths are joined with `/` regardless of platform.
 *   4. Sort members by UTF-8 byte order of the relative path.
 *   5. Feed a SHA-256 accumulator, per member in that order:
 *      `<relPath>` + `0x00` + `<lowercase hex sha256 of the file bytes>` + `\n`
 *      (all UTF-8).
 *   6. The tree hash includes `SKILL.md` itself, so `treeHash` alone is
 *      sufficient to detect any change inside a packaged skill.
 *
 * Hashing reads every file in the package. Skill layers are host/operator
 * configured, never caller-supplied, so this is bounded by deployment
 * config rather than by request input; there is deliberately no file-count or
 * byte cap, because a silently truncated hash would be worse than a slow one.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Identifier for the hashing scheme, recorded in `skills-lock.json`. */
export const SKILL_HASH_ALGORITHM = 'agiskill-sha256-v1';

/** Prefix on a single-file content hash. */
export const SKILL_CONTENT_HASH_PREFIX = 'sha256';

/** Prefix on a package tree hash. */
export const SKILL_TREE_HASH_PREFIX = 'sha256-tree-v1';

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `sha256:<hex>` over raw file bytes. Pass a Buffer, not a decoded string. */
export function hashSkillContent(bytes: Uint8Array): string {
  return `${SKILL_CONTENT_HASH_PREFIX}:${sha256Hex(bytes)}`;
}

interface TreeMember {
  relativePath: string;
  absolutePath: string;
}

async function collectTreeMembers(
  directory: string,
  prefix: string,
  out: TreeMember[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(directory, entry.name);
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectTreeMembers(absolutePath, relativePath, out);
    } else if (entry.isFile()) {
      out.push({ relativePath, absolutePath });
    }
  }
}

function byPathBytes(left: TreeMember, right: TreeMember): number {
  return Buffer.compare(
    Buffer.from(left.relativePath, 'utf-8'),
    Buffer.from(right.relativePath, 'utf-8'),
  );
}

/**
 * `sha256-tree-v1:<hex>` over an entire skill package directory.
 *
 * Throws if the directory cannot be read — callers that must not fail a whole
 * catalog load should catch.
 */
export async function computeSkillTreeHash(packageDir: string): Promise<string> {
  const members: TreeMember[] = [];
  await collectTreeMembers(packageDir, '', members);
  members.sort(byPathBytes);

  const digest = createHash('sha256');
  for (const member of members) {
    const bytes = await readFile(member.absolutePath);
    digest.update(member.relativePath, 'utf-8');
    digest.update(Uint8Array.from([0]));
    digest.update(sha256Hex(bytes), 'utf-8');
    digest.update('\n', 'utf-8');
  }
  return `${SKILL_TREE_HASH_PREFIX}:${digest.digest('hex')}`;
}

/**
 * Read an optional `version` from parsed frontmatter.
 *
 * Backward compatible on purpose: a `SKILL.md` with no `version` loads with an
 * undefined version rather than being rejected. Numeric YAML scalars
 * (`version: 2`) are normalized to strings so callers never have to branch on
 * the type.
 */
export function readSkillVersion(frontmatter: Record<string, unknown>): string | undefined {
  const raw = frontmatter['version'];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}
