import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { assertAccountActive } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { resolveOrgMembership, type OrgRole } from '@/lib/services/org-sharing-service';
import { WorkspaceConsoleShell } from '@/features/workspace-console/components/WorkspaceConsoleShell';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

/**
 * The customer-facing workspace administration console.
 *
 * Distinct from `/admin`, which is the internal platform operator console and
 * is gated on Clerk publicMetadata. This segment is gated on an organization
 * role a customer grants themselves. Confusing the two would either lock an
 * enterprise buyer out of administering their own workspace, or expose platform
 * surfaces to them.
 *
 * Every page below re-derives authorization from its own API call. The role
 * resolved here shapes the frame, which is why a member reaching a page they
 * cannot administer sees a stated denial rather than an empty or broken panel.
 */
export default async function WorkspaceConsoleLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    redirect('/login?redirectTo=/workspace');
  }

  await requireCurrentTermsAcceptance(userId, '/workspace');

  try {
    await assertAccountActive(userId);
  } catch (error) {
    logger.warn({ error, userId }, 'Workspace console denied: account is not active');
    redirect('/');
  }

  let role: OrgRole | null = null;
  let organizationId: string | null = null;
  let membershipUnavailable = false;

  try {
    const membership = await resolveOrgMembership(getNeonDb(), userId);
    role = membership?.role ?? null;
    organizationId = membership?.organizationId ?? null;
  } catch (error) {
    // A database fault must read as a database fault. Rendering the
    // "you have no workspace" empty state here would tell an administrator
    // their organization had vanished.
    logger.error({ error, userId }, 'Workspace console could not resolve membership');
    membershipUnavailable = true;
  }

  return (
    <WorkspaceConsoleShell
      role={role}
      organizationId={organizationId}
      membershipUnavailable={membershipUnavailable}
    >
      {children}
    </WorkspaceConsoleShell>
  );
}
