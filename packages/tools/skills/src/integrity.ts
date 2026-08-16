
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SKILL_HASH_ALGORITHM = 'agiskill-sha256-v1';

export const SKILL_CONTENT_HASH_PREFIX = 'sha256';

export const SKILL_TREE_HASH_PREFIX = 'sha256-tree-v1';

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

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

export function readSkillVersion(frontmatter: Record<string, unknown>): string | undefined {
  const raw = frontmatter['version'];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return undefined;
}
