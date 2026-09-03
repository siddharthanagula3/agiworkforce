import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { validateSkillDraft, type SkillDraft } from '@agiworkforce/skills/validation';
import { createError } from '@/lib/errors';
import { userSkillAuthoringEnabled } from './user-skill-authoring';

const PG_UNIQUE_VIOLATION = '23505';
const USER_SKILL_AUTHORING_DISABLED_MESSAGE = 'Skill authoring is not available.';

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
}

interface UserSkillRow {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: string;
  updated_at: string;
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

function requireValidDraft(draft: SkillDraft): void {
  const result = validateSkillDraft(draft);
  if (!result.ok) throw createError.validation(result.errors.join(' '));
}

function requireUserSkillAuthoringEnabled(): void {
  if (!userSkillAuthoringEnabled()) {
    throw createError.notFound(USER_SKILL_AUTHORING_DISABLED_MESSAGE);
  }
}

export function toUserSkillSummary(record: UserSkillRecord): UserSkillSummary {
  return {
    name: record.name,
    description: record.description,
    source: 'personal',
    lifecycle: 'included',
    downloadable: false,
    editable: true,
  };
}

export async function listUserSkills(
  db: DatabaseAdapter,
  userId: string,
): Promise<UserSkillRecord[]> {
  if (!userSkillAuthoringEnabled()) return [];
  const rows = await db.query<UserSkillRow>(
    `select id, name, description, body, created_at, updated_at
       from user_skills
      where user_id = $1
      order by name asc`,
    [userId],
  );
  return rows.map(toRecord);
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
  requireUserSkillAuthoringEnabled();
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
  requireUserSkillAuthoringEnabled();
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
  requireUserSkillAuthoringEnabled();
  const affected = await db.execute(`delete from user_skills where user_id = $1 and name = $2`, [
    userId,
    name,
  ]);
  return affected > 0;
}
