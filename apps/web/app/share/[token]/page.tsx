import { getNeonDb } from '@/lib/server/neon-db';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SharedSessionViewer } from '@/features/chat/components/share/SharedSessionViewer';
import type { SharedSession } from '@/features/chat/components/share/SharedSessionViewer';
import { ExpiredShareBanner } from '@/features/chat/components/share/ExpiredShareBanner';
import { ReportContentLink } from '@/app/copyright/report/ReportContentLink';
import {
  SHARE_TOKEN_REGEX,
  getOrgReadableSessionByToken,
  getPublicSharedSessionByToken,
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
async function readSessionForViewer(token: string): Promise<OrgReadableSession | null> {
  const publiclyVisible = await getPublicSharedSessionByToken(getNeonDb(), token).catch(() => null);
  if (publiclyVisible) return publiclyVisible;

  const scoped = await getCurrentUserRlsDb().catch(() => null);
  if (!scoped) return null;
  return getOrgReadableSessionByToken(scoped.db, token).catch(() => null);
}

function toViewerSession(session: OrgReadableSession): SharedSession {
  return {
    title: session.title,
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  if (!SHARE_TOKEN_REGEX.test(token)) {
    return { title: 'Shared Session - AGI', robots: { index: false, follow: false } };
  }

  const session = await getPublicSharedSessionByToken(getNeonDb(), token).catch(() => null);

  return {
    title: session ? `${session.title} - AGI` : 'Shared Session - AGI',
    description: session
      ? `${session.messageCount} message conversation shared from AGI`
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function SharedSessionPage({ params }: Props) {
  const { token } = await params;

  if (!SHARE_TOKEN_REGEX.test(token)) {
    notFound();
  }

  const session = await readSessionForViewer(token);

  if (!session) {
    notFound();
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    return <ExpiredShareBanner />;
  }

  return (
    <>
      <SharedSessionViewer session={toViewerSession(session)} token={token} />
      <ReportContentLink publicPath={`/share/${token}`} />
    </>
  );
}
