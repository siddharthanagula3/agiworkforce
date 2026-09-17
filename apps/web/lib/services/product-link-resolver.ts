import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ProductLink, ProductLinkUnavailableState } from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';

export type ProductLinkResolution =
  { status: 'ready'; href: string } | { status: ProductLinkUnavailableState };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIBRARY_QUERY_CHARS = 80;
const CHROME_ORIGIN_SURFACE = 'chrome';
const EXPIRED_SCHEDULE_STATUS = 'expired';

type OwnedTable = 'cloud_agent_runs' | 'research_reports' | 'scheduled_tasks' | 'media_assets';

const TABLE_BY_TARGET: Record<ProductLink['target'], OwnedTable> = {
  work: 'cloud_agent_runs',
  'browser-task': 'cloud_agent_runs',
  research: 'research_reports',
  schedule: 'scheduled_tasks',
  file: 'media_assets',
  artifact: 'media_assets',
};

async function existsForAnotherAccount(table: OwnedTable, id: string): Promise<boolean> {
  const rows = await getNeonDb().query<{ found: number }>(
    `select 1 as found from public.${table} where id = $1::uuid limit 1`,
    [id],
  );
  return rows.length > 0;
}

async function missing(link: ProductLink): Promise<ProductLinkResolution> {
  const exists = await existsForAnotherAccount(TABLE_BY_TARGET[link.target], link.id);
  return { status: exists ? 'unauthorized' : 'not_found' };
}

function tasksHref(runId: string): string {
  return `/tasks?${new URLSearchParams({ run: runId }).toString()}`;
}

async function resolveRun(
  db: DatabaseAdapter,
  userId: string,
  link: ProductLink,
): Promise<ProductLinkResolution> {
  const [run] = await db.query<{ id: string; origin_surface: string }>(
    `select id, origin_surface
       from public.cloud_agent_runs
      where id = $1::uuid and user_id = $2
      limit 1`,
    [link.id, userId],
  );
  if (!run) return missing(link);
  if (link.target === 'browser-task' && run.origin_surface !== CHROME_ORIGIN_SURFACE) {
    return { status: 'not_found' };
  }
  return { status: 'ready', href: tasksHref(run.id) };
}

async function resolveResearch(
  db: DatabaseAdapter,
  userId: string,
  link: ProductLink,
): Promise<ProductLinkResolution> {
  const [report] = await db.query<{
    conversation_id: string | null;
    conversation_deleted_at: string | Date | null;
    conversation_exists: boolean;
  }>(
    `select r.conversation_id,
            c.deleted_at as conversation_deleted_at,
            (c.id is not null) as conversation_exists
       from public.research_reports r
       left join public.web_conversations c
         on c.id = r.conversation_id and c.user_id = r.user_id
      where r.id = $1::uuid and r.user_id = $2
      limit 1`,
    [link.id, userId],
  );
  if (!report) return missing(link);
  if (!report.conversation_id || !report.conversation_exists) return { status: 'not_found' };
  if (report.conversation_deleted_at) return { status: 'deleted' };
  return { status: 'ready', href: `/chat/${encodeURIComponent(report.conversation_id)}` };
}

async function resolveSchedule(
  db: DatabaseAdapter,
  userId: string,
  link: ProductLink,
  now: Date,
): Promise<ProductLinkResolution> {
  const [schedule] = await db.query<{
    id: string;
    status: string;
    expires_at: string | Date | null;
  }>(
    `select id, status, expires_at
       from public.scheduled_tasks
      where id = $1::uuid and user_id = $2
      limit 1`,
    [link.id, userId],
  );
  if (!schedule) return missing(link);
  const expiresAt = schedule.expires_at ? new Date(schedule.expires_at) : null;
  if (
    schedule.status === EXPIRED_SCHEDULE_STATUS ||
    (expiresAt !== null && expiresAt.getTime() <= now.getTime())
  ) {
    return { status: 'expired' };
  }
  return {
    status: 'ready',
    href: `/chat/schedules?${new URLSearchParams({ schedule: schedule.id }).toString()}`,
  };
}

async function resolveMedia(
  db: DatabaseAdapter,
  userId: string,
  link: ProductLink,
): Promise<ProductLinkResolution> {
  const [asset] = await db.query<{
    id: string;
    surface: string;
    filename: string | null;
    prompt: string | null;
    deleted_at: string | Date | null;
  }>(
    `select id,
            coalesce(metadata->>'surface', 'file') as surface,
            metadata->>'filename' as filename,
            prompt,
            deleted_at
       from public.media_assets
      where id = $1::uuid and user_id = $2
      limit 1`,
    [link.id, userId],
  );
  if (!asset) return missing(link);
  if (asset.deleted_at) return { status: 'deleted' };

  const params = new URLSearchParams();
  if (asset.surface === 'artifact') params.set('surface', 'artifact');
  params.set('item', asset.id);
  const search = (asset.filename?.trim() || asset.prompt?.trim() || '').slice(
    0,
    MAX_LIBRARY_QUERY_CHARS,
  );
  if (search) params.set('q', search);
  return { status: 'ready', href: `/chat/library?${params.toString()}` };
}

export async function resolveProductLink(
  db: DatabaseAdapter,
  userId: string,
  link: ProductLink,
  now: Date = new Date(),
): Promise<ProductLinkResolution> {
  if (!UUID_RE.test(link.id)) return { status: 'not_found' };
  switch (link.target) {
    case 'work':
    case 'browser-task':
      return resolveRun(db, userId, link);
    case 'research':
      return resolveResearch(db, userId, link);
    case 'schedule':
      return resolveSchedule(db, userId, link, now);
    case 'file':
    case 'artifact':
      return resolveMedia(db, userId, link);
  }
}
