import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  isPlatformAdmin,
  PLATFORM_ADMIN_ENV_VAR,
} from '@/features/admin/lib/platform-admin-access';
import { SupportHandoffQueuePanel } from '@/features/support/components/SupportHandoffQueuePanel';
import { getRequestIdentity } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live support handoff',
  description: 'Take a waiting visitor and answer them in the same conversation they started.',
  robots: { index: false, follow: false },
};

/**
 * Same allowlist as the operator dashboard, checked here as well as in the API:
 * a page that renders is not authorisation, only the route is.
 */
export default async function SupportHandoffOperatorPage() {
  const { subject: userId } = await getRequestIdentity();
  if (!userId) redirect('/login?redirectTo=/operator/support');
  if (!isPlatformAdmin(userId, process.env[PLATFORM_ADMIN_ENV_VAR])) notFound();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <div>
        <Link href="/operator" className="text-xs text-muted-foreground hover:underline">
          Operator dashboard
        </Link>
        <h1 className="mt-2 text-xl font-medium">Live support handoff</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visitors who asked for a person and are still inside their wait deadline.
        </p>
      </div>
      <SupportHandoffQueuePanel />
    </main>
  );
}
