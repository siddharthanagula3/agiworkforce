import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import type { OrganizationPluginsPublishResponse } from '@agiworkforce/cloud-contracts';

import { requireWorkspaceConsolePermission } from '@/app/api/settings/organization/workspace-access';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { publishOrganizationPlugins } from '@/lib/services/organization-plugin-service';
import { personalSkillAsWorkspacePlugin } from '@/lib/services/skill-workspace-share-service';
import { requireSkillName } from '../../skill-name-param';

export const runtime = 'nodejs';

const MANAGE_PERMISSION = 'policy.manage';

async function handlePublish(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'settings-org-patch');
  if (limited) return limited;
  const name = requireSkillName((await context.params).name);
  const { userId, organizationId } = await requireWorkspaceConsolePermission(
    request,
    MANAGE_PERMISSION,
    'Only a workspace admin can share a skill with everyone in the workspace.',
  );
  const { db } = await getUserScopedDb(request);
  const plugin = await personalSkillAsWorkspacePlugin(db, userId, name);
  const published = await publishOrganizationPlugins(getNeonDb(), {
    organizationId,
    actorUserId: userId,
    plugins: [plugin],
    acknowledgedScans: request.nextUrl.searchParams.getAll('acknowledgedScan'),
    initialPreference: 'available',
  });
  for (const entry of published) {
    await recordAuditEvent({
      userId,
      eventType: 'admin_policy_changed',
      organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'organization_plugin',
        resourceId: entry.id,
        resourceName: entry.pluginKey,
        status: 'published',
        source: 'personal_skill',
        count: entry.skills.length,
      },
    });
  }
  const body: OrganizationPluginsPublishResponse = { plugins: published };
  return NextResponse.json(body, { status: 201 });
}

export const POST = withErrorHandler(handlePublish);
