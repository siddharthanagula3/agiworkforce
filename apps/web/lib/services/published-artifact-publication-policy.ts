import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { moderateManagedPrompt } from '@/lib/moderation';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';

function refuseModeratedPublication(userId: string, title: string, content: string): void {
  const moderation = moderateManagedPrompt({
    userId,
    segments: [title, content],
    surface: 'published-artifact',
  });
  if (!moderation.allowed) {
    throw createError.validation(
      'This artifact cannot be published because it violates the AGI Workforce usage policy.',
    );
  }
}

/**
 * The workspaces this publication's content is stored under: the conversation
 * it will be linked to (the request's, else the one an earlier publish kept)
 * and any workspace it is already shared into.
 */
async function readPublicationOrganizationIds(
  db: DatabaseAdapter,
  input: { userId: string; artifactId: string; conversationId: string | null },
): Promise<(string | null)[]> {
  const rows = await db.query<{ organization_id: string | null }>(
    `select conversation.organization_id
       from public.web_conversations conversation
      where conversation.user_id = $1
        and conversation.id = coalesce(
          $3::uuid,
          (select publication.conversation_id
             from public.published_artifacts publication
            where publication.user_id = $1 and publication.artifact_id = $2
            limit 1)
        )
     union all
     select share.organization_id
       from public.organization_shared_artifacts share
       join public.published_artifacts publication
         on publication.id = share.published_artifact_id
      where publication.user_id = $1 and publication.artifact_id = $2`,
    [input.userId, input.artifactId, input.conversationId],
  );
  return rows.map((row) => row.organization_id ?? null);
}

export async function preparePublishedArtifactPublication(
  db: DatabaseAdapter,
  input: {
    request: NextRequest;
    userId: string;
    organizationId: string | null;
    artifactId: string;
    conversationId: string | null;
    title: string;
    content: string;
  },
): Promise<{ content: string } | Response> {
  const sharingGateResponse = await buildExternalSharingGateResponse(
    input.userId,
    input.request,
    await readPublicationOrganizationIds(db, input),
  );
  if (sharingGateResponse) return sharingGateResponse;

  refuseModeratedPublication(input.userId, input.title, input.content);

  const outbound = await inspectOutboundContent({
    channel: 'artifact_publish',
    value: input.content,
    userId: input.userId,
    organizationId: input.organizationId,
    resourceId: input.artifactId,
    resolveMode: () => resolveSecretHandlingPolicy(db, input.userId),
  });
  if (outbound.action === 'blocked') {
    throw createError.validation(outbound.message);
  }
  return { content: outbound.value };
}
