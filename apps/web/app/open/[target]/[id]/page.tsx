import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { isProductLinkId, isProductLinkTarget, productLinkPath } from '@agiworkforce/types';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { ProductLinkUnavailable } from '@/features/notifications/components/ProductLinkUnavailable';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';
import { resolveProductLink } from '@/lib/services/product-link-resolver';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Opening link',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ target: string; id: string }>;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export default async function ProductLinkRoute({ params }: Props) {
  const { target, id: rawId } = await params;
  const id = safeDecode(rawId);
  if (!isProductLinkTarget(target) || id === null || !isProductLinkId(id)) notFound();

  const scoped = await getCurrentUserRlsDb();
  if (!scoped) {
    redirect(`/login?redirectTo=${encodeURIComponent(productLinkPath(target, id))}`);
  }

  const resolution = await resolveProductLink(scoped.db, scoped.userId, { target, id });
  if (resolution.status === 'ready') redirect(resolution.href);

  return (
    <WebAppShell>
      <ProductLinkUnavailable target={target} state={resolution.status} />
    </WebAppShell>
  );
}
