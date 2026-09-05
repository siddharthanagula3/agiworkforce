import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { assertAccountActive } from '@/lib/api-auth';
import { getIdentityUser, getRequestIdentity } from '@/lib/server/identity';
import { logger } from '@/lib/logger';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { hasAdminConsoleAccess } from '@/features/admin/lib/admin-console-access';
import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();

  if (!userId) {
    return redirect('/login?redirectTo=/admin');
  }

  await requireCurrentTermsAcceptance(userId, '/admin');

  // Two populations share this segment: a platform operator, who holds no org
  // role at all and owns the console at `/admin`, and an org admin/owner, whose
  // self-service role earns only the org-scoped pages under it (directory
  // sync). Demanding the org role here would lock the operator out of their own
  // console, so the segment admits either and each page gates itself.
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) {
    const user = await getIdentityUser(userId);
    if (!hasAdminConsoleAccess(user?.publicMetadata)) {
      redirect('/');
    }
  }

  let accountActive = true;
  try {
    await assertAccountActive(userId as string);
  } catch (error) {
    accountActive = false;
    logger.warn({ error, userId }, 'Admin console denied: account is not active');
  }

  if (!accountActive) {
    redirect('/');
  }

  return children;
}
