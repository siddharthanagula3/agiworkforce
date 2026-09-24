'use client';

import type { ReactNode } from 'react';
import { QueryProvider } from '@shared/stores/query-client';

export default function QueryRuntimeProvider({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
