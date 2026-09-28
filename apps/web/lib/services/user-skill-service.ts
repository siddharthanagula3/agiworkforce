import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  hashSkillContent,
  type Skill,
  type SkillFileInventoryEntry,
  type SkillFileReadOutcome,
  type SkillWithFileAccess,
} from '@agiworkforce/skills';
import { validateSkillDraft, type SkillDraft } from '@agiworkforce/skills/validation';
import { describePluginScan, scanPluginPackage } from '@agiworkforce/client-runtime/plugins';
import { PLUGIN_SCAN_REVIEW_REFUSAL, type ManagedSkillOrigin } from '@agiworkforce/cloud-contracts';
import {
  SKILL_COMPANION_MAX_BYTES,
  SKILL_COMPANION_MAX_FILES,
} from '@/features/plugins/server/directory/constants';
import { createError } from '@/lib/errors';
import { PluginPackageRefusedError } from './plugin-marketplace-service';
import { isoTimestamp } from './skill-origin-service';
import { requireUserSkillAuthoring, userSkillAuthoringEnabled } from './user-skill-authoring';

const PG_UNIQUE_VIOLATION = '23505';

export interface UserSkillRecord {
  id: string;
  name: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSkillSummary {
  name: string;
  description: string;
  source: 'personal';
  lifecycle: 'included';
  downloadable: false;
  editable: true;
  origin: ManagedSkillOrigin;
}

interface UserSkillRow {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface UserSkillSummaryRow {
  name: string;
  description: string;
  created_at: string | Date | null;
}

function personalOrigin(createdAt: string | Date | null): ManagedSkillOrigin {
  const addedAt = isoTimestamp(createdAt);
  return { kind: 'personal', ...(addedAt ? { addedAt } : {}) };
}

function toRecord(row: UserSkillRow): UserSkillRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>)['code'] === PG_UNIQUE_VIOLATION
  );
}

const SKILL_SCAN_PATH = 'SKILL.md';
const BLOCKING_SCAN_VERDICT = 'block';
const PASSING_SCAN_VERDICT = 'pass';
const UPLOAD_HASH_ALGORITHM = 'sha256';
const UPLOAD_HASH_SEPARATOR = '\n';

export interface UserSkillFileInput {
  path: string;
  content: string;
}

export interface UserSkillUpload {
  files: readonly UserSkillFileInput[];
  acknowledgedScans: readonly string[];
}

function sortedFiles(files: readonly UserSkillFileInput[]): UserSkillFileInput[] {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

function userSkillUploadHash(draft: SkillDraft, files: readonly UserSkillFileInput[]): string {
  const hash = createHash(UPLOAD_HASH_ALGORITHM);
  for (const part of [draft.name, draft.description, draft.body]) {
    hash.update(part);
    hash.update(UPLOAD_HASH_SEPARATOR);
  }
  for (const file of sortedFiles(files)) {
    hash.update(file.path);
    hash.update(UPLOAD_HASH_SEPARATOR);
    hash.update(file.content);
    hash.update(UPLOAD_HASH_SEPARATOR);
  }
  return hash.digest('hex');
}

function requireValidDraft(draft: SkillDraft, upload?: UserSkillUpload): void {
  const result = validateSkillDraft(draft);
  if (!result.ok) throw createError.validation(result.errors.join(' '));
  const scan = scanPluginPackage([
    {
      path: SKILL_SCAN_PATH,
      content: `${draft.name}\n${draft.description}\n${draft.body}`,
    },
    ...(upload?.files ?? []),
  ]);
  if (scan.verdict === BLOCKING_SCAN_VERDICT) {
    const reasons = [
      ...new Set(
        scan.findings
          .filter((finding) => finding.severity === BLOCKING_SCAN_VERDICT)
          .map((finding) => finding.message),
      ),
    ];
    throw createError.validation(
      `This skill was not saved because it ${reasons.join('; it ')}. Remove that part and try again.`,
    );
  }
  if (!upload || scan.verdict === PASSING_SCAN_VERDICT) return;
  const hash = userSkillUploadHash(draft, upload.files);
  if (upload.acknowledgedScans.includes(hash)) return;
  throw new PluginPackageRefusedError(PLUGIN_SCAN_REVIEW_REFUSAL, describePluginScan(scan), {
    findings: scan.findings,
    acknowledgements: [hash],
  });
}

const USER_SKILL_SOURCE = 'personal' satisfies Skill['source'];
const USER_SKILL_FILE_PATH_PREFIX = 'user-skills';

export function toManagedSkillFromUserSkill(record: UserSkillRecord): Skill {
  return {
    name: record.name,
    description: record.description,
    body: record.body,
    contentHash: hashSkillContent(Buffer.from(record.body, 'utf8')),
    filePath: `${USER_SKILL_FILE_PATH_PREFIX}/${record.id}`,
    source: USER_SKILL_SOURCE,
    metadata: {},
    frontmatter: {},
  };
}

export async function listUserSkillsAsManagedSkills(
  db: DatabaseAdapter,
  userId: string,
): Promise<Skill[]> {
  if (!userSkillAuthoringEnabled()) return [];
  const rows = await db.query<UserSkillRow>(
    `select id, name, description, body, created_at, updated_at
       from user_skills
      where user_id = $1
      order by name asc`,
    [userId],
  );
  return rows.map((row) => toManagedSkillFromUserSkill(toRecord(row)));
}

export function toUserSkillSummary(record: UserSkillRecord): UserSkillSummary {
  return {
    name: record.name,
    description: record.description,
    source: 'personal',
    lifecycle: 'included',
    downloadable: false,
    editable: true,
    origin: personalOrigin(record.createdAt),
  };
}

export async function listUserSkills(
  db: DatabaseAdapter,
  userId: string,
): Promise<UserSkillSummary[]> {
  if (!userSkillAuthoringEnabled()) return [];
  const rows = await db.query<UserSkillSummaryRow>(
    `select name, description, created_at
       from user_skills
      where user_id = $1
      order by name asc`,
    [userId],
  );
  return rows.map((row) => ({
    name: row.name,
    description: row.description,
    source: 'personal',
    lifecycle: 'included',
    downloadable: false,
    editable: true,
    origin: personalOrigin(row.created_at),
  }));
}

export async function findUserSkillByName(
  db: DatabaseAdapter,
  userId: string,
  name: string,
): Promise<UserSkillRecord | null> {
  if (!userSkillAuthoringEnabled()) return null;
  const rows = await db.query<UserSkillRow>(
    `select id, name, description, body, created_at, updated_at
       from user_skills
      where user_id = $1 and name = $2`,
    [userId, name],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

async function insertUserSkillFiles(
  tx: DatabaseAdapter,
  userId: string,
  skillId: string,
  files: readonly UserSkillFileInput[],
): Promise<void> {
  for (const file of sortedFiles(files)) {
    await tx.execute(
      `insert into user_skill_files
         (skill_id, user_id, path, content, content_hash, byte_size, created_by)
       values ($1, $2, $3, $4, $5, $6, $2)`,
      [
        skillId,
        userId,
        file.path,
        file.content,
        createHash(UPLOAD_HASH_ALGORITHM).update(file.content, 'utf8').digest('hex'),
        Buffer.byteLength(file.content, 'utf8'),
      ],
    );
  }
}

export async function createUserSkill(
  db: DatabaseAdapter,
  userId: string,
  draft: SkillDraft,
  upload?: UserSkillUpload,
): Promise<UserSkillRecord> {
  requireUserSkillAuthoring();
  requireValidDraft(draft, upload);
  const name = draft.name.trim();
  const insertSkill = async (tx: DatabaseAdapter): Promise<UserSkillRecord> => {
    const rows = await tx.query<UserSkillRow>(
      `insert into user_skills (user_id, name, description, body)
       values ($1, $2, $3, $4)
       returning id, name, description, body, created_at, updated_at`,
      [userId, name, draft.description.trim(), draft.body.trim()],
    );
    return toRecord(rows[0]!);
  };
  const files = upload?.files ?? [];
  try {
    if (files.length === 0) return await insertSkill(db);
    return await db.transaction(async (tx) => {
      const record = await insertSkill(tx);
      await insertUserSkillFiles(tx, userId, record.id, files);
      return record;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict(`You already have a skill named "${name}".`);
    }
    throw error;
  }
}

export async function updateUserSkill(
  db: DatabaseAdapter,
  userId: string,
  currentName: string,
  draft: SkillDraft,
): Promise<UserSkillRecord | null> {
  requireUserSkillAuthoring();
  requireValidDraft(draft);
  const name = draft.name.trim();
  try {
    const rows = await db.query<UserSkillRow>(
      `update user_skills
          set name = $3, description = $4, body = $5, updated_at = now()
        where user_id = $1 and name = $2
        returning id, name, description, body, created_at, updated_at`,
      [userId, currentName, name, draft.description.trim(), draft.body.trim()],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError.conflict(`You already have a skill named "${name}".`);
    }
    throw error;
  }
}

export async function deleteUserSkill(
  db: DatabaseAdapter,
  userId: string,
  name: string,
): Promise<boolean> {
  requireUserSkillAuthoring();
  const affected = await db.execute(`delete from user_skills where user_id = $1 and name = $2`, [
    userId,
    name,
  ]);
  return affected > 0;
}

async function listUserSkillFiles(
  db: DatabaseAdapter,
  userId: string,
  skillId: string,
): Promise<SkillFileInventoryEntry[]> {
  const rows = await db.query<{ path: string; byte_size: number | string }>(
    `select path, byte_size
       from user_skill_files
      where user_id = $1 and skill_id = $2
      order by path asc
      limit $3`,
    [userId, skillId, SKILL_COMPANION_MAX_FILES],
  );
  return rows.map((row) => ({ path: row.path, size: Number(row.byte_size) }));
}

async function readUserSkillFile(
  db: DatabaseAdapter,
  userId: string,
  skillId: string,
  path: string,
): Promise<string | null> {
  const rows = await db.query<{ content: string }>(
    `select content
       from user_skill_files
      where user_id = $1 and skill_id = $2 and path = $3`,
    [userId, skillId, path],
  );
  return rows[0]?.content ?? null;
}

const FILE_NOT_FOUND: SkillFileReadOutcome = { ok: false, reason: 'not_found' };
const FILE_TOO_LARGE: SkillFileReadOutcome = { ok: false, reason: 'too_large' };

export async function findUserSkillWithFiles(
  db: DatabaseAdapter,
  userId: string,
  name: string,
): Promise<SkillWithFileAccess | null> {
  const record = await findUserSkillByName(db, userId, name);
  if (!record) return null;
  let listing: Promise<SkillFileInventoryEntry[]> | null = null;
  const list = () => (listing ??= listUserSkillFiles(db, userId, record.id));
  return {
    skill: toManagedSkillFromUserSkill(record),
    access: {
      async listFiles() {
        return list();
      },
      async readFile(_skill, path) {
        const file = (await list()).find((candidate) => candidate.path === path);
        if (!file) return FILE_NOT_FOUND;
        if (file.size > SKILL_COMPANION_MAX_BYTES) return FILE_TOO_LARGE;
        const content = await readUserSkillFile(db, userId, record.id, path);
        return content === null ? FILE_NOT_FOUND : { ok: true, path, content };
      },
    },
  };
}
