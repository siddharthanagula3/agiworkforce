'use client';

import type { ReactNode } from 'react';

import { useEmbeddedPage } from '@shared/components/layout/EmbeddedPage';

export function EmbeddedVariant({
  standard,
  embedded,
}: {
  standard: ReactNode;
  embedded: ReactNode;
}) {
  return useEmbeddedPage() ? embedded : standard;
}
