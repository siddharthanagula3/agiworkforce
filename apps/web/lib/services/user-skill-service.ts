import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { hashSkillContent, type Skill } from '@agiworkforce/skills';
import { validateSkillDraft, type SkillDraft } from '@agiworkforce/skills/validation';
import { scanPluginPackage } from '@agiworkforce/client-runtime/plugins';
import type { ManagedSkillOrigin } from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';
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

function requireValidDraft(draft: SkillDraft): void {
  const result = validateSkillDraft(draft);
  if (!result.ok) throw createError.validation(result.errors.join(' '));
  const scan = scanPluginPackage([
    {
      path: SKILL_SCAN_PATH,
      content: `${draft.name}\n${draft.description}\n${draft.body}`,
    },
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

export async function createUserSkill(
  db: DatabaseAdapter,
  userId: string,
  draft: SkillDraft,
): Promise<UserSkillRecord> {
  requireUserSkillAuthoring();
  requireValidDraft(draft);
  const name = draft.name.trim();
  try {
    const rows = await db.query<UserSkillRow>(
      `insert into user_skills (user_id, name, description, body)
       values ($1, $2, $3, $4)
       returning id, name, description, body, created_at, updated_at`,
      [userId, name, draft.description.trim(), draft.body.trim()],
    );
    return toRecord(rows[0]!);
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
