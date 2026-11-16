'use client';

import type { ReactNode } from 'react';
import { useEmbeddedPage } from '@shared/components/layout/EmbeddedPage';

export function DocsShellFrame({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  const embedded = useEmbeddedPage();
  return (
    <div className="dx-shell" data-embedded={embedded ? 'true' : undefined}>
      {embedded ? null : navigation}
      {children}
    </div>
  );
}
