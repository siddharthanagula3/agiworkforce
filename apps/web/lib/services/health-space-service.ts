import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { HealthSpaceUnavailableReason } from '@agiworkforce/cloud-contracts';
import { conversationHoldsGoogleUserData } from '@/lib/connectors/google-user-data';
import { isConnectorOAuthConfigured } from '@/lib/connectors/oauth-registry';
import {
  HEALTHEX_CONNECTOR_ID,
  sensitiveDataRegionRefusal,
} from '@/lib/connectors/sensitive-data-connectors';
import { HEALTH_SPACE_KIND } from '@/lib/health-space';

type HealthSpaceDb = Pick<DatabaseAdapter, 'query'>;

const HEALTH_SPACE_NAME = 'Health';
const HEALTH_SPACE_CONNECTOR_IDS: ReadonlySet<string> = new Set([HEALTHEX_CONNECTOR_ID]);

export function isHealthSpaceConnector(connectorId: string): boolean {
  return HEALTH_SPACE_CONNECTOR_IDS.has(connectorId);
}

export function healthSpaceUnavailableReason(input: {
  request: { headers: { get(name: string): string | null } };
  organizationId: string | null;
}): HealthSpaceUnavailableReason | null {
  if (!isConnectorOAuthConfigured(HEALTHEX_CONNECTOR_ID)) return 'not_configured';
  if (sensitiveDataRegionRefusal(HEALTHEX_CONNECTOR_ID, input.request)) return 'region';
  if (input.organizationId) return 'workspace';
  return null;
}

export async function findHealthSpaceId(db: HealthSpaceDb, userId: string): Promise<string | null> {
  const [row] = await db.query<{ id: string }>(
    `select id::text as id
       from user_projects
      where user_id = $1
        and organization_id is null
        and space_kind = $2
        and deleted_at is null
      limit 1`,
    [userId, HEALTH_SPACE_KIND],
  );
  return row?.id ?? null;
}

export async function ensureHealthSpace(db: HealthSpaceDb, userId: string): Promise<string> {
  const [created] = await db.query<{ id: string }>(
    `insert into user_projects (user_id, organization_id, name, space_kind)
     values ($1, null, $2, $3)
     on conflict (user_id) where space_kind = 'health' and deleted_at is null do nothing
     returning id::text as id`,
    [userId, HEALTH_SPACE_NAME, HEALTH_SPACE_KIND],
  );
  if (created) return created.id;
  const existing = await findHealthSpaceId(db, userId);
  if (!existing) throw new Error('The Health space could not be created');
  return existing;
}

export async function conversationHealthSpaceId(
  db: HealthSpaceDb,
  userId: string,
  conversationId: string,
): Promise<string | null> {
  const [row] = await db.query<{ health_space_id: string }>(
    `select p.id::text as health_space_id
       from web_conversations c
       join user_projects p
         on p.id::text = c.project_id
        and p.user_id = c.user_id
      where c.id = $1::uuid
        and c.user_id = $2
        and p.organization_id is null
        and p.space_kind = $3
      limit 1`,
    [conversationId, userId, HEALTH_SPACE_KIND],
  );
  return row?.health_space_id ?? null;
}

export async function conversationKeepsOutOfTraining(
  db: HealthSpaceDb,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  try {
    return (
      (await conversationHealthSpaceId(db, userId, conversationId)) !== null ||
      (await conversationHoldsGoogleUserData(db, userId, conversationId))
    );
  } catch {
    return true;
  }
}
