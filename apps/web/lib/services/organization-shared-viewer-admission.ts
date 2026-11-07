import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { assertTenantNotLockedDown } from '@/lib/feature-flags/tenant-lockdown';
import type { PublishedArtifactVisibility } from './published-artifact-service';

export async function assertOrganizationSharedViewerAdmission(
  db: DatabaseAdapter,
  viewerUserId: string,
  resource: {
    type: 'session' | 'artifact';
    id: string;
    ownerUserId: string;
    visibility: PublishedArtifactVisibility;
  },
): Promise<void> {
  if (resource.ownerUserId === viewerUserId || resource.visibility !== 'organization') return;

  const [grant] = await db.query<{ organization_id: string }>(
    resource.type === 'session'
      ? `select organization_id from public.organization_shared_sessions
          where shared_session_id = $1 limit 1`
      : `select organization_id from public.organization_shared_artifacts
          where published_artifact_id = $1 limit 1`,
    [resource.id],
  );
  if (!grant?.organization_id) throw createError.forbidden('Shared resource is unavailable.');
  await assertTenantNotLockedDown(grant.organization_id);
}
