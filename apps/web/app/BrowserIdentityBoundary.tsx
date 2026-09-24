'use client';

import { lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { needsBrowserIdentityProvider } from '@/lib/identity/browser-provider-routes';

const BrowserIdentityProvider = lazy(() => import('@/lib/identity/provider'));

export function BrowserIdentityBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!needsBrowserIdentityProvider(pathname)) return children;
  return (
    <Suspense fallback={null}>
      <BrowserIdentityProvider>{children}</BrowserIdentityProvider>
    </Suspense>
  );
}
