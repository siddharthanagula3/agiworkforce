import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SharedSessionViewer } from '@/features/chat/components/share/SharedSessionViewer';
import type { SharedSession } from '@/features/chat/components/share/SharedSessionViewer';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import {
  SHARE_TOKEN_REGEX,
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
  readSharedSessionSharerName,
  type OrgReadableSession,
} from '@/lib/services/org-shared-session-service';

interface Props {
  params: Promise<{ token: string }>;
}

export const runtime = 'nodejs';

/**
 * Two audiences, in the order that leaks the least.
 *
 * The anonymous lookup answers only for rows still marked `public`, so a
 * workspace-only conversation never reaches this page through the token alone.
 * It then falls through to the signed-in read, where 0186's RLS policy, not
 * this function, decides whether the viewer's organization holds a grant. A
 * signed-out visitor gets `null` from that second call and the same 404 as a
 * revoked link.
 */
async function readSessionForViewer(
  token: string,
): Promise<{ session: OrgReadableSession; sharedBy: string | null } | null> {
  const publiclyVisible = await getPublicSharedSessionByToken(getNeonDb(), token).catch(() => null);
  if (publiclyVisible) return { session: publiclyVisible, sharedBy: null };

  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return null;
  const session = await getOrgReadableSessionByToken(scoped.db, token).catch(() => null);
  if (!session) return null;
  const sharedBy =
    session.visibility === 'organization'
      ? await readSharedSessionSharerName(getNeonDb(), session.ownerUserId).catch(() => null)
      : null;
  return { session, sharedBy };
}

function toViewerSession(session: OrgReadableSession, sharedBy: string | null): SharedSession {
  return {
    title: session.title,
    ...(sharedBy ? { shared_by: sharedBy } : {}),
    ...(session.modelId ? { model_id: session.modelId } : {}),
    ...(session.provider ? { provider: session.provider } : {}),
    messages: (Array.isArray(session.messages)
      ? session.messages
      : []) as SharedSession['messages'],
    total_messages: session.messageCount,
    expires_at: session.expiresAt,
    created_at: session.createdAt,
  };
}

function isLive(session: OrgReadableSession): boolean {
  return new Date(session.expiresAt).getTime() > Date.now();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!SHARE_TOKEN_REGEX.test(token)) {
    return { title: 'Shared Session - AGI', robots: { index: false, follow: false } };
  }

  const session = await getPublicSharedSessionByToken(getNeonDb(), token).catch(() => null);
  const live = session && isLive(session) ? session : null;

  return {
    title: live ? `${live.title} - AGI` : 'Shared Session - AGI',
    description: live ? `${live.messageCount} message conversation shared from AGI` : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function SharedSessionPage({ params }: Props) {
  const { token } = await params;

  if (!SHARE_TOKEN_REGEX.test(token)) {
    notFound();
  }

  const read = await readSessionForViewer(token);

  if (!read || !isLive(read.session)) {
    notFound();
  }

  return (
    <>
      <SharedSessionViewer session={toViewerSession(read.session, read.sharedBy)} token={token} />
      <ReportContentLink publicPath={`/share/${token}`} />
    </>
  );
}
