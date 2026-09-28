import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { DeveloperProject } from '@/features/developers/types';
import { createError } from '@/lib/errors';

export const DEVELOPER_PROJECT_LIMIT = 100;
export const DEVELOPER_PROJECT_NAME_MAX = 100;

const UNIQUE_VIOLATION = '23505';

interface DeveloperProjectRow {
  id: string;
  name: string;
  archived_at: string | Date | null;
  created_at: string | Date;
}

const PROJECT_COLUMNS = 'id, name, archived_at, created_at';

function isoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toProject(row: DeveloperProjectRow): DeveloperProject {
  return {
    id: row.id,
    name: row.name,
    archivedAt: isoOrNull(row.archived_at),
    createdAt: isoOrNull(row.created_at) ?? '',
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION;
}

function duplicateNameError(name: string) {
  return createError.conflict(`You already have a project named ${name}.`);
}

export async function listDeveloperProjects(
  db: DatabaseAdapter,
  userId: string,
): Promise<DeveloperProject[]> {
  const rows = await db.query<DeveloperProjectRow>(
    `select ${PROJECT_COLUMNS}
       from public.developer_projects
      where user_id = $1
      order by archived_at is not null, created_at asc`,
    [userId],
  );
  return rows.map(toProject);
}

export async function readLiveDeveloperProject(
  db: DatabaseAdapter,
  userId: string,
  projectId: string,
): Promise<DeveloperProject | null> {
  const [row] = await db.query<DeveloperProjectRow>(
    `select ${PROJECT_COLUMNS}
       from public.developer_projects
      where id = $1
        and user_id = $2
        and archived_at is null
      limit 1`,
    [projectId, userId],
  );
  return row ? toProject(row) : null;
}

export async function createDeveloperProject(
  db: DatabaseAdapter,
  userId: string,
  input: { name: string },
): Promise<DeveloperProject> {
  const name = input.name.trim();
  const [count] = await db.query<{ live: string | number }>(
    `select count(*) as live
       from public.developer_projects
      where user_id = $1
        and archived_at is null`,
    [userId],
  );
  if (Number(count?.live ?? 0) >= DEVELOPER_PROJECT_LIMIT) {
    throw createError.validation(
      `You can have ${DEVELOPER_PROJECT_LIMIT} projects at once. Archive one to make another.`,
    );
  }

  try {
    const [row] = await db.query<DeveloperProjectRow>(
      `insert into public.developer_projects (user_id, name)
       values ($1, $2)
       returning ${PROJECT_COLUMNS}`,
      [userId, name],
    );
    if (!row) throw createError.internal('The project could not be created.');
    return toProject(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError(name);
    throw error;
  }
}

export async function updateDeveloperProject(
  db: DatabaseAdapter,
  userId: string,
  projectId: string,
  patch: { name: string },
): Promise<DeveloperProject> {
  const name = patch.name.trim();
  try {
    const [row] = await db.query<DeveloperProjectRow>(
      `update public.developer_projects
          set name = $3
        where id = $1
          and user_id = $2
          and archived_at is null
        returning ${PROJECT_COLUMNS}`,
      [projectId, userId, name],
    );
    if (!row) throw createError.notFound('That project does not exist or is archived.');
    return toProject(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateNameError(name);
    throw error;
  }
}

export async function archiveDeveloperProject(
  db: DatabaseAdapter,
  userId: string,
  projectId: string,
): Promise<{ project: DeveloperProject; revokedKeyIds: string[] }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<DeveloperProjectRow>(
      `update public.developer_projects
          set archived_at = now()
        where id = $1
          and user_id = $2
          and archived_at is null
        returning ${PROJECT_COLUMNS}`,
      [projectId, userId],
    );
    if (!row) throw createError.notFound('That project does not exist or is already archived.');
    const revoked = await tx.query<{ id: string }>(
      `update public.api_keys
          set revoked_at = now()
        where project_id = $1
          and user_id = $2
          and revoked_at is null
        returning id`,
      [projectId, userId],
    );
    return { project: toProject(row), revokedKeyIds: revoked.map((key) => key.id) };
  });
}
