'use client';

import { lazy, Suspense } from 'react';
import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { routeNeedsBrowserIdentity } from '@/lib/identity/browser-provider-routes';

const BrowserIdentityProvider = lazy(() => import('@/lib/identity/provider'));

export function BrowserIdentityBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const renderedSegments = useSelectedLayoutSegments();
  if (!routeNeedsBrowserIdentity(pathname, renderedSegments)) return children;
  return (
    <Suspense fallback={null}>
      <BrowserIdentityProvider>{children}</BrowserIdentityProvider>
    </Suspense>
  );
}
