import type { ReactNode } from 'react';

import { AuthShell } from './AuthShell';

export function AuthLayout({
  children,
  embedded = false,
  scene = false,
}: {
  children: ReactNode;
  embedded?: boolean;
  scene?: boolean;
}) {
  return (
    <AuthShell embedded={embedded} scene={scene}>
      {children}
    </AuthShell>
  );
}
